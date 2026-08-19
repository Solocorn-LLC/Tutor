/**
 * Integration test: course session lifecycle guards.
 *
 * - A COURSE LiveSession cannot be ended by the tutor via PATCH.
 * - A ONE_ON_ONE LiveSession can still be ended by the tutor via PATCH.
 * - A course cannot be deleted once it has delivered/active/past-scheduled sessions.
 * - A course with no sessions can still be deleted.
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { eq, inArray } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, course, liveSession, calendarEvent } from '@/lib/db/schema'

const stamp = Date.now()
const tutorId = crypto.randomUUID()
const studentId = crypto.randomUUID()

const COURSE_ID = `cs_course_${stamp}`
const COURSE_2_ID = `cs_course2_${stamp}`
const COURSE_3_ID = `cs_course3_${stamp}`
const COURSE_4_ID = `cs_course4_${stamp}`
const COURSE_5_ID = `cs_course5_${stamp}`

const COURSE_SESSION = `cs_ls_course_${stamp}`
const SECOND_COURSE_SESSION = `cs_ls_course2_${stamp}`
const ONE_ON_ONE_SESSION = `cs_ls_oo_${stamp}`
const PAST_SCHEDULED_SESSION = `cs_ls_past_${stamp}`

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
import { POST as postClass, PATCH as patchClass } from '@/app/api/tutor/classes/[id]/route'
import { DELETE as deleteCourse } from '@/app/api/tutor/courses/[id]/route'

function startClassReq(sessionId: string) {
  return new NextRequest(`http://localhost/api/tutor/classes/${sessionId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  })
}

function endClassReq(sessionId: string) {
  return new NextRequest(`http://localhost/api/tutor/classes/${sessionId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
  })
}

function deleteCourseReq(courseId: string) {
  return new NextRequest(`http://localhost/api/tutor/courses/${courseId}`, {
    method: 'DELETE',
  })
}

describe('course session lifecycle guards', () => {
  beforeAll(async () => {
    const now = new Date()

    await drizzleDb.insert(user).values([
      {
        userId: tutorId,
        email: `cs-tutor-${stamp}@example.com`,
        role: 'TUTOR',
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: studentId,
        email: `cs-stu-${stamp}@example.com`,
        role: 'STUDENT',
        createdAt: now,
        updatedAt: now,
      },
    ])

    // Course with an active course session.
    await drizzleDb.insert(course).values({
      courseId: COURSE_ID,
      name: 'Course With Active Session',
      creatorId: tutorId,
      categories: ['math'],
      isPublished: true,
    })

    // Course with a past-scheduled session.
    await drizzleDb.insert(course).values({
      courseId: COURSE_2_ID,
      name: 'Course With Past Scheduled Session',
      creatorId: tutorId,
      categories: ['math'],
      isPublished: true,
    })

    // Course with an ended session.
    await drizzleDb.insert(course).values({
      courseId: COURSE_3_ID,
      name: 'Course With Ended Session',
      creatorId: tutorId,
      categories: ['math'],
      isPublished: true,
    })

    // Course with no sessions (deletable).
    await drizzleDb.insert(course).values({
      courseId: COURSE_4_ID,
      name: 'Course With No Sessions',
      creatorId: tutorId,
      categories: ['math'],
      isPublished: true,
    })

    // Course with a second scheduled session used to test concurrency guard.
    await drizzleDb.insert(course).values({
      courseId: COURSE_5_ID,
      name: 'Course With Second Session',
      creatorId: tutorId,
      categories: ['math'],
      isPublished: true,
    })

    await drizzleDb.insert(liveSession).values([
      {
        sessionId: COURSE_SESSION,
        tutorId,
        courseId: COURSE_ID,
        title: 'Active Course Session',
        category: 'math',
        status: 'active',
        sessionType: 'COURSE',
        scheduledAt: new Date(Date.now() - 30 * 60 * 1000), // started 30 min ago
        startedAt: new Date(Date.now() - 35 * 60 * 1000), // tutor opened 35 min ago
        durationMinutes: 60,
        maxStudents: 50,
      },
      {
        sessionId: SECOND_COURSE_SESSION,
        tutorId,
        courseId: COURSE_5_ID,
        title: 'Second Scheduled Course Session',
        category: 'math',
        status: 'scheduled',
        sessionType: 'COURSE',
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000), // scheduled in the future
        durationMinutes: 60,
        maxStudents: 50,
      },
      {
        sessionId: ONE_ON_ONE_SESSION,
        tutorId,
        title: '1-on-1 Session',
        category: 'math',
        status: 'scheduled',
        sessionType: 'ONE_ON_ONE',
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000),
        durationMinutes: 60,
        maxStudents: 2,
      },
      {
        sessionId: PAST_SCHEDULED_SESSION,
        tutorId,
        courseId: COURSE_2_ID,
        title: 'Past Scheduled Course Session',
        category: 'math',
        status: 'scheduled',
        sessionType: 'COURSE',
        scheduledAt: new Date(Date.now() - 60 * 60 * 1000), // scheduled in the past
        durationMinutes: 60,
        maxStudents: 50,
      },
    ])

    // Add an ended session for COURSE_3.
    const endedSessionId = `cs_ls_ended_${stamp}`
    await drizzleDb.insert(liveSession).values({
      sessionId: endedSessionId,
      tutorId,
      courseId: COURSE_3_ID,
      title: 'Ended Course Session',
      category: 'math',
      status: 'ended',
      sessionType: 'COURSE',
      scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endedAt: new Date(Date.now() - 23 * 60 * 60 * 1000),
      durationMinutes: 60,
      maxStudents: 50,
    })
  })

  afterAll(async () => {
    const allSessionIds = [
      COURSE_SESSION,
      SECOND_COURSE_SESSION,
      ONE_ON_ONE_SESSION,
      PAST_SCHEDULED_SESSION,
      `cs_ls_ended_${stamp}`,
    ]
    const allCourseIds = [COURSE_ID, COURSE_2_ID, COURSE_3_ID, COURSE_4_ID, COURSE_5_ID]

    await drizzleDb.delete(calendarEvent).where(inArray(calendarEvent.externalId, allSessionIds))
    await drizzleDb.delete(liveSession).where(inArray(liveSession.sessionId, allSessionIds))
    await drizzleDb.delete(course).where(inArray(course.courseId, allCourseIds))
    await drizzleDb.delete(user).where(inArray(user.userId, [tutorId, studentId]))
  })

  it('POST /api/tutor/classes/:id rejects starting a session when tutor already has an active session', async () => {
    const res = await postClass(
      startClassReq(SECOND_COURSE_SESSION) as unknown as NextRequest,
      {
        params: Promise.resolve({ id: SECOND_COURSE_SESSION }),
      } as any
    )
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toContain('already have an active live session')
    expect(data.conflictingSessionId).toBe(COURSE_SESSION)
  })

  it('POST /api/tutor/classes/:id allows re-starting the same active session', async () => {
    const res = await postClass(
      startClassReq(COURSE_SESSION) as unknown as NextRequest,
      {
        params: Promise.resolve({ id: COURSE_SESSION }),
      } as any
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.session.status).toBe('active')
  })

  it('PATCH /api/tutor/classes/:id rejects ending a COURSE session', async () => {
    const res = await patchClass(
      endClassReq(COURSE_SESSION) as unknown as NextRequest,
      {
        params: Promise.resolve({ id: COURSE_SESSION }),
      } as any
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('end automatically')
  })

  it('PATCH /api/tutor/classes/:id still allows ending a ONE_ON_ONE session', async () => {
    const res = await patchClass(
      endClassReq(ONE_ON_ONE_SESSION) as unknown as NextRequest,
      {
        params: Promise.resolve({ id: ONE_ON_ONE_SESSION }),
      } as any
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('ended')

    const [row] = await drizzleDb
      .select({ status: liveSession.status })
      .from(liveSession)
      .where(eq(liveSession.sessionId, ONE_ON_ONE_SESSION))
      .limit(1)
    expect(row?.status).toBe('ended')
  })

  it('DELETE /api/tutor/courses/:id rejects deletion when course has an active session', async () => {
    const res = await deleteCourse(
      deleteCourseReq(COURSE_ID) as unknown as NextRequest,
      {
        params: Promise.resolve({ id: COURSE_ID }),
      } as any
    )
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toContain('delivered or active sessions')
  })

  it('DELETE /api/tutor/courses/:id rejects deletion when course has a past scheduled session', async () => {
    const res = await deleteCourse(
      deleteCourseReq(COURSE_2_ID) as unknown as NextRequest,
      {
        params: Promise.resolve({ id: COURSE_2_ID }),
      } as any
    )
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toContain('delivered or active sessions')
  })

  it('DELETE /api/tutor/courses/:id rejects deletion when course has an ended session', async () => {
    const res = await deleteCourse(
      deleteCourseReq(COURSE_3_ID) as unknown as NextRequest,
      {
        params: Promise.resolve({ id: COURSE_3_ID }),
      } as any
    )
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toContain('delivered or active sessions')
  })

  it('DELETE /api/tutor/courses/:id succeeds when course has no sessions', async () => {
    const res = await deleteCourse(
      deleteCourseReq(COURSE_4_ID) as unknown as NextRequest,
      {
        params: Promise.resolve({ id: COURSE_4_ID }),
      } as any
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.message).toContain('deleted successfully')

    const [row] = await drizzleDb
      .select({ courseId: course.courseId })
      .from(course)
      .where(eq(course.courseId, COURSE_4_ID))
      .limit(1)
    expect(row).toBeUndefined()
  })
})
