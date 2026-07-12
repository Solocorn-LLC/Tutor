/**
 * A single group session.
 *
 * GET    → the session, its seatsLeft, and (for the host tutor) its roster.
 * DELETE → the host tutor cancels: ends the shared session and refunds every
 *          paid seat (85%, 15% fee), then notifies each student.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  groupSession,
  groupSessionParticipant,
  calendarEvent,
  liveSession,
  profile,
} from '@/lib/db/schema'
import { notify } from '@/lib/notifications/notify'
import { refundGroupSeat } from '@/lib/payments/refund-group-session'
import { countActiveSeats } from '@/lib/group-session/seats'

async function load(id: string) {
  const [gs] = await drizzleDb
    .select()
    .from(groupSession)
    .where(eq(groupSession.groupSessionId, id))
    .limit(1)
  return gs ?? null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const gs = await load(id)
  if (!gs) return NextResponse.json({ error: 'Group session not found' }, { status: 404 })

  const seatsLeft = Math.max(0, gs.capacity - (await countActiveSeats(id)))
  const isHost = gs.tutorId === session.user.id

  const roster = isHost
    ? await drizzleDb
        .select({
          participantId: groupSessionParticipant.participantId,
          studentId: groupSessionParticipant.studentId,
          status: groupSessionParticipant.status,
          studentName: profile.name,
        })
        .from(groupSessionParticipant)
        .leftJoin(profile, eq(profile.userId, groupSessionParticipant.studentId))
        .where(
          and(
            eq(groupSessionParticipant.groupSessionId, id),
            ne(groupSessionParticipant.status, 'CANCELLED')
          )
        )
    : undefined

  // What seat (if any) does the caller hold?
  const [mySeat] = await drizzleDb
    .select({
      participantId: groupSessionParticipant.participantId,
      status: groupSessionParticipant.status,
    })
    .from(groupSessionParticipant)
    .where(
      and(
        eq(groupSessionParticipant.groupSessionId, id),
        eq(groupSessionParticipant.studentId, session.user.id),
        ne(groupSessionParticipant.status, 'CANCELLED')
      )
    )
    .limit(1)

  return NextResponse.json({ groupSession: gs, seatsLeft, roster, mySeat: mySeat ?? null })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const gs = await load(id)
  if (!gs) return NextResponse.json({ error: 'Group session not found' }, { status: 404 })
  if (gs.tutorId !== session.user.id) {
    return NextResponse.json({ error: 'Only the host can cancel this session' }, { status: 403 })
  }
  if (gs.status === 'CANCELLED') {
    return NextResponse.json({ success: true, alreadyCancelled: true })
  }

  // End the shared session so nobody can join a cancelled slot.
  if (gs.calendarEventId) {
    const [ev] = await drizzleDb
      .update(calendarEvent)
      .set({ status: 'CANCELLED', isCancelled: true, updatedAt: new Date() })
      .where(eq(calendarEvent.eventId, gs.calendarEventId))
      .returning({ externalId: calendarEvent.externalId })
    if (ev?.externalId) {
      await drizzleDb
        .update(liveSession)
        .set({ status: 'ended', endedAt: new Date() })
        .where(and(eq(liveSession.sessionId, ev.externalId), ne(liveSession.status, 'ended')))
    }
  }
  if (gs.liveSessionId) {
    await drizzleDb
      .update(liveSession)
      .set({ status: 'ended', endedAt: new Date() })
      .where(and(eq(liveSession.sessionId, gs.liveSessionId), ne(liveSession.status, 'ended')))
  }

  await drizzleDb
    .update(groupSession)
    .set({ status: 'CANCELLED', updatedAt: new Date() })
    .where(eq(groupSession.groupSessionId, id))

  // Refund every paid seat and release all held seats.
  const seats = await drizzleDb
    .select()
    .from(groupSessionParticipant)
    .where(
      and(
        eq(groupSessionParticipant.groupSessionId, id),
        inArray(groupSessionParticipant.status, ['RESERVED', 'PAID'])
      )
    )

  // Free sessions have no payment to refund.
  const isPaidSession = (gs.pricePerSeat ?? 0) > 0
  let refundedCount = 0
  for (const seat of seats) {
    if (seat.status === 'PAID' && isPaidSession) {
      const outcome = await refundGroupSeat(seat.participantId, 'Group session cancelled by host')
      if (outcome.refunded) refundedCount++
      notify({
        userId: seat.studentId,
        type: 'class',
        title: outcome.refunded ? 'Group session cancelled — refunded' : 'Group session cancelled',
        message: outcome.refunded
          ? `“${gs.title}” was cancelled. ${outcome.amount} ${outcome.currency ?? ''} was refunded (a 15% fee of ${outcome.fee} applied).`.trim()
          : `“${gs.title}” was cancelled. A refund is being processed.`,
        data: { groupSessionId: id, type: 'group-session-cancelled' },
      }).catch(() => {})
    } else {
      notify({
        userId: seat.studentId,
        type: 'class',
        title: 'Group session cancelled',
        message: `“${gs.title}” was cancelled by the host.`,
        data: { groupSessionId: id, type: 'group-session-cancelled' },
      }).catch(() => {})
    }
    await drizzleDb
      .update(groupSessionParticipant)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(groupSessionParticipant.participantId, seat.participantId))
  }

  return NextResponse.json({ success: true, refunded: refundedCount, seats: seats.length })
}
