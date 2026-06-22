/**
 * Integration test: session-reminder scheduler writes reminders into the bell.
 *
 * Verifies the scan: an upcoming session within the lead window produces a
 * `reminder` notification (the row the bell reads) for the tutor, sets
 * reminderSentAt, and is idempotent (a second scan sends nothing). Sessions
 * outside the window or already reminded are left alone.
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import crypto from 'crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, liveSession, notification } from '@/lib/db/schema'
import { runSessionReminderScan } from '@/lib/notifications/session-reminder-scheduler'

const stamp = Date.now()
const tutorId = crypto.randomUUID()
const tutorEmail = `claude-remind-tutor-${stamp}@example.com`

const soonId = `sess_soon_${stamp}` // within the 60-min lead window
const laterId = `sess_later_${stamp}` // outside the window
const doneId = `sess_done_${stamp}` // already reminded

function reminderRows() {
  return drizzleDb
    .select({ id: notification.notificationId, type: notification.type, data: notification.data })
    .from(notification)
    .where(and(eq(notification.userId, tutorId), eq(notification.type, 'reminder')))
}

describe('session reminder scheduler', () => {
  beforeAll(async () => {
    const now = Date.now()
    await drizzleDb.insert(user).values({
      userId: tutorId,
      email: tutorEmail,
      role: 'TUTOR',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await drizzleDb.insert(liveSession).values([
      {
        sessionId: soonId,
        tutorId,
        title: 'Algebra (soon)',
        category: 'general',
        status: 'scheduled',
        scheduledAt: new Date(now + 30 * 60 * 1000),
      },
      {
        sessionId: laterId,
        tutorId,
        title: 'History (later)',
        category: 'general',
        status: 'scheduled',
        scheduledAt: new Date(now + 5 * 60 * 60 * 1000),
      },
      {
        sessionId: doneId,
        tutorId,
        title: 'Already reminded',
        category: 'general',
        status: 'scheduled',
        scheduledAt: new Date(now + 20 * 60 * 1000),
        reminderSentAt: new Date(now - 60 * 1000),
      },
    ])
  })

  afterAll(async () => {
    const t = async (fn: () => Promise<unknown>) => {
      try {
        await fn()
      } catch {}
    }
    await t(() => drizzleDb.delete(notification).where(eq(notification.userId, tutorId)))
    await t(() =>
      drizzleDb.delete(liveSession).where(inArray(liveSession.sessionId, [soonId, laterId, doneId]))
    )
    await t(() => drizzleDb.delete(user).where(eq(user.userId, tutorId)))
  })

  it('sends one reminder for the imminent session only, and is idempotent', async () => {
    await runSessionReminderScan()

    const rows = await reminderRows()
    expect(rows).toHaveLength(1)
    expect((rows[0].data as { sessionId?: string })?.sessionId).toBe(soonId)

    // reminderSentAt claimed on the imminent session; window/already-done untouched.
    const [soon] = await drizzleDb
      .select({ reminderSentAt: liveSession.reminderSentAt })
      .from(liveSession)
      .where(eq(liveSession.sessionId, soonId))
      .limit(1)
    expect(soon?.reminderSentAt).toBeTruthy()

    const [later] = await drizzleDb
      .select({ reminderSentAt: liveSession.reminderSentAt })
      .from(liveSession)
      .where(eq(liveSession.sessionId, laterId))
      .limit(1)
    expect(later?.reminderSentAt).toBeNull()

    // Second scan must not create a duplicate (claim already taken).
    await runSessionReminderScan()
    const after = await reminderRows()
    expect(after).toHaveLength(1)
  })
})
