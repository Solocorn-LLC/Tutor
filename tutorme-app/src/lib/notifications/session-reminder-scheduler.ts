/**
 * Session reminder scheduler.
 *
 * Periodically finds upcoming live sessions entering a short lead window and
 * sends the tutor a `reminder` notification via the central notify() service —
 * which writes it to the notification table (so it shows in the bell), pushes it
 * over SSE, and optionally emails / web-pushes.
 *
 * Runs in the long-running custom server (server.ts). It is:
 *  - Idempotent / race-safe: each session is "claimed" with an atomic
 *    `UPDATE ... SET reminderSentAt = now WHERE reminderSentAt IS NULL`, so only
 *    one tick (and one server instance) ever sends a given reminder.
 *  - Resilient to brief sleeps: the lead window is wide, so a session that was
 *    missed while the instance was scaled down is still picked up on the next
 *    tick as long as it hasn't started yet.
 */

import { and, eq, gte, lte, inArray, isNull } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession } from '@/lib/db/schema'
import { notify } from './notify'

/** How far ahead of a session's start to send the reminder. */
const REMINDER_LEAD_MINUTES = 60
/** How often to scan for due reminders. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000
/** Delay the first scan so it doesn't compete with cold-start work. */
const INITIAL_DELAY_MS = 30 * 1000
/** Cap per tick so a backlog can't fan out unbounded work. */
const MAX_PER_TICK = 100

let started = false

/**
 * One scan: claim + notify for every session entering the lead window. Exported
 * for tests; the scheduler calls it on each tick.
 */
export async function runSessionReminderScan(): Promise<void> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60 * 1000)

  const due = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      tutorId: liveSession.tutorId,
      title: liveSession.title,
      scheduledAt: liveSession.scheduledAt,
    })
    .from(liveSession)
    .where(
      and(
        inArray(liveSession.status, ['scheduled', 'preparing']),
        isNull(liveSession.reminderSentAt),
        gte(liveSession.scheduledAt, now),
        lte(liveSession.scheduledAt, windowEnd)
      )
    )
    .limit(MAX_PER_TICK)

  for (const s of due) {
    if (!s.scheduledAt) continue

    // Atomically claim the reminder. Only the worker that flips reminderSentAt
    // from NULL gets to send — prevents duplicates across ticks and instances.
    const claimed = await drizzleDb
      .update(liveSession)
      .set({ reminderSentAt: now })
      .where(and(eq(liveSession.sessionId, s.sessionId), isNull(liveSession.reminderSentAt)))
      .returning({ id: liveSession.sessionId })
    if (claimed.length === 0) continue

    const minutes = Math.max(1, Math.round((s.scheduledAt.getTime() - Date.now()) / 60000))
    try {
      await notify({
        userId: s.tutorId,
        type: 'reminder',
        title: 'Upcoming session',
        message: `"${s.title}" starts in about ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        actionUrl: `/tutor/insights?sessionId=${encodeURIComponent(s.sessionId)}&view=classroom`,
        data: {
          sessionId: s.sessionId,
          scheduledAt: s.scheduledAt.toISOString(),
          kind: 'session-reminder',
        },
      })
    } catch (err) {
      console.error('[session-reminders] notify failed for session', s.sessionId, err)
    }
  }
}

/** Idempotent — starts the periodic scan once per process. */
export function startSessionReminderScheduler(): void {
  if (started) return
  started = true

  const tick = () => {
    void runSessionReminderScan().catch(err =>
      console.error('[session-reminders] tick error:', err)
    )
  }

  setTimeout(tick, INITIAL_DELAY_MS)
  const handle = setInterval(tick, CHECK_INTERVAL_MS)
  // Don't keep the process alive solely for this timer.
  if (typeof handle.unref === 'function') handle.unref()

  console.log('[session-reminders] scheduler started')
}
