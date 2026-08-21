import { and, eq, inArray, isNull } from 'drizzle-orm'
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
        isNull(liveSession.tutorLeftAt)
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
