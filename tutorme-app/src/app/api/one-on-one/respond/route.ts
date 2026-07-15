import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { eq, and, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest, profile } from '@/lib/db/schema'
import { dailyProvider } from '@/lib/video/daily-provider'
import { createSession } from '@/lib/sessions/create-session'
import { notify } from '@/lib/notifications/notify'
import { z } from 'zod'
import { findConflicts, findAlternativeSlots } from '@/lib/schedule/conflicts'
import { isSlotWithinStudentAvailability } from '@/lib/student-availability'
import { slotInstants } from '@/lib/one-on-one/time'
import { CORE_BOOKING_COLUMNS, CORE_BOOKING_RETURNING } from '@/lib/one-on-one/columns'
import { getOrCreateConversation } from '@/lib/messaging/conversation'

const respondSchema = z.object({
  requestId: z.string().min(1),
  action: z.enum(['accept', 'reject']),
  selectedSlot: z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .optional(),
  tutorNotes: z.string().max(1000).optional(),
})

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions, request)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'TUTOR') {
      return NextResponse.json({ error: 'Only tutors can respond to requests' }, { status: 403 })
    }

    const body = await request.json()
    const validated = respondSchema.parse(body)

    // Get the existing request
    const existingRequest = await drizzleDb.query.oneOnOneBookingRequest.findFirst({
      where: and(
        eq(oneOnOneBookingRequest.requestId, validated.requestId),
        eq(oneOnOneBookingRequest.tutorId, session.user.id)
      ),
      columns: CORE_BOOKING_COLUMNS,
    })

    if (!existingRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    if (existingRequest.status !== 'PENDING') {
      return NextResponse.json(
        {
          error: `Request is already ${existingRequest.status.toLowerCase()}`,
        },
        { status: 400 }
      )
    }

    // A recurring booking is N PENDING rows sharing a seriesId; accept/reject acts
    // on the whole series at once. A standalone request is just itself.
    const isSeries = !!existingRequest.seriesId
    const siblings = isSeries
      ? await drizzleDb.query.oneOnOneBookingRequest.findMany({
          where: and(
            eq(oneOnOneBookingRequest.seriesId, existingRequest.seriesId as string),
            eq(oneOnOneBookingRequest.tutorId, session.user.id),
            eq(oneOnOneBookingRequest.status, 'PENDING')
          ),
          columns: CORE_BOOKING_COLUMNS,
          orderBy: (t, { asc }) => [asc(t.seriesIndex)],
        })
      : [existingRequest]

    if (validated.action === 'accept') {
      // Students are bookable 24/7 by default; only parent-blocked hours are
      // rejected, per-slot below.
      const [tutorProfileRow] = await drizzleDb
        .select({ bufferMinutes: profile.bufferMinutes, oneOnOneFree: profile.oneOnOneFree })
        .from(profile)
        .where(eq(profile.userId, session.user.id))
        .limit(1)
      // Free sessions (or a zero-cost request) skip payment: accepting confirms
      // the booking immediately instead of opening a payment window.
      const isFree = !!tutorProfileRow?.oneOnOneFree || (existingRequest.costPerSession ?? 0) <= 0
      const bufferMinutes = tutorProfileRow?.bufferMinutes ?? 0

      // Resolve + validate EVERY session up front (availability + conflicts) with
      // no writes, so a series is accepted all-or-nothing. A lone request may pick
      // a specific time via selectedSlot; series sessions use their stored times.
      const prepared: { req: (typeof siblings)[number]; eventStart: Date; eventEnd: Date }[] = []
      for (const req of siblings) {
        const useSelected = !isSeries && validated.selectedSlot
        const slotDate = useSelected
          ? validated.selectedSlot!.date
          : req.requestedDate.toISOString().split('T')[0]
        const slotStartTime = useSelected ? validated.selectedSlot!.startTime : req.startTime
        const slotEndTime = useSelected ? validated.selectedSlot!.endTime : req.endTime

        const withinAvailability = await isSlotWithinStudentAvailability(
          req.studentId,
          slotDate,
          slotStartTime,
          slotEndTime
        )
        if (!withinAvailability) {
          const which = isSeries ? ` for the ${slotDate} session` : ''
          return NextResponse.json(
            {
              error: `That time${which} has been blocked by the student's parent. Ask them to allow it, or accept a different slot.`,
            },
            { status: 400 }
          )
        }

        // Resolve the wall-clock slot to true UTC instants in the booking's tz.
        const { start: eventStart, end: eventEnd } = slotInstants(
          slotDate,
          slotStartTime,
          slotEndTime,
          req.timezone
        )

        // Unified conflict detector, expanded by the tutor's buffer. Earlier
        // siblings aren't yet persisted, so weeks in the same series don't
        // false-conflict with each other (they're on different dates anyway).
        const conflicts = await findConflicts(session.user.id, eventStart, eventEnd, {
          excludeOneOnOneId: req.requestId,
          bufferMinutes,
        })
        if (conflicts.length > 0) {
          const alternativeSlots = await findAlternativeSlots(
            session.user.id,
            eventStart,
            req.durationMinutes || 60,
            { maxSuggestions: 3, excludeOneOnOneId: req.requestId }
          )
          return NextResponse.json(
            {
              error: isSeries
                ? `The ${slotDate} session conflicts with an existing session, so the series can't be accepted as-is. Ask the student to re-book, or clear the conflict.`
                : 'This time slot conflicts with an existing session. Please choose another slot.',
              conflicts: conflicts.map(c => ({
                type: c.type,
                title: c.title,
                startTime: c.startTime.toISOString(),
                endTime: c.endTime.toISOString(),
              })),
              suggestedTimes: alternativeSlots,
            },
            { status: 409 }
          )
        }

        prepared.push({ req, eventStart, eventEnd })
      }

      // Create the Daily.co rooms up front (external calls, kept out of the tx).
      const withRooms = await Promise.all(
        prepared.map(async p => ({
          ...p,
          room: await dailyProvider.createRoom(`1on1-${p.req.requestId}`, {
            maxParticipants: 2,
            durationMinutes: p.req.durationMinutes,
          }),
        }))
      )

      // One transaction: create each session (LiveSession + CalendarEvent) and
      // flip the request to ACCEPTED (or PAID when free). All or nothing.
      const results = await drizzleDb.transaction(async tx => {
        const out: { updatedRequest: (typeof siblings)[number]; newEvent: { eventId: string } }[] =
          []
        for (const p of withRooms) {
          const { calendarEvent: newEvent } = await createSession(
            {
              tutorId: p.req.tutorId,
              title: `1-on-1 Session`,
              scheduledAt: p.eventStart,
              durationMinutes: p.req.durationMinutes,
              category: 'Consultation',
              type: 'ONE_ON_ONE',
              studentId: p.req.studentId,
              maxStudents: 2,
              description: `One-on-one tutoring session with student`,
              timezone: p.req.timezone,
              courseId: p.req.courseId ?? undefined,
              existingRoom: p.room,
            },
            tx
          )

          const [updatedRequest] = await tx
            .update(oneOnOneBookingRequest)
            .set({
              status: isFree ? 'PAID' : 'ACCEPTED',
              paidAt: isFree ? new Date() : undefined,
              tutorNotes: validated.tutorNotes || p.req.tutorNotes,
              tutorResponseAt: new Date(),
              paymentDueAt: isFree ? null : new Date(Date.now() + 48 * 60 * 60 * 1000),
              calendarEventId: newEvent.eventId,
              updatedAt: new Date(),
            })
            .where(eq(oneOnOneBookingRequest.requestId, p.req.requestId))
            .returning(CORE_BOOKING_RETURNING)

          out.push({ updatedRequest, newEvent })
        }
        return out
      })

      // Open the student↔tutor direct-message thread as soon as the booking is
      // accepted, so each shows up in the other's chat contact list right away
      // (for a paid booking the payment webhook also ensures this).
      getOrCreateConversation(existingRequest.studentId, existingRequest.tutorId).catch(() => {})

      const head = results[0].updatedRequest
      const count = results.length
      const sessionWord = count > 1 ? `${count} weekly sessions` : 'session'

      if (isFree) {
        // Free booking: confirmed immediately — skip the payment prompt.
        notify({
          userId: existingRequest.studentId,
          type: 'class',
          title: '1-on-1 Confirmed!',
          message: `Your tutor accepted your free 1-on-1 ${sessionWord} — you're all set. ${count > 1 ? "They're" : "It's"} on your schedule.`,
          data: {
            requestId: head.requestId,
            seriesId: existingRequest.seriesId,
            type: 'one-on-one-confirmed',
          },
          actionUrl: '/student/dashboard',
        }).catch(console.error)
      } else {
        // Paid booking: prompt the student to complete payment (one payment
        // covers the whole series).
        notify({
          userId: existingRequest.studentId,
          type: 'class',
          title: '1-on-1 Request Accepted!',
          message: `Your tutor accepted your 1-on-1 ${sessionWord}. Please complete payment to confirm your booking.`,
          data: {
            requestId: head.requestId,
            seriesId: existingRequest.seriesId,
            type: 'one-on-one-accepted',
          },
          actionUrl: `/payment?requestId=${head.requestId}`,
        }).catch(console.error)
      }

      return NextResponse.json({
        success: true,
        request: head,
        calendarEvent: results[0].newEvent,
        sessionCount: count,
      })
    } else {
      // Reject every PENDING session in the series (or the single request).
      const ids = siblings.map(s => s.requestId)
      const updatedRequest = await drizzleDb
        .update(oneOnOneBookingRequest)
        .set({
          status: 'REJECTED',
          tutorNotes: validated.tutorNotes || existingRequest.tutorNotes,
          tutorResponseAt: new Date(),
          updatedAt: new Date(),
        })
        .where(inArray(oneOnOneBookingRequest.requestId, ids))
        .returning(CORE_BOOKING_RETURNING)

      // Send notification to student that the request was rejected (once).
      notify({
        userId: existingRequest.studentId,
        type: 'class',
        title: '1-on-1 Request Declined',
        message: `Your tutor is unable to accommodate your 1-on-1 ${ids.length > 1 ? 'series' : 'session'} request at this time. You may try booking a different time slot.`,
        data: {
          requestId: existingRequest.requestId,
          seriesId: existingRequest.seriesId,
          type: 'one-on-one-rejected',
        },
        actionUrl: '/student/tutors',
      }).catch(console.error)

      return NextResponse.json({
        success: true,
        request:
          updatedRequest.find(r => r.requestId === existingRequest.requestId) ?? updatedRequest[0],
      })
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: error.issues,
        },
        { status: 400 }
      )
    }

    console.error('Error responding to one-on-one request:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
