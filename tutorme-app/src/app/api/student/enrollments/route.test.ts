import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  // Queue of results for successive drizzleDb.select() calls in GET order:
  // enrollments join, lesson counts, progress rows, liveSession rows,
  // schedule rows (only when an enrollment has a scheduleId).
  selectQueue: [] as unknown[],
}))

// Chainable drizzle mock: every method returns the same proxy and awaiting it
// resolves the next queued result.
function makeChain(result: unknown): unknown {
  const chain: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve(result)
        }
        return () => chain
      },
    }
  )
  return chain
}

vi.mock('@/lib/db/drizzle', () => ({
  drizzleDb: {
    select: vi.fn(() => makeChain(mocks.selectQueue.shift())),
  },
}))

vi.mock('@/lib/api/enrollments', () => ({
  enrollStudentInCourse: vi.fn(),
  enrollmentPaymentRequiredResponse: vi.fn(),
}))

vi.mock('@/lib/api/middleware', () => ({
  withAuth: (handler: unknown) => handler,
  withCsrf: (handler: unknown) => handler,
  NotFoundError: class extends Error {},
}))

vi.mock('@/lib/courses/variant-family', () => ({
  expandFamilyWithMap: async (ids: string[]) => ({ ids, toEnrolled: new Map<string, string>() }),
}))

import { GET } from './route'

const session = { user: { id: 'student-1', role: 'STUDENT' } }

const DAY = 24 * 60 * 60 * 1000

function makeEnrollmentRow(overrides: Record<string, unknown> = {}) {
  return {
    enrollment: {
      enrollmentId: 'enr-1',
      studentId: 'student-1',
      courseId: 'course-1',
      scheduleId: 'sched-1',
      enrolledAt: new Date('2026-01-01T00:00:00Z'),
      startDate: null,
      completedAt: null,
      ...((overrides.enrollment as Record<string, unknown>) ?? {}),
    },
    courseId: 'course-1',
    courseName: 'Algebra',
    courseCategories: ['math'],
    courseDescription: 'desc',
    courseIsPublished: true,
    courseSchedule: null,
    tutorHandle: 'tutor1',
    tutorName: 'Tutor One',
    tutorImage: null,
    tutorAvatar: null,
    variantCategory: null,
    variantNationality: null,
    ...overrides,
  }
}

function makeSessionRow(overrides: Record<string, unknown>) {
  return {
    courseId: 'course-1',
    scheduleId: 'sched-1',
    sessionId: 'sess-x',
    scheduledAt: new Date(Date.now() + DAY),
    status: 'scheduled',
    ...overrides,
  }
}

const scheduleRow = {
  scheduleId: 'sched-1',
  name: 'Morning',
  scheduleIndex: 0,
  schedule: ['mon 10:00'],
  weeksToSchedule: 8,
}

async function runGet() {
  const res = (await GET(
    new Request('http://localhost/api/student/enrollments') as NextRequest,
    session as never
  )) as Response
  return res.json()
}

