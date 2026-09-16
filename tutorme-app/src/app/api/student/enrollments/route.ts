/**
 * Student Enrollment API
 * POST: Enroll student in a course
 * GET: List student's enrollments
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withAuth, withCsrf, NotFoundError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  course,
  courseLesson,
  courseEnrollment,
  courseProgress,
  courseVariant,
  courseSchedule,
  liveSession,
  user,
  profile,
} from '@/lib/db/schema'
import { and, eq, inArray, desc, isNotNull } from 'drizzle-orm'
import { expandFamilyWithMap } from '@/lib/courses/variant-family'
import { sql } from 'drizzle-orm'
import { enrollStudentInCourse, enrollmentPaymentRequiredResponse } from '@/lib/api/enrollments'

/**
 * A countable course session is a schedule-materialized liveSession row:
 * scheduleId IS NOT NULL (excludes ad-hoc, GO_LIVE_DEMO and 1-on-1 rows) and
 * status !== 'cancelled'. There is no 'cancelled' LiveSessionStatus enum value
 * today (cancelling a session sets it to 'ended'), so the status half of the
 * predicate is applied in JS — comparing the enum column to the 'cancelled'
 * literal in SQL errors as an invalid enum value.
 */
function isCountableSession(row: { scheduleId: string | null; status: string }): boolean {
  return row.scheduleId != null && row.status !== 'cancelled'
}

export const POST = withCsrf(
  withAuth(
    async (req, session) => {
      const body = await req.json().catch(() => ({}))
      const { courseId, startDate, scheduleId } = body

      if (!courseId || typeof courseId !== 'string') {
        return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
      }

      try {
        const result = await enrollStudentInCourse(
          session.user.id,
          courseId,
          startDate,
          typeof scheduleId === 'string' ? scheduleId : null
        )
        return NextResponse.json(result)
      } catch (error: unknown) {
        const err = error as any
        if (err instanceof NotFoundError) {
          return NextResponse.json({ error: err.message }, { status: 404 })
        }
        if (err?.requiresPayment) {
          return enrollmentPaymentRequiredResponse(err)
        }
        if (err?.message) {
          return NextResponse.json({ error: err.message }, { status: 400 })
        }
        throw error
      }
    },
    { role: 'STUDENT' }
  )
)

