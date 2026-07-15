import { NextRequest, NextResponse } from 'next/server'
import { eq, and, or, inArray, isNull } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest, profile, user, course } from '@/lib/db/schema'
import { notify } from '@/lib/notifications/notify'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import {
  withAuth,
  withCsrf,
  ForbiddenError,
  ValidationError,
  NotFoundError,
} from '@/lib/api/middleware'
import { parseJson } from '@/lib/api/parse'
import { requestedDateFromString, slotInstants } from '@/lib/one-on-one/time'
import { CORE_BOOKING_COLUMNS, CORE_BOOKING_RETURNING } from '@/lib/one-on-one/columns'
import { getOrCreateConversation } from '@/lib/messaging/conversation'
import { findConflicts } from '@/lib/schedule/conflicts'
import { expireOverdueOneOnOneBookings } from '@/lib/one-on-one/expire'
import { completeFinishedOneOnOneSessions } from '@/lib/one-on-one/complete'
import { unpaidSeriesTotal } from '@/lib/one-on-one/series-total'
import {
  isSlotWithinStudentAvailability,
  studentHasAvailabilityConfigured,
} from '@/lib/student-availability'

const requestSchema = z.object({
  tutorId: z.string().min(1),
  proposedSlots: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
        startTime: z.string().regex(/^\d{2}:\d{2}$/), // HH:mm
        endTime: z.string().regex(/^\d{2}:\d{2}$/), // HH:mm
      })
    )
    .min(1)
    .max(20),
  duration: z.number().min(30).max(180), // minutes: 30-180
  studentNotes: z.string().max(1000).optional(),
  // Optional: a published course of the tutor this session is about.
  courseId: z.string().min(1).optional(),
})