describe('GET /api/student/enrollments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectQueue = []
  })

  it('counts only schedule-materialized sessions and excludes ad-hoc, other-schedule, cancelled and retired-ghost rows', async () => {
    const past = new Date(Date.now() - DAY)
    const future = new Date(Date.now() + DAY)
    const ghostFuture = new Date(Date.now() + 2 * DAY)
    mocks.selectQueue = [
      // enrollments join
      [makeEnrollmentRow()],
      // lesson counts
      [],
      // progress rows
      [],
      // liveSession rows
      [
        makeSessionRow({ sessionId: 'sess-future', scheduledAt: future, status: 'scheduled' }),
        makeSessionRow({ sessionId: 'sess-past', scheduledAt: past, status: 'ended' }),
        makeSessionRow({
          sessionId: 'sess-ghost',
          scheduledAt: ghostFuture,
          status: 'ended',
        }),
        makeSessionRow({
          sessionId: 'sess-other-sched',
          scheduleId: 'sched-2',
          scheduledAt: future,
        }),
        makeSessionRow({ sessionId: 'sess-adhoc', scheduleId: null }),
        makeSessionRow({ sessionId: 'sess-cancelled', status: 'cancelled' }),
      ],
      // schedule rows (enrollment has sched-1)
      [scheduleRow],
    ]

    const data = await runGet()
    const e = data.enrollments[0]

    // sched-1 scope: future + past = 2 sessions; only the past one occurred.
    // The ended-FUTURE ghost is a retired slot — it must not inflate the
    // count, the completed tally, or the sessions list.
    expect(e.sessionCount).toBe(2)
    expect(e.completedSessions).toBe(1)
    expect(e.remainingSessions).toBe(1)
    expect(e.progress.isCompleted).toBe(false)
    // sched-1 scope: future + past = 2 sessions; only the past one occurred.
    // The ended-FUTURE ghost is a retired slot — it must not inflate the
    // count, the completed tally, or the sessions list. The sessions array is
    // scoped to the enrollment's chosen schedule (sched-1): the sched-2
    // session is excluded, ordered by scheduledAt ascending (past first), with
    // the exact field names (scheduleId added, nothing removed).
    expect(e.sessions).toEqual([
      {
        id: 'sess-past',
        scheduledAt: past.toISOString(),
        status: 'ended',
        scheduleId: 'sched-1',
      },
      {
        id: 'sess-future',
        scheduledAt: future.toISOString(),
        status: 'scheduled',
        scheduleId: 'sched-1',
      },
    ])
  })

  it('falls back to the course-wide countable set when the enrollment has no chosen schedule', async () => {
    const past = new Date(Date.now() - DAY)
    const future = new Date(Date.now() + DAY)
    mocks.selectQueue = [
      [makeEnrollmentRow({ enrollment: { scheduleId: null } })],
      [],
      [],
      [
        makeSessionRow({ sessionId: 'a', scheduledAt: past, status: 'ended' }),
        makeSessionRow({ sessionId: 'b', scheduledAt: future, status: 'scheduled' }),
        makeSessionRow({ sessionId: 'c', scheduleId: 'sched-2', scheduledAt: future }),
      ],
      // no scheduleIds -> schedule query skipped
    ]

    const data = await runGet()
    const e = data.enrollments[0]

    expect(e.sessionCount).toBe(3)
    expect(e.completedSessions).toBe(1)
    expect(e.remainingSessions).toBe(2)
    expect(e.progress.isCompleted).toBe(false)
    expect(e.sessions.map((s: { id: string }) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('derives isCompleted when every session in the count scope has run', async () => {
    const past = new Date(Date.now() - DAY)
    mocks.selectQueue = [
      [makeEnrollmentRow()],
      [],
      [],
      [
        makeSessionRow({ sessionId: 'sess-past-1', scheduledAt: past, status: 'ended' }),
        makeSessionRow({ sessionId: 'sess-past-2', scheduledAt: past, status: 'ended' }),
      ],
      [scheduleRow],
    ]

    const data = await runGet()
    const e = data.enrollments[0]

    expect(e.sessionCount).toBe(2)
    expect(e.completedSessions).toBe(2)
    expect(e.remainingSessions).toBe(0)
    expect(e.progress.isCompleted).toBe(true)
  })

  it('never completes spuriously from the synthesized fallback count', async () => {
    mocks.selectQueue = [
      [
        makeEnrollmentRow({
          enrollment: { scheduleId: null },
          courseSchedule: ['mon 10:00', 'wed 10:00'],
        }),
      ],
      [],
      [],
      [],
    ]

    const data = await runGet()
    const e = data.enrollments[0]

    expect(e.sessionCount).toBe(16)
    expect(e.completedSessions).toBe(0)
    expect(e.remainingSessions).toBe(16)
    expect(e.progress.isCompleted).toBe(false)
    expect(e.sessions).toEqual([])
  })
})
