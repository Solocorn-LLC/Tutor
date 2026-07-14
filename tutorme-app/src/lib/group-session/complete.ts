/**
 * Mark finished group sessions COMPLETED.
 *
 * An OPEN/FULL group session otherwise lingers in that state forever after it
 * ends. This flips it to COMPLETED once its scheduled end (plus a grace period,
 * so a session running long isn't cut off) has passed. `status` is plain text, so
 * no enum migration is needed. CANCELLED sessions are left as-is.
 */

import { and, eq, inArray, lte } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { groupSession } from '@/lib/db/schema'
import { bookingInstants } from '@/lib/one-on-one/time'

/** Grace after the scheduled end before a session counts as finished. */
const COMPLETION_GRACE_MS = 60 * 60 * 1000

export async function completeFinishedGroupSessions(
  opts: { tutorId?: string } = {}
): Promise<number> {
  const now = Date.now()

  const conditions = [
    inArray(groupSession.status, ['OPEN', 'FULL']),
    // Coarse pre-filter (widened a day for far-east timezones); exact end below.
    lte(groupSession.requestedDate, new Date(now + 24 * 60 * 60 * 1000)),
  ]
  if (opts.tutorId) conditions.push(eq(groupSession.tutorId, opts.tutorId))

  const candidates = await drizzleDb
    .select({
      groupSessionId: groupSession.groupSessionId,
      requestedDate: groupSession.requestedDate,
      startTime: groupSession.startTime,
      endTime: groupSession.endTime,
      timezone: groupSession.timezone,
    })
    .from(groupSession)
    .where(and(...conditions))

  const finished = candidates.filter(g => {
    const { end } = bookingInstants(g)
    return Number.isFinite(end.getTime()) && end.getTime() + COMPLETION_GRACE_MS < now
  })
  if (finished.length === 0) return 0

  await drizzleDb
    .update(groupSession)
    .set({ status: 'COMPLETED', updatedAt: new Date() })
    .where(
      inArray(
        groupSession.groupSessionId,
        finished.map(g => g.groupSessionId)
      )
    )

  return finished.length
}
