import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession } from '@/lib/db/schema'

const ACTIVE_STATUSES: string[] = ['active', 'live', 'preparing', 'paused']

/**
 * Returns the first active LiveSession for a tutor, after auto-ending any that
 * have passed their scheduled end time (scheduledAt + durationMinutes).
 * Sessions the tutor explicitly left (tutorLeftAt is set) are excluded both at
 * the query level and by the lifecycle check, so they do not block entering
 * another session or re-entering the same one.
 *
 * Demo / ad-hoc demo sessions are excluded from conflict checks — they are not
 * considered "live" in the scheduled-session sense and may run alongside course
 * sessions.
 *
 * @param tutorId - tutor to inspect
 * @param opts.excludeSessionId - optional session that is allowed to remain active
 *                                (used when the tutor is rejoining the same room)
 * @returns the conflicting active session, or null if none
 */
export async function ensureSingleActiveSession(
  tutorId: string,
  opts?: { excludeSessionId?: string }
): Promise<typeof liveSession.$inferSelect | null> {
  const activeRows = await drizzleDb
    .select()
    .from(liveSession)
    .where(
      and(
        eq(liveSession.tutorId, tutorId),
        inArray(liveSession.status, ACTIVE_STATUSES as any),
        isNull(liveSession.tutorLeftAt),
        ne(liveSession.sessionType, 'GO_LIVE_DEMO')
      )
    )

  const now = Date.now()
  let remaining: typeof liveSession.$inferSelect | null = null

  for (const row of activeRows) {
    // The excluded session is allowed to remain active; do not return it as a
    // conflict and do not auto-end it here.
    if (opts?.excludeSessionId && row.sessionId === opts.excludeSessionId) {
      continue
    }

    const scheduledAt = row.scheduledAt ? new Date(row.scheduledAt).getTime() : 0
    const durationMs = (row.durationMinutes ?? 0) * 60_000
    const scheduledEndAt = scheduledAt + durationMs

    // Auto-end active sessions whose scheduled window has elapsed. Ad-hoc/demo
    // sessions without a scheduledAt cannot be auto-ended here; they remain
    // active until the tutor explicitly ends them.
    if (scheduledAt > 0 && durationMs > 0 && scheduledEndAt <= now) {
      try {
        await drizzleDb
          .update(liveSession)
          .set({ status: 'ended', endedAt: new Date() })
          .where(eq(liveSession.sessionId, row.sessionId))
        continue
      } catch (err) {
        console.error('[ensureSingleActiveSession] failed to auto-end session:', err)
      }
    }

    if (!remaining) {
      remaining = row
    }
  }

  return remaining
}

/**
 * Ends every active LiveSession for a tutor except the one identified by
 * `excludeSessionId`. This is used when the tutor enters a different scheduled
 * session (test-condition early entry) so that only one session is ever active
 * at a time; deployments and student joins therefore target the correct room.
 *
 * @param tutorId - tutor whose other active sessions should be ended
 * @param excludeSessionId - session that must remain active
 * @returns the number of sessions that were ended
 */
export async function endOtherActiveSessions(
  tutorId: string,
  excludeSessionId: string
): Promise<number> {
  const result = await drizzleDb
    .update(liveSession)
    .set({ status: 'ended', endedAt: new Date() })
    .where(
      and(
        eq(liveSession.tutorId, tutorId),
        inArray(liveSession.status, ACTIVE_STATUSES as any),
        ne(liveSession.sessionId, excludeSessionId)
      )
    )
  return result.rowCount ?? 0
}
