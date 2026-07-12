import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { eq, and, isNull } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest, profile } from '@/lib/db/schema'
import { dailyProvider } from '@/lib/video/daily-provider'
import { createSession } from '@/lib/sessions/create-session'
import { notify } from '@/lib/notifications/notify'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { findConflicts, findAlternativeSlots } from '@/lib/schedule/conflicts'
import {
  isSlotWithinStudentAvailability,
  studentHasAvailabilityConfigured,
} from '@/lib/student-availability'
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

    if (validated.action === 'accept') {
      // Parse the selected date and time
      const slotDate =
        validated.selectedSlot?.date || existingRequest.requestedDate.toISOString().split('T')[0]
      const slotStartTime = validated.selectedSlot?.startTime || existingRequest.startTime
      const slotEndTime = validated.selectedSlot?.endTime || existingRequest.endTime

      // The student must have availability configured — otherwise the slot
      // check below is skipped and the tutor could accept an out-of-hours time.
      if (!(await studentHasAvailabilityConfigured(existingRequest.studentId))) {
        return NextResponse.json(
          {
            error:
              'This student has no availability set. Ask them (or their parent) to add their available hours before accepting.',
          },
          { status: 400 }
        )
      }

      // The accepted time must fall within the student's availability (managed
      // by their parent).
      const withinAvailability = await isSlotWithinStudentAvailability(
        existingRequest.studentId,
        slotDate,
        slotStartTime,
        slotEndTime
      )
      if (!withinAvailability) {
        return NextResponse.json(
          {
            error:
              "That time is outside the student's available hours. Ask the student's parent to update their availability, or accept a different slot.",
          },
          { status: 400 }
        )
      }

      // Resolve the picked wall-clock slot to true UTC instants in the
      // booking's own timezone (not the server's).
      const { start: eventStart, end: eventEnd } = slotInstants(
        slotDate,
        slotStartTime,
        slotEndTime,
        existingRequest.timezone
      )
      const durationMinutes = existingRequest.durationMinutes || 60

      // CHECK FOR CONFLICTS using unified conflict detector, expanded by the
      // tutor's configured buffer so bookings can't be scheduled too close.
      const [tutorProfileRow] = await drizzleDb
        .select({ bufferMinutes: profile.bufferMinutes, oneOnOneFree: profile.oneOnOneFree })
        .from(profile)
        .where(eq(profile.userId, session.user.id))
        .limit(1)
      // Free sessions (or a zero-cost request) skip payment: accepting confirms
      // the booking immediately instead of opening a payment window.
      const isFree = !!tutorProfileRow?.oneOnOneFree || (existingRequest.costPerSession ?? 0) <= 0
      const conflicts = await findConflicts(session.user.id, eventStart, eventEnd, {
        excludeOneOnOneId: validated.requestId,
        bufferMinutes: tutorProfileRow?.bufferMinutes ?? 0,
      })

      if (conflicts.length > 0) {
        // Provide alternative slot recommendations
        const alternativeSlots = await findAlternativeSlots(
          session.user.id,
          eventStart,
          durationMinutes,
          {
            maxSuggestions: 3,
            excludeOneOnOneId: validated.requestId,
          }
        )
        return NextResponse.json(
          {
            error: 'This time slot conflicts with an existing session. Please choose another slot.',
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

      const txResult = await drizzleDb.transaction(async tx => {
        // Create a Daily.co room for the 1-on-1 session
        const room = await dailyProvider.createRoom(`1on1-${existingRequest.requestId}`, {
          maxParticipants: 2,
          durationMinutes: existingRequest.durationMinutes,
        })

        // Unified session creation (LiveSession + CalendarEvent)
        const { calendarEvent: newEvent } = await createSession(
          {
            tutorId: existingRequest.tutorId,
            title: `1-on-1 Session`,
            scheduledAt: eventStart,
            durationMinutes: existingRequest.durationMinutes,
            category: 'Consultation',
            type: 'ONE_ON_ONE',
            studentId: existingRequest.studentId,
            maxStudents: 2,
            description: `One-on-one tutoring session with student`,
            timezone: existingRequest.timezone,
            existingRoom: room,
          },
          tx
        )

        const [updatedRequest] = await tx
          .update(oneOnOneBookingRequest)
          .set({
            // Free bookings are confirmed on accept (no payment step); paid ones
            // wait in ACCEPTED until the student pays within the 48h window.
            status: isFree ? 'PAID' : 'ACCEPTED',
            paidAt: isFree ? new Date() : undefined,
            tutorNotes: validated.tutorNotes || existingRequest.tutorNotes,
            tutorResponseAt: new Date(),
            paymentDueAt: isFree ? null : new Date(Date.now() + 48 * 60 * 60 * 1000),
            calendarEventId: newEvent.eventId,
            updatedAt: new Date(),
          })
          .where(eq(oneOnOneBookingRequest.requestId, validated.requestId))
          .returning(CORE_BOOKING_RETURNING)

        return { updatedRequest, newEvent }
      })

      if (isFree) {
        // Free booking: confirmed immediately — mirror the paid webhook's side
        // effects (open the student↔tutor chat) and skip the payment prompt.
        getOrCreateConversation(existingRequest.studentId, existingRequest.tutorId).catch(() => {})
        notify({
          userId: existingRequest.studentId,
          type: 'class',
          title: '1-on-1 Confirmed!',
          message: `Your tutor accepted your free 1-on-1 session — you're all set. It's on your schedule.`,
          data: { requestId: txResult.updatedRequest.requestId, type: 'one-on-one-confirmed' },
          actionUrl: '/student/dashboard',
        }).catch(console.error)
      } else {
        // Paid booking: prompt the student to complete payment.
        notify({
          userId: existingRequest.studentId,
          type: 'class',
          title: '1-on-1 Request Accepted!',
          message: `Your tutor has accepted your 1-on-1 session request. Please complete payment to confirm your booking.`,
          data: { requestId: txResult.updatedRequest.requestId, type: 'one-on-one-accepted' },
          actionUrl: `/payment?requestId=${txResult.updatedRequest.requestId}`,
        }).catch(console.error)
      }

      return NextResponse.json({
        success: true,
        request: txResult.updatedRequest,
        calendarEvent: txResult.newEvent,
      })
    } else {
      // Reject the request
      const updatedRequest = await drizzleDb
        .update(oneOnOneBookingRequest)
        .set({
          status: 'REJECTED',
          tutorNotes: validated.tutorNotes || existingRequest.tutorNotes,
          tutorResponseAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(oneOnOneBookingRequest.requestId, validated.requestId))
        .returning(CORE_BOOKING_RETURNING)

      // Send notification to student that request was rejected
      notify({
        userId: existingRequest.studentId,
        type: 'class',
        title: '1-on-1 Request Declined',
        message: `Your tutor is unable to accommodate your 1-on-1 session request at this time. You may try booking a different time slot.`,
        data: { requestId: updatedRequest[0].requestId, type: 'one-on-one-rejected' },
        actionUrl: '/student/tutors',
      }).catch(console.error)

      return NextResponse.json({
        success: true,
        request: updatedRequest[0],
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
