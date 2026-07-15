/**
 * Reserve or release a seat in a group session.
 *
 * POST   → a student claims a seat (RESERVED). Returns { participantId }; the
 *          client then starts checkout via /api/payments/create with
 *          `groupSessionParticipantId`. The seat isn't confirmed until the
 *          payment webhook flips it to PAID.
 * DELETE → the student releases their seat. A PAID seat is refunded (85%, 15%
 *          fee); the freed seat re-opens the session and pings the waitlist.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { drizzleDb } from '@/lib/db/drizzle'
import { groupSession, groupSessionParticipant, sessionParticipant } from '@/lib/db/schema'
import { notify } from '@/lib/notifications/notify'
import { refundGroupSeat } from '@/lib/payments/refund-group-session'
import { admitPaidSeat } from '@/lib/group-session/seats'
import { getOrCreateConversation } from '@/lib/messaging/conversation'
import { notifyWaitlistOfOpening } from '@/lib/one-on-one/waitlist'
import { bookingInstants } from '@/lib/one-on-one/time'
import { expireStaleGroupSeats } from '@/lib/group-session/expire-seats'

async function load(id: string) {
  const [gs] = await drizzleDb
    .select()
    .from(groupSession)
    .where(eq(groupSession.groupSessionId, id))
    .limit(1)
  return gs ?? null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions, req)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Only students can book a seat' }, { status: 403 })
    }
    const { id } = await params

    const gs = await load(id)
    if (!gs) return NextResponse.json({ error: 'Group session not found' }, { status: 404 })
    if (gs.status === 'CANCELLED') {
      return NextResponse.json({ error: 'This session was cancelled' }, { status: 400 })
    }
    const { start } = bookingInstants(gs)
    if (start.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'This session has already started' }, { status: 400 })
    }

    // Release any abandoned reservations first so the capacity check below sees
    // seats freed by students who never completed checkout.
    await expireStaleGroupSeats({ groupSessionId: id }).catch(() => {})

    // Re-use an existing seat if the student already holds one.
    const [existing] = await drizzleDb
      .select()
      .from(groupSessionParticipant)
      .where(
        and(
          eq(groupSessionParticipant.groupSessionId, id),
          eq(groupSessionParticipant.studentId, session.user.id)
        )
      )
      .limit(1)

    if (existing && existing.status === 'PAID') {
      return NextResponse.json(
        { error: 'You already have a seat in this session' },
        { status: 409 }
      )
    }

    const isFree = (gs.pricePerSeat ?? 0) <= 0

    // Resolve the seat row: reuse an existing RESERVED hold, revive a CANCELLED
    // one, or create a new one (capacity-gated for a genuinely new seat).
    let participantId: string
    if (existing && existing.status === 'RESERVED') {
      participantId = existing.participantId
    } else {
      // Serialize concurrent seat claims for THIS session so two students racing
      // for the last seat can't both pass the capacity check (oversell). Lock the
      // GroupSession row, then re-count active seats and claim one atomically.
      const claim = await drizzleDb.transaction(async tx => {
        await tx.execute(sql`SELECT 1 FROM "GroupSession" WHERE id = ${id} FOR UPDATE`)
        const [seatCount] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(groupSessionParticipant)
          .where(
            and(
              eq(groupSessionParticipant.groupSessionId, id),
              inArray(groupSessionParticipant.status, ['RESERVED', 'PAID'])
            )
          )
        if ((seatCount?.n ?? 0) >= gs.capacity) return { full: true as const }
        if (existing) {
          await tx
            .update(groupSessionParticipant)
            .set({ status: 'RESERVED', reservedAt: new Date(), paidAt: null, paymentId: null })
            .where(eq(groupSessionParticipant.participantId, existing.participantId))
          return { full: false as const, participantId: existing.participantId }
        }
        const pid = nanoid()
        await tx.insert(groupSessionParticipant).values({
          participantId: pid,
          groupSessionId: id,
          studentId: session.user.id,
          status: 'RESERVED',
        })
        return { full: false as const, participantId: pid }
      })
      if (claim.full) {
        return NextResponse.json({ error: 'This session is full' }, { status: 409 })
      }
      participantId = claim.participantId
    }

    // Free session: confirm the seat immediately (no checkout) — admit to the
    // room and open the student↔tutor chat, mirroring the paid webhook.
    if (isFree) {
      await admitPaidSeat(participantId)
      getOrCreateConversation(session.user.id, gs.tutorId).catch(() => {})
      return NextResponse.json({ success: true, free: true, confirmed: true, participantId })
    }

    return NextResponse.json({ success: true, participantId })
  } catch (err) {
    console.error('group seat reserve failed:', err)
    return NextResponse.json({ error: 'Failed to reserve a seat' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const gs = await load(id)
  if (!gs) return NextResponse.json({ error: 'Group session not found' }, { status: 404 })

  const [seat] = await drizzleDb
    .select()
    .from(groupSessionParticipant)
    .where(
      and(
        eq(groupSessionParticipant.groupSessionId, id),
        eq(groupSessionParticipant.studentId, session.user.id)
      )
    )
    .limit(1)
  if (!seat || seat.status === 'CANCELLED') {
    return NextResponse.json({ error: 'You have no seat to release' }, { status: 404 })
  }

  let refundResult = null
  if (seat.status === 'PAID') {
    // Free seats have no payment to refund.
    if ((gs.pricePerSeat ?? 0) > 0) {
      refundResult = await refundGroupSeat(seat.participantId, 'Seat released by student')
    }
    // Remove them from the shared room roster.
    if (gs.liveSessionId) {
      await drizzleDb
        .delete(sessionParticipant)
        .where(
          and(
            eq(sessionParticipant.sessionId, gs.liveSessionId),
            eq(sessionParticipant.studentId, session.user.id)
          )
        )
    }
  }

  await drizzleDb
    .update(groupSessionParticipant)
    .set({ status: 'CANCELLED', updatedAt: new Date() })
    .where(eq(groupSessionParticipant.participantId, seat.participantId))

  // A freed seat re-opens a FULL session and may interest the waitlist.
  if (gs.status === 'FULL') {
    await drizzleDb
      .update(groupSession)
      .set({ status: 'OPEN', updatedAt: new Date() })
      .where(eq(groupSession.groupSessionId, id))
  }
  if (gs.status !== 'CANCELLED') void notifyWaitlistOfOpening(gs.tutorId)

  if (seat.status === 'PAID') {
    notify({
      userId: gs.tutorId,
      type: 'class',
      title: 'Group seat released',
      message: `A student released their seat in “${gs.title}”.`,
      data: { groupSessionId: id, type: 'group-seat-released' },
    }).catch(() => {})
  }

  return NextResponse.json({
    success: true,
    refunded: refundResult?.refunded ?? false,
    refundAmount: refundResult?.amount,
    refundFee: refundResult?.fee,
  })
}
