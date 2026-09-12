/**
 * Integration tests — rolling schedule re-materialization.
 *
 * Bug: sessions were only materialized when a course was published or a
 * schedule was edited — exactly `weeksToSchedule` weeks from that moment.
 * Nothing topped them up, so ~8 weeks after the last publish/edit a course
 * silently ran out of sessions. The rolling job re-runs materialization daily;
 * these tests exercise runRollingScheduleMaterialization directly.
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 * All entities use the `roll_` prefix.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import crypto from 'crypto'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  user,
  course,
  courseSchedule,
  courseVariant,
  liveSession,
  calendarEvent,
} from '@/lib/db/schema'
import { runRollingScheduleMaterialization } from '@/lib/sessions/rolling-materialization'

const stamp = Date.now()
const tutorId = crypto.randomUUID()

const PUBLISHED_COURSE = `roll_pub_${stamp}`
const TEMPLATE_COURSE = `roll_tmpl_${stamp}`
const VARIANT_ID = `roll_var_${stamp}`
const SCHED_PUB = `roll_sched_pub_${stamp}`
const SCHED_PUB_DATES = `roll_sched_pub_dates_${stamp}`
const SCHED_TMPL = `roll_sched_tmpl_${stamp}`
const SCHEDULE_IDS = [SCHED_PUB, SCHED_PUB_DATES, SCHED_TMPL]

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

function utcDayString(msFromNow: number): string {
  return new Date(Date.now() + msFromNow).toISOString().slice(0, 10)
}

function slotFor(dateStr: string, time: string, durationMinutes: number) {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  return {
    dayOfWeek: DAY_NAMES[d.getUTCDay()],
    date: dateStr,
    startTime: time,
    durationMinutes,
  }
}

// Weekly recurring slot (no `date`) — the pattern that must keep topping up.
const WEEKLY_SLOT = { dayOfWeek: 'Monday', startTime: '10:00', durationMinutes: 60 }
// Date-specific slots: one in the future (materialized once, never repeated)
// and one in the past (must be skipped by the past-cutoff guard).
const FUTURE_DATE = utcDayString(10 * 86_400_000)
const PAST_DATE = utcDayString(-2 * 86_400_000)
const DATE_SLOTS = [slotFor(FUTURE_DATE, '14:00', 45), slotFor(PAST_DATE, '14:00', 45)]
const FUTURE_DATE_INSTANT = new Date(`${FUTURE_DATE}T14:00:00.000Z`)

async function sessionsForSchedule(scheduleId: string) {
  return drizzleDb
    .select({ sessionId: liveSession.sessionId, scheduledAt: liveSession.scheduledAt })
    .from(liveSession)
    .where(and(eq(liveSession.scheduleId, scheduleId), ne(liveSession.status, 'ended')))
}

async function totalForSchedules(): Promise<number> {
  const rows = await drizzleDb
    .select({ sessionId: liveSession.sessionId })
    .from(liveSession)
    .where(and(inArray(liveSession.scheduleId, SCHEDULE_IDS), ne(liveSession.status, 'ended')))
  return rows.length
}

describe('rolling schedule re-materialization', () => {
  beforeAll(async () => {
    const now = new Date()

    await drizzleDb.insert(user).values({
      userId: tutorId,
      email: `roll-tutor-${stamp}@example.com`,
      role: 'TUTOR',
      createdAt: now,
      updatedAt: now,
    })

    // The tutor deliberately has NO calendarAvailability row: the job must
    // fall back to UTC (asserted via the 10:00 UTC instants below).
    await drizzleDb.insert(course).values([
      {
        courseId: PUBLISHED_COURSE,
        name: `roll_pub_${stamp}`,
        creatorId: tutorId,
        categories: ['math'],
        isPublished: true,
      },
      {
        courseId: TEMPLATE_COURSE,
        name: `roll_tmpl_${stamp}`,
        creatorId: tutorId,
        categories: ['math'],
        isPublished: false,
      },
    ])

    // Template → published variant linkage: the template must be excluded even
    // though the variant family exists (template-scoped sessions would appear
    // under every variant).
    await drizzleDb.insert(courseVariant).values({
      variantId: VARIANT_ID,
      templateCourseId: TEMPLATE_COURSE,
      publishedCourseId: PUBLISHED_COURSE,
      nationality: 'other',
      category: 'math',
      createdAt: now,
      updatedAt: now,
    })

    await drizzleDb.insert(courseSchedule).values([
      {
        scheduleId: SCHED_PUB,
        courseId: PUBLISHED_COURSE,
        scheduleIndex: 1,
        schedule: [WEEKLY_SLOT],
        weeksToSchedule: 8,
        enrolledCount: 0,
      },
      {
        scheduleId: SCHED_PUB_DATES,
        courseId: PUBLISHED_COURSE,
        scheduleIndex: 2,
        schedule: DATE_SLOTS,
        weeksToSchedule: 8,
        enrolledCount: 0,
      },
      {
        scheduleId: SCHED_TMPL,
        courseId: TEMPLATE_COURSE,
        scheduleIndex: 1,
        schedule: [{ dayOfWeek: 'Wednesday', startTime: '15:00', durationMinutes: 60 }],
        weeksToSchedule: 8,
        enrolledCount: 0,
      },
    ])
  })

  afterAll(async () => {
    const scheduleSessions = await drizzleDb
      .select({ sessionId: liveSession.sessionId })
      .from(liveSession)
      .where(inArray(liveSession.scheduleId, SCHEDULE_IDS))

    await drizzleDb.delete(calendarEvent).where(
      inArray(
        calendarEvent.externalId,
        scheduleSessions.map(s => s.sessionId)
      )
    )
    await drizzleDb.delete(liveSession).where(inArray(liveSession.scheduleId, SCHEDULE_IDS))
    await drizzleDb.delete(courseSchedule).where(inArray(courseSchedule.scheduleId, SCHEDULE_IDS))
    await drizzleDb.delete(courseVariant).where(eq(courseVariant.variantId, VARIANT_ID))
    await drizzleDb
      .delete(course)
      .where(inArray(course.courseId, [PUBLISHED_COURSE, TEMPLATE_COURSE]))
    await drizzleDb.delete(user).where(eq(user.userId, tutorId))
  })

  it('tops up additional weeks as weeksAhead grows, with zero duplicates', async () => {
    // First run: only 1 week ahead → exactly one Monday 10:00 UTC session.
    const run1 = await runRollingScheduleMaterialization({ weeksAhead: 1 })
    const after1 = await sessionsForSchedule(SCHED_PUB)
    expect(after1).toHaveLength(1)
    expect(after1[0].scheduledAt.getUTCDay()).toBe(1) // Monday
    expect(after1[0].scheduledAt.getUTCHours()).toBe(10)
    expect(after1[0].scheduledAt.getUTCMinutes()).toBe(0)

    // Second run with a larger horizon: the existing slot is kept, the two
    // newly entered weeks are added — total equals the distinct instants.
    const run2 = await runRollingScheduleMaterialization({ weeksAhead: 3 })
    const after2 = await sessionsForSchedule(SCHED_PUB)
    expect(after2).toHaveLength(3)

    const instants = after2.map(r => new Date(r.scheduledAt).getTime()).sort((a, b) => a - b)
    const distinct = new Set(instants)
    expect(distinct.size).toBe(3)
    // Exactly one per week, 7 days apart.
    expect(instants[1] - instants[0]).toBe(7 * 86_400_000)
    expect(instants[2] - instants[1]).toBe(7 * 86_400_000)
    for (const t of instants) {
      expect(new Date(t).getUTCHours()).toBe(10)
      expect(new Date(t).getUTCMinutes()).toBe(0)
    }

    // Both runs reported no failures.
    expect(run1.errors).toBe(0)
    expect(run2.errors).toBe(0)
  })

  it('is idempotent: a repeat run with the same horizon creates nothing', async () => {
    const before = await totalForSchedules()
    const run = await runRollingScheduleMaterialization({ weeksAhead: 3 })
    const after = await totalForSchedules()

    expect(after).toBe(before)
    // The weekly schedule already covers the full 3-week horizon: nothing new.
    const weekly = await sessionsForSchedule(SCHED_PUB)
    expect(weekly).toHaveLength(3)
    expect(run.errors).toBe(0)
  })

  it('never materializes template-course schedules (even with a published variant)', async () => {
    const run = await runRollingScheduleMaterialization({ weeksAhead: 2 })

    const templateSessions = await sessionsForSchedule(SCHED_TMPL)
    expect(templateSessions).toHaveLength(0)

    // Date-specific slots: exactly one session for the future date (never
    // repeated regardless of weeksAhead); the past date is skipped.
    const dateSessions = await sessionsForSchedule(SCHED_PUB_DATES)
    expect(dateSessions).toHaveLength(1)
    expect(
      Math.abs(dateSessions[0].scheduledAt.getTime() - FUTURE_DATE_INSTANT.getTime())
    ).toBeLessThan(1000)

    expect(run.errors).toBe(0)
  })

  it('reports counts consistent with the materialized rows', async () => {
    const before = await totalForSchedules()
    const run = await runRollingScheduleMaterialization({ weeksAhead: 4 })
    const after = await totalForSchedules()

    // Horizon grew 3 → 4 for the weekly slot: exactly one new session for our
    // schedules. Other suites may have their own published courses in the
    // shared DB during a parallel run, so only our rows are compared exactly.
    expect(after - before).toBe(1)
    expect(run.errors).toBe(0)
    expect(run.schedulesScanned).toBeGreaterThanOrEqual(2)
    // The job's global tally must cover at least what it created for us.
    expect(run.sessionsCreated).toBeGreaterThanOrEqual(after - before)

    // Final state: 4 weekly instants + 1 date-specific instant, no duplicates.
    const weekly = await sessionsForSchedule(SCHED_PUB)
    expect(weekly).toHaveLength(4)
    const instants = weekly.map(r => new Date(r.scheduledAt).getTime())
    expect(new Set(instants).size).toBe(4)
  })
})