export const POST = withCsrf(
  withAuth(async (request: NextRequest, session) => {
    if (session.user.role !== 'STUDENT') {
      throw new ForbiddenError('Only students can request one-on-one sessions')
    }

    const validated = await parseJson(request, requestSchema)

    // Get tutor profile to check rate and availability
    const tutorProfile = await drizzleDb.query.profile.findFirst({
      where: eq(profile.userId, validated.tutorId),
      columns: {
        hourlyRate: true,
        oneOnOneEnabled: true,
        oneOnOneFree: true,
        oneOnOneRecurringEnabled: true,
        bufferMinutes: true,
        currency: true,
        timezone: true,
      },
    })

    if (!tutorProfile) throw new NotFoundError('Tutor not found')

    if (!tutorProfile.oneOnOneEnabled) {
      throw new ValidationError('Tutor does not offer one-on-one sessions')
    }

    // Recurring series are only allowed when the tutor opts in.
    if (tutorProfile.oneOnOneRecurringEnabled === false && validated.proposedSlots.length > 1) {
      throw new ValidationError('This tutor only accepts single-session bookings.')
    }

    // Free tutors need no rate; paid tutors must have one set.
    if (!tutorProfile.oneOnOneFree && (!tutorProfile.hourlyRate || tutorProfile.hourlyRate <= 0)) {
      throw new ValidationError('Tutor has not set an hourly rate yet. Please check back later.')
    }

    // Check for existing pending request with this tutor
    const existingRequest = await drizzleDb.query.oneOnOneBookingRequest.findFirst({
      where: and(
        eq(oneOnOneBookingRequest.tutorId, validated.tutorId),
        eq(oneOnOneBookingRequest.studentId, session.user.id),
        or(
          eq(oneOnOneBookingRequest.status, 'PENDING'),
          eq(oneOnOneBookingRequest.status, 'ACCEPTED')
        )
      ),
      columns: CORE_BOOKING_COLUMNS,
    })

    if (existingRequest) {
      return NextResponse.json(
        {
          error: 'You already have an active request with this tutor',
          existingRequestId: existingRequest.requestId,
          status: existingRequest.status,
        },
        { status: 409 }
      )
    }

    // A student with no availability configured can't book — otherwise the
    // per-slot check below is skipped and a tutor could be booked out of hours.
    if (!(await studentHasAvailabilityConfigured(session.user.id))) {
      throw new ValidationError(
        'Set your availability before requesting a 1-on-1 — ask your parent to add your available hours.'
      )
    }

    const tutorTimezone = tutorProfile.timezone || 'UTC'
    const tutorBuffer = tutorProfile.bufferMinutes ?? 0
    const isSeriesRequest = validated.proposedSlots.length > 1

    // Every proposed time must (a) fall within the student's availability (managed
    // by their parent) and (b) not clash with the tutor's already-confirmed
    // schedule. The tutor-conflict check uses the SAME detector the tutor's accept
    // runs, so a time that passes here won't be un-acceptable later — a student
    // can no longer propose a slot (or a series week) the tutor can never accept.
    for (const slot of validated.proposedSlots) {
      const withinAvailability = await isSlotWithinStudentAvailability(
        session.user.id,
        slot.date,
        slot.startTime,
        slot.endTime
      )
      if (!withinAvailability) {
        throw new ValidationError(
          'One or more of your proposed times are outside your available hours. Ask your parent to update your availability, or choose a different time.'
        )
      }

      const { start: slotStart, end: slotEnd } = slotInstants(
        slot.date,
        slot.startTime,
        slot.endTime,
        tutorTimezone
      )
      const conflicts = await findConflicts(validated.tutorId, slotStart, slotEnd, {
        bufferMinutes: tutorBuffer,
      })
      if (conflicts.length > 0) {
        const which = isSeriesRequest ? `The ${slot.date} session in your series` : 'That time'
        throw new ValidationError(
          `${which} is no longer available — it clashes with the tutor's schedule. Please pick a different time.`
        )
      }
    }

    const durationHours = validated.duration / 60
    const costPerSession = tutorProfile.oneOnOneFree
      ? 0
      : Math.round((tutorProfile.hourlyRate ?? 0) * durationHours * 100) / 100

    // One booking request per proposed weekly slot. When the student books more
    // than one week, the rows form a recurring series sharing a `seriesId`, so
    // accept / pay / cancel act on the whole set. `seriesIndex` keeps week order.
    // Dates are stored midnight-UTC so they round-trip regardless of server tz.
    const slots = validated.proposedSlots
    const isSeries = slots.length > 1
    const seriesId = isSeries ? nanoid() : null
    const studentNotes = validated.studentNotes?.trim() || null

    // Validate the optional course: it must be a published course of THIS tutor.
    // A mismatch silently drops the linkage rather than failing the booking.
    let courseId: string | null = null
    if (validated.courseId) {
      const [c] = await drizzleDb
        .select({ courseId: course.courseId })
        .from(course)
        .where(
          and(
            eq(course.courseId, validated.courseId),
            eq(course.creatorId, validated.tutorId),
            eq(course.isPublished, true),
            isNull(course.deletedAt)
          )
        )
        .limit(1)
      courseId = c?.courseId ?? null
    }

    const rows = slots.map((slot, i) => ({
      requestId: nanoid(),
      tutorId: validated.tutorId,
      studentId: session.user.id,
      requestedDate: requestedDateFromString(slot.date),
      startTime: slot.startTime,
      endTime: slot.endTime,
      timezone: tutorProfile.timezone || 'UTC',
      durationMinutes: validated.duration,
      costPerSession,
      status: 'PENDING' as const,
      studentNotes,
      courseId,
      seriesId,
      seriesIndex: isSeries ? i : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))

    const inserted = await drizzleDb
      .insert(oneOnOneBookingRequest)
      .values(rows)
      .returning(CORE_BOOKING_RETURNING)

    // The first week (seriesIndex 0) is the "head" that represents the series in
    // notifications and payment links. `.returning()` order isn't guaranteed.
    const newRequest = [...inserted].sort((a, b) => (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0))

    // Open the student↔tutor direct-message thread on booking, so each appears
    // in the other's chat contact list right away (idempotent — re-accept/pay
    // just reuse this thread).
    getOrCreateConversation(session.user.id, validated.tutorId).catch(() => {})

    // Send notification to tutor (one per series, not per session).
    notify({
      userId: validated.tutorId,
      type: 'class',
      title: 'New 1-on-1 Booking Request',
      message: isSeries
        ? `A student has requested a ${slots.length}-session weekly series. Please review and accept or reject.`
        : `A student has requested a 1-on-1 session. Please review and accept or reject.`,
      data: { requestId: newRequest[0].requestId, seriesId, type: 'one-on-one-request' },
      actionUrl: '/tutor/dashboard',
    }).catch(() => {})

    return NextResponse.json(
      {
        success: true,
        request: newRequest[0],
        seriesId,
        sessionCount: newRequest.length,
      },
      { status: 201 }
    )
  })
)

/** Map of tutor userId → their profile currency (for displaying session cost). */
async function tutorCurrencyMap(tutorIds: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(tutorIds)]
  if (unique.length === 0) return new Map()
  const rows = await drizzleDb
    .select({ userId: profile.userId, currency: profile.currency })
    .from(profile)
    .where(inArray(profile.userId, unique))
  return new Map(rows.map(r => [r.userId, r.currency]))
}

