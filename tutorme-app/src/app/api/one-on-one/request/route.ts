import { NextRequest, NextResponse } from 'next/server'
import { eq, and, or } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest, profile, user } from '@/lib/db/schema'
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
import { isSlotWithinStudentAvailability } from '@/lib/student-availability'

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
    .max(5),
  duration: z.number().min(30).max(180), // minutes: 30-180
  studentNotes: z.string().max(1000).optional(),
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
        currency: true,
        timezone: true,
      },
    })

    if (!tutorProfile) throw new NotFoundError('Tutor not found')

    if (!tutorProfile.oneOnOneEnabled) {
      throw new ValidationError('Tutor does not offer one-on-one sessions')
    }

    if (!tutorProfile.hourlyRate || tutorProfile.hourlyRate <= 0) {
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

    // Every proposed time must fall within the student's availability (managed
    // by their parent). Not enforced when no availability is configured yet.
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
    }

    // For the existing table, use the first proposed slot as the primary request
    // Store remaining slots in tutorNotes as JSON
    const [primarySlot, ...additionalSlots] = validated.proposedSlots
    const durationHours = validated.duration / 60
    const costPerSession = Math.round(tutorProfile.hourlyRate * durationHours * 100) / 100

    // Parse the date and time
    const requestedDate = new Date(`${primarySlot.date}T00:00:00`)

    // Create the request
    const newRequest = await drizzleDb
      .insert(oneOnOneBookingRequest)
      .values({
        requestId: nanoid(),
        tutorId: validated.tutorId,
        studentId: session.user.id,
        requestedDate,
        startTime: primarySlot.startTime,
        endTime: primarySlot.endTime,
        timezone: tutorProfile.timezone || 'UTC',
        durationMinutes: validated.duration,
        costPerSession,
        status: 'PENDING',
        tutorNotes:
          additionalSlots.length > 0
            ? `Alternative slots: ${JSON.stringify(additionalSlots)}`
            : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()

    // Send notification to tutor
    notify({
      userId: validated.tutorId,
      type: 'class',
      title: 'New 1-on-1 Booking Request',
      message: `A student has requested a 1-on-1 session. Please review and accept or reject.`,
      data: { requestId: newRequest[0].requestId, type: 'one-on-one-request' },
      actionUrl: '/tutor/dashboard',
    }).catch(() => {})

    return NextResponse.json(
      {
        success: true,
        request: newRequest[0],
      },
      { status: 201 }
    )
  })
)

// Get all pending requests for the current user (student or tutor)
export const GET = withAuth(async (request: NextRequest, session) => {
  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role') // 'sent' or 'received'
  const requestId = searchParams.get('requestId')

  if (requestId) {
    const requestRow = await drizzleDb.query.oneOnOneBookingRequest.findFirst({
      where: eq(oneOnOneBookingRequest.requestId, requestId),
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

    return NextResponse.json({
      request: requestRow,
      tutor: tutorRow ?? null,
    })
  }

  let requests
  if (role === 'sent' || session.user.role === 'STUDENT') {
    // Get requests sent by current user (as student)
    requests = await drizzleDb.query.oneOnOneBookingRequest.findMany({
      where: eq(oneOnOneBookingRequest.studentId, session.user.id),
      orderBy: (oneOnOneBookingRequest, { desc }) => [desc(oneOnOneBookingRequest.createdAt)],
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
  } else if (role === 'received' || session.user.role === 'TUTOR') {
    // Get requests received by current user (as tutor)
    requests = await drizzleDb.query.oneOnOneBookingRequest.findMany({
      where: eq(oneOnOneBookingRequest.tutorId, session.user.id),
      orderBy: (oneOnOneBookingRequest, { desc }) => [desc(oneOnOneBookingRequest.createdAt)],
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
  } else {
    throw new ValidationError('Invalid role parameter')
  }

  return NextResponse.json({ requests })
})
