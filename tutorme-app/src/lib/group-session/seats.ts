/**
 * Group-session seat accounting shared by the API routes and the payment
 * webhooks. A seat counts against capacity while it is RESERVED or PAID; a
 * CANCELLED seat frees capacity.
 */

import { and, eq, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { drizzleDb } from '@/lib/db/drizzle'
import { groupSession, groupSessionParticipant, sessionParticipant } from '@/lib/db/schema'

/** Seats currently held (RESERVED or PAID) for a group session. */
export async function countActiveSeats(groupSessionId: string): Promise<number> {
  const [row] = await drizzleDb
    .select({ n: sql<number>`count(*)::int` })
    .from(groupSessionParticipant)
    .where(
      and(
        eq(groupSessionParticipant.groupSessionId, groupSessionId),
        inArray(groupSessionParticipant.status, ['RESERVED', 'PAID'])
      )
    )
  return row?.n ?? 0
}

/**
 * Mark a reserved seat as PAID and admit the student to the shared room. Called
 * from the payment webhook once a seat's payment clears. Idempotent: safe to run
 * again if the webhook is redelivered. Also flips the session to FULL when the
 * last seat sells. Returns the affected group session id (or null if unknown).
 */
export async function admitPaidSeat(
  participantId: string,
  paymentId?: string
): Promise<string | null> {
  const [seat] = await drizzleDb
    .select()
    .from(groupSessionParticipant)
    .where(eq(groupSessionParticipant.participantId, participantId))
    .limit(1)
  if (!seat) return null

  if (seat.status !== 'PAID') {
    await drizzleDb
      .update(groupSessionParticipant)
      .set({ status: 'PAID', paidAt: new Date(), paymentId: paymentId ?? seat.paymentId })
      .where(eq(groupSessionParticipant.participantId, participantId))
  }

  const [gs] = await drizzleDb
    .select()
    .from(groupSession)
    .where(eq(groupSession.groupSessionId, seat.groupSessionId))
    .limit(1)
  if (!gs) return seat.groupSessionId

  // Let the student into the shared live session so they can enter the room.
  if (gs.liveSessionId) {
    await drizzleDb
      .insert(sessionParticipant)
      .values({
        participantId: nanoid(),
        sessionId: gs.liveSessionId,
        studentId: seat.studentId,
        joinedAt: new Date(),
      })
      .onConflictDoNothing()
  }

  // Flip to FULL once every seat is taken (don't downgrade a CANCELLED session).
  if (gs.status === 'OPEN') {
    const taken = await countActiveSeats(seat.groupSessionId)
    if (taken >= gs.capacity) {
      await drizzleDb
        .update(groupSession)
        .set({ status: 'FULL' })
        .where(eq(groupSession.groupSessionId, seat.groupSessionId))
    }
  }

  return seat.groupSessionId
}
