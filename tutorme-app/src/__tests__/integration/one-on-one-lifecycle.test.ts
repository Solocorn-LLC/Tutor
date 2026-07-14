/**
 * Integration test: 1-on-1 lifecycle sweeps + series total.
 *
 * - expireOverdueOneOnOneBookings: an ACCEPTED, unpaid, past-due hold flips to
 *   EXPIRED and its calendar event is cancelled (slot freed). A series with no
 *   payment window set is left alone.
 * - completeFinishedOneOnOneSessions: a PAID session past its end flips to
 *   COMPLETED.
 * - unpaidSeriesTotal: sums every ACCEPTED, unpaid session in a series.
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import crypto from 'crypto'
import { eq, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  user,
  liveSession,
  calendarEvent,
  oneOnOneBookingRequest,
  notification,
} from '@/lib/db/schema'
import { expireOverdueOneOnOneBookings } from '@/lib/one-on-one/expire'
import { completeFinishedOneOnOneSessions } from '@/lib/one-on-one/complete'
import { unpaidSeriesTotal } from '@/lib/one-on-one/series-total'

const stamp = Date.now()
const tutorId = crypto.randomUUID()
const studentId = crypto.randomUUID()
const userIds = [tutorId, studentId]

const expireReqId = `oo_expire_${stamp}`
const expireEventId = `ce_expire_${stamp}`
const expireSessionId = `ls_expire_${stamp}`

const completeReqId = `oo_complete_${stamp}`
const completeEventId = `ce_complete_${stamp}`
const completeSessionId = `ls_complete_${stamp}`

const seriesId = `series_${stamp}`
const seriesReqIds = [`oo_s0_${stamp}`, `oo_s1_${stamp}`, `oo_s2_${stamp}`]

const reqIds = [expireReqId, completeReqId, ...seriesReqIds]
const eventIds = [expireEventId, completeEventId]
const sessionIds = [expireSessionId, completeSessionId]

function event(id: string, sessionId: string, start: Date, end: Date) {
  return {
    eventId: id,
    tutorId,
    title: '1-on-1',
    type: 'CONSULTATION' as const,
    status: 'CONFIRMED' as const,
    startTime: start,
    endTime: end,
    timezone: 'UTC',
    isAllDay: false,
    isRecurring: false,
    isVirtual: true,
    maxAttendees: 2,
    createdBy: tutorId,
    isCancelled: false,
    studentId,
    externalId: sessionId,
  }
}

function booking(id: string, extra: Record<string, unknown>) {
  return {
    requestId: id,
    tutorId,
    studentId,
    requestedDate: new Date('2026-07-15T00:00:00.000Z'),
    startTime: '15:00',
    endTime: '16:00',
    timezone: 'UTC',
    durationMinutes: 60,
    costPerSession: 45,
    status: 'ACCEPTED' as const,
    ...extra,
  }
}

describe('1-on-1 lifecycle sweeps', () => {
  beforeAll(async () => {
    const now = Date.now()
    await drizzleDb.insert(user).values([
      {
        userId: tutorId,
        email: `oo-tutor-${stamp}@ex.com`,
        role: 'TUTOR',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        userId: studentId,
        email: `oo-stu-${stamp}@ex.com`,
        role: 'STUDENT',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    await drizzleDb.insert(liveSession).values([
      {
        sessionId: expireSessionId,
        tutorId,
        title: 'expire',
        category: 'general',
        status: 'scheduled',
        scheduledAt: new Date(now + 24 * 3600 * 1000),
      },
      {
        sessionId: completeSessionId,
        tutorId,
        title: 'complete',
        category: 'general',
        status: 'scheduled',
        scheduledAt: new Date('2026-07-10T15:00:00.000Z'),
      },
    ])
    await drizzleDb
      .insert(calendarEvent)
      .values([
        event(
          expireEventId,
          expireSessionId,
          new Date(now + 24 * 3600 * 1000),
          new Date(now + 25 * 3600 * 1000)
        ),
        event(
          completeEventId,
          completeSessionId,
          new Date('2026-07-10T15:00:00.000Z'),
          new Date('2026-07-10T16:00:00.000Z')
        ),
      ])
    await drizzleDb.insert(oneOnOneBookingRequest).values([
      // Overdue, unpaid → should EXPIRE.
      booking(expireReqId, {
        status: 'ACCEPTED',
        paidAt: null,
        paymentDueAt: new Date(now - 60 * 60 * 1000),
        calendarEventId: expireEventId,
      }),
      // Paid, ended days ago → should COMPLETE.
      booking(completeReqId, {
        status: 'PAID',
        paidAt: new Date(now - 3 * 24 * 3600 * 1000),
        calendarEventId: completeEventId,
        requestedDate: new Date('2026-07-10T00:00:00.000Z'),
      }),
      // Series: 3 ACCEPTED unpaid, no payment window → left alone by expiry.
      booking(seriesReqIds[0], { seriesId, seriesIndex: 0, status: 'ACCEPTED', paidAt: null }),
      booking(seriesReqIds[1], { seriesId, seriesIndex: 1, status: 'ACCEPTED', paidAt: null }),
      booking(seriesReqIds[2], { seriesId, seriesIndex: 2, status: 'ACCEPTED', paidAt: null }),
    ])
  })

  afterAll(async () => {
    await drizzleDb
      .delete(oneOnOneBookingRequest)
      .where(inArray(oneOnOneBookingRequest.requestId, reqIds))
    await drizzleDb.delete(calendarEvent).where(inArray(calendarEvent.eventId, eventIds))
    await drizzleDb.delete(liveSession).where(inArray(liveSession.sessionId, sessionIds))
    await drizzleDb.delete(notification).where(inArray(notification.userId, userIds))
    await drizzleDb.delete(user).where(inArray(user.userId, userIds))
  })

  it('sums every accepted, unpaid session in a series', async () => {
    const { count, total } = await unpaidSeriesTotal(seriesId)
    expect(count).toBe(3)
    expect(total).toBe(135)
  })

  it('expires an overdue unpaid hold and cancels its calendar event', async () => {
    await expireOverdueOneOnOneBookings({ studentId })

    const [expired] = await drizzleDb
      .select({ status: oneOnOneBookingRequest.status })
      .from(oneOnOneBookingRequest)
      .where(eq(oneOnOneBookingRequest.requestId, expireReqId))
    expect(expired.status).toBe('EXPIRED')

    const [ev] = await drizzleDb
      .select({ isCancelled: calendarEvent.isCancelled })
      .from(calendarEvent)
      .where(eq(calendarEvent.eventId, expireEventId))
    expect(ev.isCancelled).toBe(true)

    // A series with no payment window is not touched by the expiry sweep.
    const [seriesHead] = await drizzleDb
      .select({ status: oneOnOneBookingRequest.status })
      .from(oneOnOneBookingRequest)
      .where(eq(oneOnOneBookingRequest.requestId, seriesReqIds[0]))
    expect(seriesHead.status).toBe('ACCEPTED')
  })

  it('marks a paid, finished session COMPLETED', async () => {
    await completeFinishedOneOnOneSessions({ studentId })

    const [done] = await drizzleDb
      .select({ status: oneOnOneBookingRequest.status })
      .from(oneOnOneBookingRequest)
      .where(eq(oneOnOneBookingRequest.requestId, completeReqId))
    expect(done.status).toBe('COMPLETED')
  })
})
