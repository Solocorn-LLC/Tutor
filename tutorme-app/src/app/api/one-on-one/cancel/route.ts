import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { eq, and, ne } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest, calendarEvent, liveSession } from '@/lib/db/schema'
import { notify } from '@/lib/notifications/notify'
import { z } from 'zod'

const cancelSchema = z.object({
  requestId: z.string().min(1),
  reason: z.string().max(500).optional(),
})

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions, request)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validated = cancelSchema.parse(body)

    // Get the existing request
    const existingRequest = await drizzleDb.query.oneOnOneBookingRequest.findFirst({
      where: eq(oneOnOneBookingRequest.requestId, validated.requestId),
    })

    if (!existingRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    // Verify the user is either the student or tutor of this request
    const isStudent = existingRequest.studentId === session.user.id
    const isTutor = existingRequest.tutorId === session.user.id

    if (!isStudent && !isTutor) {
      return NextResponse.json({ error: 'Not authorized to cancel this request' }, { status: 403 })
    }

    // Cancellable while still upcoming: pending, accepted, or paid. A paid
    // cancellation frees the session and flags a refund (processed via the
    // standard tutor/admin refund flow — see the refund-owed notification below).
    if (!['PENDING', 'ACCEPTED', 'PAID'].includes(existingRequest.status)) {
      return NextResponse.json(
        {
          error: `Cannot cancel a request that is already ${existingRequest.status.toLowerCase()}`,
        },
        { status: 400 }
      )
    }
    const wasPaid = existingRequest.status === 'PAID'

    // If there's a calendar event, mark it as cancelled and end the linked live session
    if (existingRequest.calendarEventId) {
      const [updatedEvent] = await drizzleDb
        .update(calendarEvent)
        .set({
          status: 'CANCELLED',
          isCancelled: true,
          updatedAt: new Date(),
        })
        .where(eq(calendarEvent.eventId, existingRequest.calendarEventId))
        .returning({ externalId: calendarEvent.externalId })

      if (updatedEvent?.externalId) {
        await drizzleDb
          .update(liveSession)
          .set({ status: 'ended', endedAt: new Date() })
          .where(
            and(eq(liveSession.sessionId, updatedEvent.externalId), ne(liveSession.status, 'ended'))
          )
      }
    }

    // Update request status
    const updatedRequest = await drizzleDb
      .update(oneOnOneBookingRequest)
      .set({
        status: 'CANCELLED',
        tutorNotes:
          validated.reason && isStudent
            ? `${existingRequest.tutorNotes || ''}\nCancellation reason (from student): ${validated.reason}`.trim()
            : validated.reason && isTutor
              ? `${existingRequest.tutorNotes || ''}\nCancellation reason (from tutor): ${validated.reason}`.trim()
              : existingRequest.tutorNotes,
        updatedAt: new Date(),
      })
      .where(eq(oneOnOneBookingRequest.requestId, validated.requestId))
      .returning()

    // Notify whichever party did not initiate the cancellation
    const otherPartyId = isStudent ? existingRequest.tutorId : existingRequest.studentId
    notify({
      userId: otherPartyId,
      type: 'class',
      title: '1-on-1 Session Cancelled',
      message: isStudent
        ? 'Your student has cancelled the upcoming 1-on-1 session.'
        : 'Your tutor has cancelled the upcoming 1-on-1 session.',
      data: { requestId: updatedRequest[0].requestId, type: 'one-on-one-cancelled' },
      actionUrl: isStudent ? '/tutor/dashboard' : '/student/dashboard',
    }).catch(console.error)

    // A paid booking that's cancelled owes the student a refund. Flag the tutor
    // to process it via the standard refund flow (automated gateway refunds for
    // 1-on-1 are not yet wired, so this stays a deliberate human step).
    if (wasPaid) {
      notify({
        userId: existingRequest.tutorId,
        type: 'class',
        title: 'Refund required — 1-on-1 cancelled',
        message: `A paid 1-on-1 session was cancelled. Please issue a refund of ${existingRequest.costPerSession} to the student.`,
        data: {
          requestId: updatedRequest[0].requestId,
          type: 'one-on-one-refund-required',
          amount: existingRequest.costPerSession,
        },
        actionUrl: '/tutor/dashboard',
      }).catch(console.error)
    }

    return NextResponse.json({
      success: true,
      refundRequired: wasPaid,
      request: updatedRequest[0],
    })
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

    console.error('Error canceling one-on-one request:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
