/**
 * Integration regression tests — BUG #5 & #6:
 * "Schedule edit wipes lessons and silently drops conflicting slots".
 *
 * Reproduction paths:
 * (a) PUT /api/tutor/courses/[id]/schedules re-saves slots whose instants are
 *     unchanged → clearFutureScheduleSessions() soft-retires the existing
 *     materialized sessions (status 'ended'), then materializeScheduleSessions()
 *     re-creates brand-new session rows that never carry `lessonId` → the
 *     lesson attached to each session is lost.
 * (b) A re-materialized slot that conflicts with another of the tutor's sessions
 *     is silently skipped (console.warn only) → the tutor ends up with NO
 *     session for that slot, yet the API still returns 200.
 *
 * The tests below assert the CORRECT behavior, so they FAIL while the bugs
 * exist. Bug-evidence assertions (marked "bug evidence") document the actual
 * broken state and currently PASS.
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 * All entities use the `bug56_` prefix.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  user,
  course,
  courseLesson,
  courseSchedule,
  liveSession,
  calendarEvent,
} from '@/lib/db/schema'

const stamp = Date.now()
const tutorId = crypto.randomUUID()

const COURSE_A = `bug56_course_a_${stamp}`
const COURSE_B = `bug56_course_b_${stamp}`
const SCHED_A = `bug56_sched_a_${stamp}`
const SCHED_B = `bug56_sched_b_${stamp}`
const LESSON_A1 = `bug56_lesson_a1_${stamp}`
const LESSON_A2 = `bug56_lesson_a2_${stamp}`
const LS_A1 = `bug56_ls_a1_${stamp}`
const LS_A2 = `bug56_ls_a2_${stamp}`
const LS_B1 = `bug56_ls_b1_${stamp}`
const LS_ADHOC = `bug56_ls_adhoc_${stamp}`
const LS_ADHOC2 = `bug56_ls_adhoc2_${stamp}`

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

// Deterministic future slots (UTC — no calendarAvailability row is created, so
// materializeForSchedule falls back to UTC).
const DATE_1 = utcDayString(3 * 86_400_000)
const DATE_2 = utcDayString(5 * 86_400_000)
const DATE_3 = utcDayString(4 * 86_400_000)
const DATE_4 = utcDayString(6 * 86_400_000)
const INSTANT_1 = new Date(`${DATE_1}T10:00:00.000Z`)
const INSTANT_2 = new Date(`${DATE_2}T14:00:00.000Z`)
const INSTANT_3 = new Date(`${DATE_3}T16:00:00.000Z`)
const INSTANT_4 = new Date(`${DATE_4}T16:00:00.000Z`)

const SLOTS_A = [slotFor(DATE_1, '10:00', 60), slotFor(DATE_2, '14:00', 60)]
const SLOT_B = [slotFor(DATE_3, '16:00', 60)]
// Schedule B's slot moved to a new instant that collides with the tutor's
// second ad-hoc session (LS_ADHOC2 at INSTANT_4).
const SLOT_B_MOVED = [slotFor(DATE_4, '16:00', 60)]

// Middleware: pass-through with a fixed TUTOR session.
vi.mock('@/lib/api/middleware', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    withCsrf: (h: unknown) => h,
    withAuth:
      (h: (req: unknown, session: unknown, context: unknown) => unknown) =>
      (req: unknown, context: unknown) =>
        h(req, { user: { id: tutorId, role: 'TUTOR' } }, context),
  }
})

// Import route handlers AFTER middleware is mocked.
import { PUT as putSchedule } from '@/app/api/tutor/courses/[id]/schedules/route'

function putScheduleReq(courseId: string, body: unknown) {
  return new NextRequest(`http://localhost/api/tutor/courses/${courseId}/schedules`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * The UI re-saves slots with a display-only `endTime` key the stored pattern
 * doesn't have. The instants are identical, but JSON.stringify differs, which
 * is what flips the route's `scheduleChanged` flag and triggers the
 * clear-then-materialize cycle.
 */
function withDisplayFields(slots: typeof SLOTS_A) {
  return slots.map(s => ({ ...s, endTime: 'display-only' }))
}

