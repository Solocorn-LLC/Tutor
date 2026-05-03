import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { eq, and, lt, gt, isNull, ne } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest, calendarEvent } from '@/lib/db/schema'
import { dailyProvider } from '@/lib/video/daily-provider'
import { createSession } from '@/lib/sessions/create-session'
import { notify } from '@/lib/notifications/notify'
import { nanoid } from 'nanoid'
import { z } from 'zod'

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

      // Create event timestamps
      const eventStart = new Date(`${slotDate}T${slotStartTime}:00`)
      const eventEnd = new Date(`${slotDate}T${slotEndTime}:00`)

      const txResult = await drizzleDb.transaction(async tx => {
        const conflicting = await tx
          .select({ eventId: calendarEvent.eventId })
          .from(calendarEvent)
          .where(
            and(
              eq(calendarEvent.tutorId, existingRequest.tutorId),
              lt(calendarEvent.startTime, eventEnd),
              gt(calendarEvent.endTime, eventStart),
              isNull(calendarEvent.deletedAt),
              eq(calendarEvent.isCancelled, false),
              ne(calendarEvent.status, 'CANCELLED')
            )
          )
          .limit(1)

        if (conflicting.length > 0) {
          return { conflict: true as const }
        }

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
            status: 'ACCEPTED',
            tutorNotes: validated.tutorNotes || existingRequest.tutorNotes,
            tutorResponseAt: new Date(),
            calendarEventId: newEvent.eventId,
            updatedAt: new Date(),
          })
          .where(eq(oneOnOneBookingRequest.requestId, validated.requestId))
          .returning()

        return { conflict: false as const, updatedRequest, newEvent }
      })

      if (txResult.conflict) {
        return NextResponse.json(
          { error: 'This time slot is no longer available. Please choose another slot.' },
          { status: 409 }
        )
      }

      // Send notification to student that request was accepted
      notify({
        userId: existingRequest.studentId,
        type: 'class',
        title: '1-on-1 Request Accepted!',
        message: `Your tutor has accepted your 1-on-1 session request. Please complete payment to confirm your booking.`,
        data: { requestId: txResult.updatedRequest.requestId, type: 'one-on-one-accepted' },
        actionUrl: `/payment?requestId=${txResult.updatedRequest.requestId}`,
      }).catch(console.error)

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
        .returning()

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