// Get all pending requests for the current user (student or tutor)
export const GET = withAuth(async (request: NextRequest, session) => {
  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role') // 'sent' or 'received'
  const requestId = searchParams.get('requestId')

  if (requestId) {
    const requestRow = await drizzleDb.query.oneOnOneBookingRequest.findFirst({
      where: eq(oneOnOneBookingRequest.requestId, requestId),
      columns: CORE_BOOKING_COLUMNS,
    })

    if (!requestRow) throw new NotFoundError('Request not found')

    const isOwner =
      requestRow.studentId === session.user.id || requestRow.tutorId === session.user.id
    if (!isOwner && session.user.role !== 'ADMIN') {
      throw new ForbiddenError('Unauthorized')
    }

    const [tutorRow] = await drizzleDb
      .select({
        userId: user.userId,
        handle: user.handle,
        image: user.image,
        name: profile.name,
        currency: profile.currency,
      })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.userId))
      .where(eq(user.userId, requestRow.tutorId))
      .limit(1)

    // For a recurring series, the amount payable is the sum of every ACCEPTED,
    // still-unpaid session (one payment covers the whole series). Mirrors the
    // charge computed in /api/payments/create.
    let seriesCount = 1
    let seriesTotal = Number(requestRow.costPerSession || 0)
    if (requestRow.seriesId) {
      const series = await unpaidSeriesTotal(requestRow.seriesId)
      if (series.count > 0) {
        seriesCount = series.count
        seriesTotal = series.total
      }
    }

    return NextResponse.json({
      request: requestRow,
      tutor: tutorRow ?? null,
      seriesCount,
      seriesTotal,
    })
  }

  // Lazily reconcile the viewer's own bookings so the list is accurate: expire
  // overdue unpaid holds (freeing slots) and mark finished sessions completed
  // (best-effort — never block the read).
  const asStudent = role === 'sent' || session.user.role === 'STUDENT'
  const scope = asStudent ? { studentId: session.user.id } : { tutorId: session.user.id }
  await Promise.all([
    expireOverdueOneOnOneBookings(scope).catch(() => {}),
    completeFinishedOneOnOneSessions(scope).catch(() => {}),
  ])

  let requests
  if (role === 'sent' || session.user.role === 'STUDENT') {
    // Get requests sent by current user (as student)
    const rows = await drizzleDb.query.oneOnOneBookingRequest.findMany({
      where: eq(oneOnOneBookingRequest.studentId, session.user.id),
      orderBy: (oneOnOneBookingRequest, { desc }) => [desc(oneOnOneBookingRequest.createdAt)],
      columns: CORE_BOOKING_COLUMNS,
      with: {
        tutor: {
          columns: {
            userId: true,
            handle: true,
            email: true,
            image: true,
          },
        },
      },
    })
    // `costPerSession` is denominated in each tutor's own currency (set on their
    // profile), so attach it per-request for display. Not a column on the booking.
    const currencyByTutor = await tutorCurrencyMap(rows.map(r => r.tutorId))
    requests = rows.map(r => ({ ...r, currency: currencyByTutor.get(r.tutorId) ?? null }))
  } else if (role === 'received' || session.user.role === 'TUTOR') {
    // Get requests received by current user (as tutor)
    const rows = await drizzleDb.query.oneOnOneBookingRequest.findMany({
      where: eq(oneOnOneBookingRequest.tutorId, session.user.id),
      orderBy: (oneOnOneBookingRequest, { desc }) => [desc(oneOnOneBookingRequest.createdAt)],
      columns: CORE_BOOKING_COLUMNS,
      with: {
        student: {
          columns: {
            userId: true,
            handle: true,
            email: true,
            image: true,
          },
        },
      },
    })
    // The tutor is the current user; the price is in their own currency.
    const [me] = await drizzleDb
      .select({ currency: profile.currency })
      .from(profile)
      .where(eq(profile.userId, session.user.id))
      .limit(1)
    const currency = me?.currency ?? null
    requests = rows.map(r => ({ ...r, currency }))
  } else {
    throw new ValidationError('Invalid role parameter')
  }

  // Attach the linked course's name so the request card can show what the
  // session is about (one query for the whole list).
  const courseIds = [...new Set(requests.map(r => r.courseId).filter((x): x is string => !!x))]
  const nameById = new Map<string, string>()
  if (courseIds.length > 0) {
    const cs = await drizzleDb
      .select({ courseId: course.courseId, name: course.name })
      .from(course)
      .where(inArray(course.courseId, courseIds))
    for (const c of cs) nameById.set(c.courseId, c.name)
  }
  requests = requests.map(r => ({
    ...r,
    courseName: r.courseId ? (nameById.get(r.courseId) ?? null) : null,
  }))

  return NextResponse.json({ requests })
})