describe('BUG #5/#6: schedule edit wipes lessons and silently drops conflicting slots', () => {
  beforeAll(async () => {
    const now = new Date()

    await drizzleDb.insert(user).values({
      userId: tutorId,
      email: `bug56-tutor-${stamp}@example.com`,
      role: 'TUTOR',
      createdAt: now,
      updatedAt: now,
    })

    // Unpublished template courses (guardUnpublished rejects published ones).
    await drizzleDb.insert(course).values([
      {
        courseId: COURSE_A,
        name: `bug56_course_a_${stamp}`,
        creatorId: tutorId,
        categories: ['math'],
        isPublished: false,
      },
      {
        courseId: COURSE_B,
        name: `bug56_course_b_${stamp}`,
        creatorId: tutorId,
        categories: ['math'],
        isPublished: false,
      },
    ])

    await drizzleDb.insert(courseSchedule).values([
      {
        scheduleId: SCHED_A,
        courseId: COURSE_A,
        scheduleIndex: 1,
        schedule: SLOTS_A,
        weeksToSchedule: 8,
        enrolledCount: 0,
      },
      {
        scheduleId: SCHED_B,
        courseId: COURSE_B,
        scheduleIndex: 1,
        schedule: SLOT_B,
        weeksToSchedule: 8,
        enrolledCount: 0,
      },
    ])

    // Lessons linked to course A's sessions.
    await drizzleDb.insert(courseLesson).values([
      {
        lessonId: LESSON_A1,
        courseId: COURSE_A,
        title: 'bug56 lesson 1',
        order: 1,
      },
      {
        lessonId: LESSON_A2,
        courseId: COURSE_A,
        title: 'bug56 lesson 2',
        order: 2,
      },
    ])

    // Two future materialized sessions for schedule A, each with a lessonId —
    // the state after a tutor assigned lessons to the schedule's sessions.
    await drizzleDb.insert(liveSession).values([
      {
        sessionId: LS_A1,
        tutorId,
        courseId: COURSE_A,
        scheduleId: SCHED_A,
        lessonId: LESSON_A1,
        title: `bug56_session_a1_${stamp}`,
        category: 'math',
        status: 'scheduled',
        sessionType: 'COURSE',
        scheduledAt: INSTANT_1,
        durationMinutes: 60,
        maxStudents: 50,
      },
      {
        sessionId: LS_A2,
        tutorId,
        courseId: COURSE_A,
        scheduleId: SCHED_A,
        lessonId: LESSON_A2,
        title: `bug56_session_a2_${stamp}`,
        category: 'math',
        status: 'scheduled',
        sessionType: 'COURSE',
        scheduledAt: INSTANT_2,
        durationMinutes: 60,
        maxStudents: 50,
      },
      // Schedule B's existing materialized session (pre-edit state).
      {
        sessionId: LS_B1,
        tutorId,
        courseId: COURSE_B,
        scheduleId: SCHED_B,
        title: `bug56_session_b1_${stamp}`,
        category: 'math',
        status: 'scheduled',
        sessionType: 'COURSE',
        scheduledAt: INSTANT_3,
        durationMinutes: 60,
        maxStudents: 50,
      },
      // An unrelated ad-hoc session of the same tutor at the exact same
      // instant as schedule B's slot (created via "Go Live"/ad-hoc flows).
      {
        sessionId: LS_ADHOC,
        tutorId,
        title: `bug56_adhoc_${stamp}`,
        category: 'math',
        status: 'scheduled',
        sessionType: 'ADHOC',
        scheduledAt: INSTANT_3,
        durationMinutes: 60,
        maxStudents: 50,
      },
      // A second ad-hoc session at the instant schedule B's slot is moved to.
      {
        sessionId: LS_ADHOC2,
        tutorId,
        title: `bug56_adhoc2_${stamp}`,
        category: 'math',
        status: 'scheduled',
        sessionType: 'ADHOC',
        scheduledAt: INSTANT_4,
        durationMinutes: 60,
        maxStudents: 50,
      },
    ])
  })

  afterAll(async () => {
    // Collect every session id we may have created (materialize creates rows
    // with random UUIDs, so re-query by schedule).
    const scheduleSessions = await drizzleDb
      .select({ sessionId: liveSession.sessionId })
      .from(liveSession)
      .where(inArray(liveSession.scheduleId, [SCHED_A, SCHED_B]))

    const allSessionIds = [
      ...new Set([
        LS_A1,
        LS_A2,
        LS_B1,
        LS_ADHOC,
        LS_ADHOC2,
        ...scheduleSessions.map(s => s.sessionId),
      ]),
    ]

    await drizzleDb.delete(calendarEvent).where(inArray(calendarEvent.externalId, allSessionIds))
    await drizzleDb.delete(liveSession).where(inArray(liveSession.sessionId, allSessionIds))
    await drizzleDb
      .delete(courseSchedule)
      .where(inArray(courseSchedule.scheduleId, [SCHED_A, SCHED_B]))
    // courseLesson rows cascade with the course.
    await drizzleDb.delete(course).where(inArray(course.courseId, [COURSE_A, COURSE_B]))
    await drizzleDb.delete(user).where(eq(user.userId, tutorId))
  })

  it('BUG #5: re-saving unchanged slots wipes the lessons assigned to the schedule sessions', async () => {
    // Sanity: both future sessions exist with their lessons before the edit.
    const before = await drizzleDb
      .select({ sessionId: liveSession.sessionId, lessonId: liveSession.lessonId })
      .from(liveSession)
      .where(inArray(liveSession.sessionId, [LS_A1, LS_A2]))
    expect(before).toHaveLength(2)
    expect(before.every(r => r.lessonId !== null)).toBe(true)

    // Re-save the same slots (identical instants; only a display-only field
    // differs, which is exactly what the schedule editor sends).
    const res = await putSchedule(
      putScheduleReq(COURSE_A, {
        scheduleId: SCHED_A,
        schedule: withDisplayFields(SLOTS_A),
      }) as unknown as NextRequest,
      { params: Promise.resolve({ id: COURSE_A }) } as any
    )

    // Bug evidence (currently PASSES): the API reports success.
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.schedule.scheduleId).toBe(SCHED_A)

    // Bug evidence (now FIXED): the original sessions must NOT be soft-retired —
    // nothing about the times changed, so they are kept as-is.
    const oldRows = await drizzleDb
      .select({ status: liveSession.status })
      .from(liveSession)
      .where(inArray(liveSession.sessionId, [LS_A1, LS_A2]))
    expect(oldRows.every(r => r.status === 'scheduled')).toBe(true)

    // CORRECT behavior (FAILS while the bug exists): the schedule's future
    // sessions must still exist and still carry their lessonId. Times were not
    // changed, so the sessions — and their lesson assignments — must survive.
    const future = await drizzleDb
      .select({
        sessionId: liveSession.sessionId,
        lessonId: liveSession.lessonId,
        scheduledAt: liveSession.scheduledAt,
      })
      .from(liveSession)
      .where(and(inArray(liveSession.scheduleId, [SCHED_A]), ne(liveSession.status, 'ended')))

    expect(
      future.length,
      'the two future sessions for the unchanged slots should still exist'
    ).toBe(2)
    for (const row of future) {
      expect(
        row.lessonId,
        `session ${row.sessionId} lost its lesson assignment (lessonId is null) — re-materialized sessions never carry lessonId`
      ).not.toBeNull()
    }
    const lessonIds = future.map(r => r.lessonId).sort()
    expect(lessonIds).toEqual([LESSON_A1, LESSON_A2].sort())
  })

  it('BUG #6: a conflicting replacement slot is surfaced in the response instead of silently dropped', async () => {
    // Sanity: schedule B's slot has a materialized session and the tutor has
    // ad-hoc sessions at both the old and the target instant.
    const sanity = await drizzleDb
      .select({ sessionId: liveSession.sessionId })
      .from(liveSession)
      .where(
        and(
          inArray(liveSession.sessionId, [LS_B1, LS_ADHOC, LS_ADHOC2]),
          ne(liveSession.status, 'ended')
        )
      )
    expect(sanity).toHaveLength(3)

    // Edit schedule B, MOVING its slot to INSTANT_4 (occupied by LS_ADHOC2) —
    // the old session is stale and retired, but the conflicting replacement
    // cannot be materialized.
    const res = await putSchedule(
      putScheduleReq(COURSE_B, {
        scheduleId: SCHED_B,
        schedule: withDisplayFields(SLOT_B_MOVED),
      }) as unknown as NextRequest,
      { params: Promise.resolve({ id: COURSE_B }) } as any
    )

    // The API keeps its 200 contract…
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessionsCreated).toBe(0)

    // …but must surface the dropped slot: the stale session was retired and
    // the conflicting replacement was skipped, so the tutor must be told.
    expect(Array.isArray(body.skippedSlots)).toBe(true)
    expect(body.skippedSlots.length).toBeGreaterThan(0)
    const skippedAt = new Date(body.skippedSlots[0].scheduledAt).getTime()
    expect(Math.abs(skippedAt - INSTANT_4.getTime())).toBeLessThan(1000)
    expect(body.sessionsRetired).toBe(1)

    // The moved-away session was genuinely stale and is retired; no session
    // exists for schedule B at either the old or the new instant.
    const [oldB] = await drizzleDb
      .select({ status: liveSession.status })
      .from(liveSession)
      .where(eq(liveSession.sessionId, LS_B1))
    expect(oldB?.status).toBe('ended')
    const remaining = await drizzleDb
      .select({ sessionId: liveSession.sessionId })
      .from(liveSession)
      .where(
        and(
          inArray(liveSession.scheduleId, [SCHED_B]),
          ne(liveSession.status, 'ended'),
          inArray(liveSession.scheduledAt, [INSTANT_3, INSTANT_4])
        )
      )
    expect(remaining).toHaveLength(0)
    // The conflicting ad-hoc sessions still exist, untouched.
    const adhocRows = await drizzleDb
      .select({ sessionId: liveSession.sessionId, status: liveSession.status })
      .from(liveSession)
      .where(inArray(liveSession.sessionId, [LS_ADHOC, LS_ADHOC2]))
    expect(adhocRows).toHaveLength(2)
    expect(adhocRows.every(r => r.status === 'scheduled')).toBe(true)

    // CORRECT behavior: the conflict is surfaced in the response body.
    const surfaced =
      res.status !== 200 ||
      (typeof body.error === 'string' && body.error.length > 0) ||
      (Array.isArray(body.skippedSlots) && body.skippedSlots.length > 0) ||
      (Array.isArray(body.conflicts) && body.conflicts.length > 0)
    expect(
      surfaced,
      `PUT returned ${res.status} with sessionsCreated=${body.sessionsCreated} and no indication that the slot was dropped`
    ).toBe(true)
  })
})
