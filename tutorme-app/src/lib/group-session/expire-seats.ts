/**
 * Release stale group-session seat reservations.
 *
 * Booking a seat in a PAID session creates a RESERVED seat and sends the student
 * to checkout. If they abandon it, the seat would otherwise hold capacity forever
 * (countActiveSeats counts RESERVED) — blocking others, and permanently blocking a
 * 1-seat (true 1-on-1) session. This cancels RESERVED seats left unpaid past a
 * short window, frees the capacity, re-opens a FULL session, and pings the
 * waitlist. Free sessions confirm to PAID on reserve, so they never match.
 */

import { and, eq, inArray, isNull, lt } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { groupSession, groupSessionParticipant } from '@/lib/db/schema'
import { notifyWaitlistOfOpening } from '@/lib/one-on-one/waitlist'

/** How long a student has to complete checkout before their seat is released. */
const RESERVATION_TTL_MS = 30 * 60 * 1000

export async function expireStaleGroupSeats(
  opts: { groupSessionId?: string } = {}
): Promise<number> {
  const cutoff = new Date(Date.now() - RESERVATION_TTL_MS)

  const conditions = [
    eq(groupSessionParticipant.status, 'RESERVED'),
    isNull(groupSessionParticipant.paidAt),
    lt(groupSessionParticipant.reservedAt, cutoff),
  ]
  if (opts.groupSessionId) {
    conditions.push(eq(groupSessionParticipant.groupSessionId, opts.groupSessionId))
  }

  const stale = await drizzleDb
    .select({
      participantId: groupSessionParticipant.participantId,
      groupSessionId: groupSessionParticipant.groupSessionId,
    })
    .from(groupSessionParticipant)
    .where(and(...conditions))

  if (stale.length === 0) return 0

  await drizzleDb
    .update(groupSessionParticipant)
    .set({ status: 'CANCELLED', updatedAt: new Date() })
    .where(
      inArray(
        groupSessionParticipant.participantId,
        stale.map(s => s.participantId)
      )
    )

  // Re-open any session that was FULL, and let its waitlist know a seat opened.
  for (const gsId of new Set(stale.map(s => s.groupSessionId))) {
    const [gs] = await drizzleDb
      .select({ status: groupSession.status, tutorId: groupSession.tutorId })
      .from(groupSession)
      .where(eq(groupSession.groupSessionId, gsId))
      .limit(1)
    if (!gs) continue
    if (gs.status === 'FULL') {
      await drizzleDb
        .update(groupSession)
        .set({ status: 'OPEN', updatedAt: new Date() })
        .where(eq(groupSession.groupSessionId, gsId))
    }
    if (gs.status !== 'CANCELLED') void notifyWaitlistOfOpening(gs.tutorId)
  }

  return stale.length
}
