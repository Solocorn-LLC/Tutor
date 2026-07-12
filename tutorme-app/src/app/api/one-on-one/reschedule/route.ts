/**
 * 1-on-1 reschedule — propose a new time; the other party accepts (which moves
 * the session) or declines (which keeps it).
 *
 * POST  { requestId, date, startTime, endTime }  → propose (either party)
 * PATCH { requestId, action: 'accept' | 'decline' } → respond (the other party)
 *
 * Only ACCEPTED/PAID bookings (which have a real session) can be rescheduled.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest, calendarEvent, liveSession, profile } from '@/lib/db/schema'
import { findConflicts } from '@/lib/schedule/conflicts'
import {
  isSlotWithinStudentAvailability,
  studentHasAvailabilityConfigured,
} from '@/lib/student-availability'
import { notify } from '@/lib/notifications/notify'

const proposeSchema = z.object({
  requestId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
})
const respondSchema = z.object({
  requestId: z.string().min(1),
  action: z.enum(['accept', 'decline']),
})

type Booking = typeof oneOnOneBookingRequest.$inferSelect

async function loadOwnedBooking(requestId: string, userId: string): Promise<Booking | null> {
  const row = await drizzleDb.query.oneOnOneBookingRequest.findFirst({
    where: eq(oneOnOneBookingRequest.requestId, requestId),
  })
  if (!row) return null
  if (row.tutorId !== userId && row.studentId !== userId) return null
  return row
}

// Current reschedule state for the dialog: the session's current time, any
// pending proposal (and whether the caller made it), and whether it can still
// be rescheduled.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestId = new URL(req.url).searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  const booking = await loadOwnedBooking(requestId, session.user.id)
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const proposal = booking.rescheduleProposedBy
    ? {
        date: booking.rescheduleProposedDate?.toISOString().split('T')[0] ?? null,
        startTime: booking.rescheduleProposedStart,
        endTime: booking.rescheduleProposedEnd,
        proposedByMe: booking.rescheduleProposedBy === session.user.id,
      }
    : null

  return NextResponse.json({
    current: {
      date: booking.requestedDate.toISOString().split('T')[0],
      startTime: booking.startTime,
      endTime: booking.endTime,
    },
    proposal,
    canReschedule: booking.status === 'ACCEPTED' || booking.status === 'PAID',
  })
}

/** Availability + conflict + buffer checks for moving `booking` to a new slot.
 *  Returns an error message, or null when the slot is bookable. */
async function validateSlot(
  booking: Booking,
  date: string,
  startTime: string,
  endTime: string
): Promise<string | null> {
  if (!(await studentHasAvailabilityConfigured(booking.studentId))) {
    return 'The student has no availability set — they must add their available hours first.'
  }
  if (!(await isSlotWithinStudentAvailability(booking.studentId, date, startTime, endTime))) {
    return "That time is outside the student's available hours."
  }
  const eventStart = new Date(`${date}T${startTime}:00`)
  const eventEnd = new Date(`${date}T${endTime}:00`)
  if (!(eventEnd > eventStart)) return 'The end time must be after the start time.'

  const [tutorProfile] = await drizzleDb
    .select({ bufferMinutes: profile.bufferMinutes })
    .from(profile)
    .where(eq(profile.userId, booking.tutorId))
    .limit(1)
  // Exclude the session being moved from its own conflict check.
  const currentEvent = booking.calendarEventId
    ? await drizzleDb.query.calendarEvent.findFirst({
        where: eq(calendarEvent.eventId, booking.calendarEventId),
      })
    : null
  const conflicts = await findConflicts(booking.tutorId, eventStart, eventEnd, {
    excludeOneOnOneId: booking.requestId,
    excludeEventId: booking.calendarEventId ?? undefined,
    excludeSessionId: currentEvent?.externalId ?? undefined,
    bufferMinutes: tutorProfile?.bufferMinutes ?? 0,
  })
  if (conflicts.length > 0)
    return 'That time conflicts with another session on the tutor’s calendar.'
  return null
}