export const GET = withAuth(
  async (req, session) => {
    const enrollmentsRows = await drizzleDb
      .select({
        enrollment: courseEnrollment,
        courseId: course.courseId,
        courseName: course.name,
        courseCategories: course.categories,
        courseDescription: course.description,
        courseIsPublished: course.isPublished,
        courseSchedule: course.schedule,
        tutorHandle: user.handle,
        tutorName: profile.name,
        tutorImage: user.image,
        tutorAvatar: profile.avatarUrl,
        variantCategory: courseVariant.category,
        variantNationality: courseVariant.nationality,
      })
      .from(courseEnrollment)
      .innerJoin(course, eq(courseEnrollment.courseId, course.courseId))
      .leftJoin(user, eq(course.creatorId, user.userId))
      .leftJoin(profile, eq(profile.userId, course.creatorId))
      .leftJoin(courseVariant, eq(courseVariant.publishedCourseId, course.courseId))
      .where(eq(courseEnrollment.studentId, session.user.id))
      .orderBy(desc(courseEnrollment.enrolledAt))

    // Batch query lesson/session counts. Expand enrolled (published) ids to the
    // variant family (so template-scoped content is counted) and keep a map back
    // to the enrolled id so counts roll up to the right enrollment card.
    const { ids: courseIds, toEnrolled } = await expandFamilyWithMap(
      enrollmentsRows.map(row => row.courseId)
    )
    const lessonCounts =
      courseIds.length > 0
        ? await drizzleDb
            .select({
              courseId: courseLesson.courseId,
              count: sql<number>`count(*)::int`,
            })
            .from(courseLesson)
            .where(inArray(courseLesson.courseId, courseIds))
            .groupBy(courseLesson.courseId)
        : []
    const lessonCountByCourse = new Map<string, number>()
    for (const m of lessonCounts) {
      const owner = toEnrolled.get(m.courseId) ?? m.courseId
      lessonCountByCourse.set(owner, (lessonCountByCourse.get(owner) ?? 0) + (m.count ?? 0))
    }

    // Real per-course progress for this student. Completion mirrors dashboard-stats:
    // courseProgress.isCompleted OR enrollment.completedAt is set.
    const progressRows =
      courseIds.length > 0
        ? await drizzleDb
            .select({
              courseId: courseProgress.courseId,
              lessonsCompleted: courseProgress.lessonsCompleted,
              totalLessons: courseProgress.totalLessons,
              averageScore: courseProgress.averageScore,
              isCompleted: courseProgress.isCompleted,
            })
            .from(courseProgress)
            .where(
              and(
                eq(courseProgress.studentId, session.user.id),
                inArray(courseProgress.courseId, courseIds)
              )
            )
        : []
    const progressByCourse = new Map(
      progressRows.map(p => [toEnrolled.get(p.courseId) ?? p.courseId, p])
    )

    // Real session counts: a "session" is a materialized liveSession (one per
    // scheduled time slot, expanded over the schedule's weeks) — NOT a content
    // lesson. Fetch every family session once and derive counts, past
    // subtraction and the session list from the same countable set so the
    // scopes stay symmetric.
    const countableSessionRows =
      courseIds.length > 0
        ? await drizzleDb
            .select({
              courseId: liveSession.courseId,
              scheduleId: liveSession.scheduleId,
              sessionId: liveSession.sessionId,
              scheduledAt: liveSession.scheduledAt,
              status: liveSession.status,
            })
            .from(liveSession)
            .where(and(inArray(liveSession.courseId, courseIds), isNotNull(liveSession.scheduleId)))
        : []
    const sessionCountBySchedule = new Map<string, number>() // `courseId:scheduleId`
    const sessionCountByCourse = new Map<string, number>() // course-wide total
    const pastCountBySchedule = new Map<string, number>() // `courseId:scheduleId`
    const pastCountByCourse = new Map<string, number>() // course-wide past total
    const sessionsByCourse = new Map<
      string,
      Array<{ sessionId: string; scheduledAt: Date | null; status: string }>
    >()
    const now = new Date()
    for (const s of countableSessionRows) {
      // Roll a template-scoped session up under the enrolled (published) id.
      const cid = toEnrolled.get(s.courseId ?? '') ?? s.courseId ?? ''
      if (!isCountableSession(s)) continue
      const isPast = s.scheduledAt != null && s.scheduledAt <= now
      sessionCountByCourse.set(cid, (sessionCountByCourse.get(cid) ?? 0) + 1)
      if (isPast) pastCountByCourse.set(cid, (pastCountByCourse.get(cid) ?? 0) + 1)
      if (s.scheduleId) {
        const key = `${cid}:${s.scheduleId}`
        sessionCountBySchedule.set(key, (sessionCountBySchedule.get(key) ?? 0) + 1)
        if (isPast) pastCountBySchedule.set(key, (pastCountBySchedule.get(key) ?? 0) + 1)
      }
      const list = sessionsByCourse.get(cid)
      const entry = { sessionId: s.sessionId, scheduledAt: s.scheduledAt, status: s.status }
      if (list) list.push(entry)
      else sessionsByCourse.set(cid, [entry])
    }
    for (const list of sessionsByCourse.values()) {
      list.sort(
        (a, b) => (a.scheduledAt?.getTime() ?? Infinity) - (b.scheduledAt?.getTime() ?? Infinity)
      )
    }

    // The chosen schedule per enrollment (name/index for display + slots/weeks
    // as a fallback session count before sessions are materialized).
    const scheduleIds = Array.from(
      new Set(enrollmentsRows.map(r => r.enrollment.scheduleId).filter(Boolean) as string[])
    )
    const scheduleRows =
      scheduleIds.length > 0
        ? await drizzleDb
            .select({
              scheduleId: courseSchedule.scheduleId,
              name: courseSchedule.name,
              scheduleIndex: courseSchedule.scheduleIndex,
              schedule: courseSchedule.schedule,
              weeksToSchedule: courseSchedule.weeksToSchedule,
            })
            .from(courseSchedule)
            .where(inArray(courseSchedule.scheduleId, scheduleIds))
        : []
    const scheduleById = new Map(scheduleRows.map(s => [s.scheduleId, s]))

    const enrollments = enrollmentsRows.map(row => {
      const schedId = row.enrollment.scheduleId
      const chosen = schedId ? scheduleById.get(schedId) : null
      const p = progressByCourse.get(row.courseId)
      const lessonTotal =
        p?.totalLessons && p.totalLessons > 0
          ? p.totalLessons
          : (lessonCountByCourse.get(row.courseId) ?? 0)
      const lessonsDone = Math.min(p?.lessonsCompleted ?? 0, lessonTotal)
      const isCompleted = p?.isCompleted === true || row.enrollment.completedAt != null
      // Prefer the count for the student's chosen schedule; fall back to the
      // course-wide count, then to the expected slots × weeks (pre-materialize).
      // Past sessions are subtracted from the SAME scope so remaining can't be
      // driven to 0 by course-wide past sessions outside the chosen schedule.
      const scheduleKey = schedId ? `${row.courseId}:${schedId}` : null
      const scheduleScopedCount = scheduleKey ? sessionCountBySchedule.get(scheduleKey) : undefined
      let sessionCount = scheduleScopedCount ?? sessionCountByCourse.get(row.courseId) ?? 0
      if (sessionCount === 0) {
        const slots = Array.isArray(chosen?.schedule)
          ? chosen!.schedule
          : Array.isArray(row.courseSchedule)
            ? (row.courseSchedule as unknown[])
            : []
        const weeks = chosen?.weeksToSchedule ?? 8
        sessionCount = slots.length * (weeks || 1)
      }
      const pastSessions =
        scheduleScopedCount != null
          ? (pastCountBySchedule.get(scheduleKey!) ?? 0)
          : (pastCountByCourse.get(row.courseId) ?? 0)
      const remainingSessions = Math.max(0, sessionCount - pastSessions)
      const sessions = (sessionsByCourse.get(row.courseId) ?? []).map(s => ({
        id: s.sessionId,
        scheduledAt: s.scheduledAt ? s.scheduledAt.toISOString() : null,
        status: s.status,
      }))
      return {
        ...row.enrollment,
        chosenSchedule: chosen
          ? {
              scheduleId: chosen.scheduleId,
              name: chosen.name,
              scheduleIndex: chosen.scheduleIndex,
            }
          : null,
        sessionCount,
        remainingSessions,
        sessions,
        progress: {
          lessonsCompleted: lessonsDone,
          totalLessons: lessonTotal,
          averageScore: p?.averageScore ?? null,
          isCompleted,
        },
        course: {
          courseId: row.courseId,
          name: row.courseName,
          categories: row.courseCategories,
          description: row.courseDescription,
          isPublished: row.courseIsPublished,
          schedule: row.courseSchedule,
          tutorHandle: row.tutorHandle,
          tutorName: row.tutorName,
          tutorImage: row.tutorImage,
          tutorAvatar: row.tutorAvatar,
          variantCategory: row.variantCategory,
          variantNationality: row.variantNationality,
          sessionCount,
          _count: {
            lessons: lessonCountByCourse.get(row.courseId) ?? 0,
          },
        },
      }
    })

    return NextResponse.json({ enrollments })
  },
  { role: 'STUDENT' }
)
