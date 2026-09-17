/**
 * Integration tests — rolling schedule re-materialization.
 *
 * Bug: sessions were only materialized when a course was published or a
 * schedule was edited — exactly `weeksToSchedule` weeks from that moment.
 * Nothing topped them up, so ~8 weeks after the last publish/edit a course
 * silently ran out of sessions. The rolling job re-runs materialization daily;
 * these tests exercise runRollingScheduleMaterialization directly.
 *
 * The job must top up missing sessions inside each schedule's OWN horizon
 * (schedule createdAt + weeksToSchedule weeks) but never create occurrences
 * beyond it.
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
const STALE_COURSE = `roll_stale_${stamp}`
const HORIZON_COURSE = `roll_horizon_${stamp}`
const VARIANT_ID = `roll_var_${stamp}`
const SCHED_PUB = `roll_sched_pub_${stamp}`
const SCHED_PUB_DATES = `roll_sched_pub_dates_${stamp}`
const SCHED_TMPL = `roll_sched_tmpl_${stamp}`
const SCHED_STALE = `roll_sched_stale_${stamp}`
const SCHED_HORIZON = `roll_sched_horizon_${stamp}`
const SCHEDULE_IDS = [SCHED_PUB, SCHED_PUB_DATES, SCHED_TMPL, SCHED_STALE, SCHED_HORIZON]
const COURSE_IDS = [PUBLISHED_COURSE, TEMPLATE_COURSE, STALE_COURSE, HORIZON_COURSE]

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
      {
        // Abandoned course: published months ago, never touched since, no
        // sessions. The liveness gate must keep it from being topped up.
        courseId: STALE_COURSE,
        name: `roll_stale_${stamp}`,
        creatorId: tutorId,
        categories: ['math'],
        isPublished: true,
        createdAt: new Date(Date.now() - 120 * 86_400_000),
        updatedAt: new Date(Date.now() - 120 * 86_400_000),
      },
      {
        // Active course whose schedule was created 6 weeks ago with an
        // 8-week horizon: the horizon end (~2 weeks from now) lies in the
        // future, so the job must backfill in-horizon occurrences but never
        // create anything past the horizon end.
        courseId: HORIZON_COURSE,
        name: `roll_horizon_${stamp}`,
        creatorId: tutorId,
        categories: ['math'],
        isPublished: true,
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
        // Starts at 1 week; the first test grows the configured horizon.
        weeksToSchedule: 1,
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
      {
        scheduleId: SCHED_STALE,
        courseId: STALE_COURSE,
        scheduleIndex: 1,
        schedule: [WEEKLY_SLOT],
        weeksToSchedule: 8,
        enrolledCount: 0,
      },
      {
        scheduleId: SCHED_HORIZON,
        courseId: HORIZON_COURSE,
        scheduleIndex: 1,
        schedule: [{ dayOfWeek: 'Tuesday', startTime: '12:00', durationMinutes: 60 }],
        weeksToSchedule: 8,
        enrolledCount: 0,
        createdAt: new Date(Date.now() - 6 * 7 * 86_400_000),
        updatedAt: new Date(Date.now() - 6 * 7 * 86_400_000),
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
    await drizzleDb.delete(course).where(inArray(course.courseId, COURSE_IDS))
    await drizzleDb.delete(user).where(eq(user.userId, tutorId))
  })

  it("tops up additional weeks as the schedule's configured weeksToSchedule grows, with zero duplicates", async () => {
    // First run: schedule configured for 1 week → exactly one Monday 10:00 UTC
    // session. The job always uses the schedule's own weeksToSchedule; there is
    // no override.
    const run1 = await runRollingScheduleMaterialization()
    const after1 = await sessionsForSchedule(SCHED_PUB)
    expect(after1).toHaveLength(1)
    expect(after1[0].scheduledAt.getUTCDay()).toBe(1) // Monday
    expect(after1[0].scheduledAt.getUTCHours()).toBe(10)
    expect(after1[0].scheduledAt.getUTCMinutes()).toBe(0)

    // Widen the schedule's configured horizon to 3 weeks (as a tutor would in
    // the scheduler UI): the existing slot is kept, the two newly entered
    // weeks are added — total equals the distinct instants.
    await drizzleDb
      .update(courseSchedule)
      .set({ weeksToSchedule: 3 })
      .where(eq(courseSchedule.scheduleId, SCHED_PUB))
    const run2 = await runRollingScheduleMaterialization()
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

  it("never creates occurrences beyond the schedule's own configured horizon", async () => {
    // SCHED_HORIZON: createdAt = now - 6 weeks, weeksToSchedule = 8 → the
    // horizon ends ~2 weeks from now. Wipe any sessions earlier tests created
    // so this run starts clean: generation would produce 8 weekly instants,
    // and everything after the horizon end must be dropped.
    const existing = await drizzleDb
      .select({ sessionId: liveSession.sessionId })
      .from(liveSession)
      .where(eq(liveSession.scheduleId, SCHED_HORIZON))
    await drizzleDb.delete(calendarEvent).where(
      inArray(
        calendarEvent.externalId,
        existing.map(s => s.sessionId)
      )
    )
    await drizzleDb.delete(liveSession).where(eq(liveSession.scheduleId, SCHED_HORIZON))

    const run = await runRollingScheduleMaterialization()

    const horizonEnd = new Date(Date.now() - 6 * 7 * 86_400_000 + 8 * 7 * 86_400_000)
    const sessions = await sessionsForSchedule(SCHED_HORIZON)
    // The remaining in-horizon weeks (next Tuesday + the one after) must be
    // backfilled…
    expect(sessions.length).toBeGreaterThanOrEqual(2)
    // …but the uncapped generation would have produced 8 — the cap must have bit.
    expect(sessions.length).toBeLessThan(8)
    for (const s of sessions) {
      expect(new Date(s.scheduledAt).getTime()).toBeLessThanOrEqual(horizonEnd.getTime() + 1000)
    }
    expect(run.errors).toBe(0)
  })

  it('is idempotent: a repeat run with the same horizon creates nothing', async () => {
    const before = await totalForSchedules()
    const run = await runRollingScheduleMaterialization()
    const after = await totalForSchedules()

    expect(after).toBe(before)
    // The weekly schedule already covers its full configured horizon: nothing new.
    const weekly = await sessionsForSchedule(SCHED_PUB)
    expect(weekly).toHaveLength(3)
    expect(run.errors).toBe(0)
  })

  it('never materializes template-course schedules (even with a published variant)', async () => {
    const run = await runRollingScheduleMaterialization()

    const templateSessions = await sessionsForSchedule(SCHED_TMPL)
    expect(templateSessions).toHaveLength(0)

    // Date-specific slots: exactly one session for the future date (never
    // repeated); the past date is skipped.
    const dateSessions = await sessionsForSchedule(SCHED_PUB_DATES)
    expect(dateSessions).toHaveLength(1)
    expect(
      Math.abs(dateSessions[0].scheduledAt.getTime() - FUTURE_DATE_INSTANT.getTime())
    ).toBeLessThan(1000)

    expect(run.errors).toBe(0)
  })

  it('never tops up abandoned courses with no recent activity (liveness gate)', async () => {
    // STALE_COURSE was "updated" 120 days ago and has no sessions at all: it
    // must be ignored even though it is still published.
    const run = await runRollingScheduleMaterialization()

    const staleSessions = await sessionsForSchedule(SCHED_STALE)
    expect(staleSessions).toHaveLength(0)
    expect(run.errors).toBe(0)
  })

  it('reports counts consistent with the materialized rows', async () => {
    // Widen the weekly schedule's configured horizon 3 → 4 weeks.
    await drizzleDb
      .update(courseSchedule)
      .set({ weeksToSchedule: 4 })
      .where(eq(courseSchedule.scheduleId, SCHED_PUB))

    const before = await totalForSchedules()
    const run = await runRollingScheduleMaterialization()
    const after = await totalForSchedules()

    // Horizon grew 3 → 4 for the weekly slot: exactly one new session for our
    // schedules (the horizon-capped schedule is already fully materialized).
    // Other suites may have their own published courses in the shared DB during
    // a parallel run, so only our rows are compared exactly.
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

  it('backfills missing in-horizon occurrences', async () => {
    // Simulate a missed run / partial wipe: retire one of the weekly schedule's
    // existing in-horizon sessions, then let the job re-run. The duplicate
    // guard only protects non-ended sessions, so the slot must be recreated.
    const weekly = await sessionsForSchedule(SCHED_PUB)
    expect(weekly).toHaveLength(4)
    const victim = weekly.reduce((a, b) =>
      new Date(a.scheduledAt).getTime() > new Date(b.scheduledAt).getTime() ? a : b
    )
    await drizzleDb
      .update(liveSession)
      .set({ status: 'ended' })
      .where(eq(liveSession.sessionId, victim.sessionId))

    const run = await runRollingScheduleMaterialization()
    const restored = await sessionsForSchedule(SCHED_PUB)
    expect(restored).toHaveLength(4)
    const instants = restored.map(r => new Date(r.scheduledAt).getTime())
    expect(instants).toContain(new Date(victim.scheduledAt).getTime())
    expect(run.errors).toBe(0)
  })
})