// Propose a new time.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions, req)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { requestId, date, startTime, endTime } = proposeSchema.parse(await req.json())
    const booking = await loadOwnedBooking(requestId, session.user.id)
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    if (booking.status !== 'ACCEPTED' && booking.status !== 'PAID') {
      return NextResponse.json(
        { error: 'Only a confirmed booking can be rescheduled.' },
        { status: 400 }
      )
    }

    const invalid = await validateSlot(booking, date, startTime, endTime)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

    await drizzleDb
      .update(oneOnOneBookingRequest)
      .set({
        rescheduleProposedDate: new Date(`${date}T00:00:00.000Z`),
        rescheduleProposedStart: startTime,
        rescheduleProposedEnd: endTime,
        rescheduleProposedBy: session.user.id,
        updatedAt: new Date(),
      })
      .where(eq(oneOnOneBookingRequest.requestId, requestId))

    const otherUserId = session.user.id === booking.tutorId ? booking.studentId : booking.tutorId
    notify({
      userId: otherUserId,
      type: 'class',
      title: '1-on-1 reschedule proposed',
      message: `A new time was proposed: ${date} ${startTime}–${endTime}. Accept to move the session or decline to keep it.`,
      data: { requestId, type: 'one-on-one-reschedule-proposed' },
      actionUrl: session.user.id === booking.tutorId ? '/student/dashboard' : '/tutor/dashboard',
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid reschedule request' }, { status: 400 })
    }
    console.error('reschedule propose failed:', err)
    return NextResponse.json({ error: 'Failed to propose reschedule' }, { status: 500 })
  }
}

// Accept or decline a pending reschedule.
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions, req)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { requestId, action } = respondSchema.parse(await req.json())
    const booking = await loadOwnedBooking(requestId, session.user.id)
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    if (
      !booking.rescheduleProposedBy ||
      !booking.rescheduleProposedDate ||
      !booking.rescheduleProposedStart ||
      !booking.rescheduleProposedEnd
    ) {
      return NextResponse.json({ error: 'No pending reschedule to respond to.' }, { status: 400 })
    }
    // Only the OTHER party may respond to a proposal.
    if (booking.rescheduleProposedBy === session.user.id) {
      return NextResponse.json(
        { error: 'You proposed this reschedule — the other party must respond.' },
        { status: 403 }
      )
    }

    const clearProposal = {
      rescheduleProposedDate: null,
      rescheduleProposedStart: null,
      rescheduleProposedEnd: null,
      rescheduleProposedBy: null,
      updatedAt: new Date(),
    }

    if (action === 'decline') {
      await drizzleDb
        .update(oneOnOneBookingRequest)
        .set(clearProposal)
        .where(eq(oneOnOneBookingRequest.requestId, requestId))
      notify({
        userId: booking.rescheduleProposedBy,
        type: 'class',
        title: '1-on-1 reschedule declined',
        message: 'Your proposed new time was declined — the session stays as originally scheduled.',
        data: { requestId, type: 'one-on-one-reschedule-declined' },
      }).catch(() => {})
      return NextResponse.json({ success: true, moved: false })
    }

    // Accept: re-validate (the tutor's calendar may have changed) then move.
    const date = booking.rescheduleProposedDate.toISOString().split('T')[0]
    const startTime = booking.rescheduleProposedStart
    const endTime = booking.rescheduleProposedEnd
    const invalid = await validateSlot(booking, date, startTime, endTime)
    if (invalid) {
      return NextResponse.json(
        { error: `Can no longer move to that time: ${invalid}` },
        { status: 409 }
      )
    }

    const eventStart = new Date(`${date}T${startTime}:00`)
    const eventEnd = new Date(`${date}T${endTime}:00`)

    await drizzleDb.transaction(async tx => {
      if (booking.calendarEventId) {
        const ev = await tx.query.calendarEvent.findFirst({
          where: eq(calendarEvent.eventId, booking.calendarEventId),
        })
        await tx
          .update(calendarEvent)
          .set({ startTime: eventStart, endTime: eventEnd })
          .where(eq(calendarEvent.eventId, booking.calendarEventId))
        if (ev?.externalId) {
          // Move the live session and reset its reminder so a fresh one fires.
          await tx
            .update(liveSession)
            .set({ scheduledAt: eventStart, reminderSentAt: null })
            .where(eq(liveSession.sessionId, ev.externalId))
        }
      }
      await tx
        .update(oneOnOneBookingRequest)
        .set({
          requestedDate: new Date(`${date}T00:00:00.000Z`),
          startTime,
          endTime,
          ...clearProposal,
        })
        .where(eq(oneOnOneBookingRequest.requestId, requestId))
    })

    notify({
      userId: booking.rescheduleProposedBy,
      type: 'class',
      title: '1-on-1 rescheduled',
      message: `Your reschedule was accepted — the session is now ${date} ${startTime}–${endTime}.`,
      data: { requestId, type: 'one-on-one-reschedule-accepted' },
    }).catch(() => {})

    return NextResponse.json({ success: true, moved: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid reschedule response' }, { status: 400 })
    }
    console.error('reschedule respond failed:', err)
    return NextResponse.json({ error: 'Failed to respond to reschedule' }, { status: 500 })
  }
}
