/**
 * Integration test (bug reproduction): migrated sessions keep the TEMPLATE
 * course's scheduleId after publish, so a student enrolled in the published
 * variant (with a schedule enrollment) sees zero sessions.
 *
 * Flow under test:
 *  1. A tutor has a template (draft) course with a courseSchedule row and a
 *     materialized liveSession whose scheduleId points at that TEMPLATE
 *     schedule row.
 *  2. The tutor publishes one variant via POST /api/tutor/courses/:id/publish.
 *     The publish flow detects the pre-existing same-course session as a
 *     conflict and "migrates" it with
 *       tx.update(liveSession).set({ courseId: publishedCourseId })
 *     — it does NOT remap scheduleId, while the publish flow mints FRESH
 *     courseSchedule rows for the published variant.
 *  3. A student enrolls in the published variant with
 *     enrollment.scheduleId = the VARIANT's schedule id.
 *  4. GET /api/student/courses/:publishedId/sessions filters
 *       scheduleId = enrolledScheduleId OR scheduleId IS NULL
 *     so the migrated session (scheduleId = TEMPLATE schedule id) is dropped.
 *
 * CORRECT behavior: the migrated session appears in the student's list.
 * CURRENT (buggy) behavior: the student's list is empty.
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { eq, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  user,
  course,
  courseLesson,
  courseVariant,
  courseSchedule,
  courseEnrollment,
  liveSession,
  calendarEvent,
} from '@/lib/db/schema'
import { zonedWallClockToUtc } from '@/lib/time/tz'

const stamp = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`

const tutorId = `bug3_tutor_${stamp}`
const studentId = `bug3_student_${stamp}`
const tutorEmail = `bug3-tutor-${stamp}@example.com`
const studentEmail = `bug3-student-${stamp}@example.com`

const TEMPLATE_COURSE_ID = `bug3_course_tmpl_${stamp}`
const TEMPLATE_LESSON_ID = `bug3_lesson_tmpl_${stamp}`
const TEMPLATE_SCHEDULE_ID = `bug3_sched_tmpl_${stamp}`
const MIGRATED_SESSION_ID = `bug3_ls_migrated_${stamp}`
const ENROLLMENT_ID = `bug3_enr_${stamp}`
const TEMPLATE_COURSE_NAME = `bug3 Template Course ${stamp}`

const CATEGORY = 'math'

// Mutable auth session: the mock below reads this at call time so individual
// tests can run handlers as the tutor or the student.
const authState = vi.hoisted(() => ({
  session: {
    user: { id: '', email: '', role: 'TUTOR' as 'TUTOR' | 'STUDENT' },
    expires: new Date(Date.now() + 86400 * 1000).toISOString(),
  },
}))

vi.mock('@/lib/api/middleware', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    withCsrf: (h: unknown) => h,
    withAuth:
      (h: (req: unknown, session: unknown, context: unknown) => unknown) =>
      (req: unknown, context: unknown) =>
        h(req, authState.session, context),
  }
})

// Import route handlers AFTER the middleware mock is registered.
import { POST as publishVariants } from '@/app/api/tutor/courses/[id]/publish/route'
import { GET as getStudentCourseSessions } from '@/app/api/student/courses/[id]/sessions/route'
import { GET as getTutorCourseSessions } from '@/app/api/tutor/courses/[id]/sessions/route'

// A single, date-specific schedule slot tomorrow at 10:00 UTC. Using a `date`
// slot makes the generated instant deterministic so the seeded liveSession can
// be scheduled at the exact same instant and collide with the generated one,
// which is what triggers the publish route's same-course migration branch.
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
const slotYear = tomorrow.getUTCFullYear()
const slotMonth = tomorrow.getUTCMonth() + 1
const slotDay = tomorrow.getUTCDate()
const pad = (n: number) => String(n).padStart(2, '0')
const slotDate = `${slotYear}-${pad(slotMonth)}-${pad(slotDay)}`
const slotInstant = zonedWallClockToUtc(slotYear, slotMonth, slotDay, 10, 0, 'UTC')

const SLOT = { dayOfWeek: 'Monday', startTime: '10:00', durationMinutes: 60, date: slotDate }

let publishedCourseId = ''
let variantScheduleId = ''

function publishReq(): Request {
  return new Request(`http://localhost/api/tutor/courses/${TEMPLATE_COURSE_ID}/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-integration',
    },
    body: JSON.stringify({
      variants: [
        {
          category: CATEGORY,
          nationality: 'Singapore',
          isPublished: true,
          isFree: false,
          price: 100,
          currency: 'USD',
          languageOfInstruction: 'English',
          schedules: [
            {
              scheduleIndex: 1,
              name: 'bug3 Published Schedule',
              schedule: [SLOT],
              weeksToSchedule: 8,
              maxStudents: 50,
            },
          ],
        },
      ],
    }),
  })
}

describe('BUG #3: migrated sessions keep template scheduleId — students see zero sessions', () => {
  beforeAll(async () => {
    const now = new Date()

    await drizzleDb.insert(user).values([
      {
        userId: tutorId,
        email: tutorEmail,
        role: 'TUTOR',
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: studentId,
        email: studentEmail,
        role: 'STUDENT',
        createdAt: now,
        updatedAt: now,
      },
    ])

    await drizzleDb.insert(course).values({
      courseId: TEMPLATE_COURSE_ID,
      name: TEMPLATE_COURSE_NAME,
      creatorId: tutorId,
      categories: [CATEGORY],
    })

    await drizzleDb.insert(courseLesson).values({
      lessonId: TEMPLATE_LESSON_ID,
      courseId: TEMPLATE_COURSE_ID,
      title: 'bug3 Lesson 1',
      order: 0,
    })

    // The TEMPLATE course's schedule row — the seeded session points at this.
    await drizzleDb.insert(courseSchedule).values({
      scheduleId: TEMPLATE_SCHEDULE_ID,
      courseId: TEMPLATE_COURSE_ID,
      scheduleIndex: 1,
      name: 'bug3 Template Schedule',
      schedule: [SLOT],
      weeksToSchedule: 8,
      maxStudents: 50,
      enrolledCount: 0,
      createdAt: now,
      updatedAt: now,
    })

    // Pre-existing materialized session on the TEMPLATE course, tied to the
    // TEMPLATE schedule row, scheduled exactly at the slot the publish flow
    // will generate → forces the same-course migration branch.
    await drizzleDb.insert(liveSession).values({
      sessionId: MIGRATED_SESSION_ID,
      tutorId,
      courseId: TEMPLATE_COURSE_ID,
      scheduleId: TEMPLATE_SCHEDULE_ID,
      title: 'bug3 Migrated Session',
      category: CATEGORY,
      status: 'scheduled',
      sessionType: 'COURSE',
      scheduledAt: slotInstant,
      durationMinutes: 60,
      maxStudents: 50,
    })

    // Publish one variant as the tutor.
    authState.session.user = { id: tutorId, email: tutorEmail, role: 'TUTOR' }
    const res = await publishVariants(
      publishReq() as never,
      { params: Promise.resolve({ id: TEMPLATE_COURSE_ID }) } as never
    )
    expect(res.status).toBe(200)

    const [variantRow] = await drizzleDb
      .select({ publishedCourseId: courseVariant.publishedCourseId })
      .from(courseVariant)
      .where(eq(courseVariant.templateCourseId, TEMPLATE_COURSE_ID))
      .limit(1)
    publishedCourseId = variantRow.publishedCourseId

    const [schedRow] = await drizzleDb
      .select({ scheduleId: courseSchedule.scheduleId })
      .from(courseSchedule)
      .where(eq(courseSchedule.courseId, publishedCourseId))
      .limit(1)
    variantScheduleId = schedRow.scheduleId

    // Student enrolls in the published VARIANT with a schedule enrollment.
    await drizzleDb.insert(courseEnrollment).values({
      enrollmentId: ENROLLMENT_ID,
      studentId,
      courseId: publishedCourseId,
      scheduleId: variantScheduleId,
    })
  })

  afterAll(async () => {
    const t = async (fn: () => Promise<unknown>) => {
      try {
        await fn()
      } catch {}
    }
    const courseIds = [TEMPLATE_COURSE_ID, publishedCourseId].filter(Boolean)

    await t(() =>
      drizzleDb.delete(calendarEvent).where(eq(calendarEvent.externalId, MIGRATED_SESSION_ID))
    )
    await t(() =>
      drizzleDb.delete(liveSession).where(eq(liveSession.sessionId, MIGRATED_SESSION_ID))
    )
    await t(() =>
      drizzleDb.delete(courseEnrollment).where(eq(courseEnrollment.enrollmentId, ENROLLMENT_ID))
    )
    await t(() =>
      drizzleDb.delete(courseSchedule).where(inArray(courseSchedule.courseId, courseIds))
    )
    await t(() =>
      drizzleDb
        .delete(courseVariant)
        .where(eq(courseVariant.templateCourseId, TEMPLATE_COURSE_ID))
    )
    await t(() => drizzleDb.delete(courseLesson).where(inArray(courseLesson.courseId, courseIds)))
    await t(() => drizzleDb.delete(course).where(inArray(course.courseId, courseIds)))
    await t(() => drizzleDb.delete(user).where(inArray(user.userId, [tutorId, studentId])))
  })

  it('precondition: publish migrates the session to the variant and remaps scheduleId to the variant row', async () => {
    const [row] = await drizzleDb
      .select({ courseId: liveSession.courseId, scheduleId: liveSession.scheduleId })
      .from(liveSession)
      .where(eq(liveSession.sessionId, MIGRATED_SESSION_ID))
      .limit(1)

    // The migration DID happen: the session now belongs to the published variant.
    expect(row?.courseId).toBe(publishedCourseId)
    // FIXED: scheduleId is remapped from the TEMPLATE course's schedule row to
    // the FRESH variant schedule row minted during publish (matched by the
    // template schedule's scheduleIndex).
    expect(row?.scheduleId).toBe(variantScheduleId)
    expect(variantScheduleId).not.toBe(TEMPLATE_SCHEDULE_ID)
  })

  it('student with a schedule enrollment sees the migrated session (CORRECT behavior — fails while bug exists)', async () => {
    authState.session.user = { id: studentId, email: studentEmail, role: 'STUDENT' }

    const res = await getStudentCourseSessions(
      new Request(`http://localhost/api/student/courses/${publishedCourseId}/sessions`) as never,
      { params: Promise.resolve({ id: publishedCourseId }) } as never
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    const ids = (data.sessions ?? []).map((s: { id: string }) => s.id)

    // CORRECT: the migrated session belongs to the published variant and must
    // be visible to an enrolled student. CURRENT (buggy): it is filtered out
    // because its scheduleId matches neither the variant's schedule id nor NULL.
    expect(
      ids,
      `student sessions for the published variant should include the migrated session ` +
        `${MIGRATED_SESSION_ID}, got: ${JSON.stringify(ids)}`
    ).toContain(MIGRATED_SESSION_ID)
  })

  it('tutor-facing sessions list returns the migrated session with the variant scheduleName', async () => {
    authState.session.user = { id: tutorId, email: tutorEmail, role: 'TUTOR' }

    const res = await getTutorCourseSessions(
      new Request(`http://localhost/api/tutor/courses/${publishedCourseId}/sessions`) as never,
      { params: Promise.resolve({ id: publishedCourseId }) } as never
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    const migrated = (data.sessions ?? []).find((s: { id: string }) => s.id === MIGRATED_SESSION_ID)

    expect(
      migrated,
      `tutor sessions for the published variant should include the migrated session, got: ` +
        JSON.stringify((data.sessions ?? []).map((s: { id: string }) => s.id))
    ).toBeTruthy()

    // scheduleNameById is built from the PUBLISHED course's schedule rows only.
    // With scheduleId remapped to the variant row, the name now resolves to the
    // variant schedule's name (pre-fix it came back null).
    expect(migrated.scheduleName).toBe('bug3 Published Schedule')
  })
})
