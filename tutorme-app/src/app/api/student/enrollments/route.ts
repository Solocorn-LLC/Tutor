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
} from '@/lib/db/schema'
import { and, eq, inArray, desc } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { enrollStudentInCourse, enrollmentPaymentRequiredResponse } from '@/lib/api/enrollments'

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
        variantCategory: courseVariant.category,
        variantNationality: courseVariant.nationality,
      })
      .from(courseEnrollment)
      .innerJoin(course, eq(courseEnrollment.courseId, course.courseId))
      .leftJoin(user, eq(course.creatorId, user.userId))
      .leftJoin(courseVariant, eq(courseVariant.publishedCourseId, course.courseId))
      .where(eq(courseEnrollment.studentId, session.user.id))
      .orderBy(desc(courseEnrollment.enrolledAt))

    // Batch query lesson counts to avoid N+1
    const courseIds = enrollmentsRows.map(row => row.courseId)
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
    const lessonCountByCourse = new Map(lessonCounts.map(m => [m.courseId, m.count ?? 0]))

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
    const progressByCourse = new Map(progressRows.map(p => [p.courseId, p]))

    // Real session counts: a "session" is a materialized liveSession (one per
    // scheduled time slot, expanded over the schedule's weeks) — NOT a content
    // lesson. Count non-cancelled sessions per (course, schedule).
    const sessionRows =
      courseIds.length > 0
        ? await drizzleDb
            .select({
              courseId: liveSession.courseId,
              scheduleId: liveSession.scheduleId,
              count: sql<number>`count(*)::int`,
            })
            .from(liveSession)
            .where(inArray(liveSession.courseId, courseIds))
            .groupBy(liveSession.courseId, liveSession.scheduleId)
        : []
    const sessionCountBySchedule = new Map<string, number>() // `courseId:scheduleId`
    const sessionCountByCourse = new Map<string, number>() // course-wide total
    for (const r of sessionRows) {
      const cid = r.courseId ?? ''
      sessionCountByCourse.set(cid, (sessionCountByCourse.get(cid) ?? 0) + (r.count ?? 0))
      if (r.scheduleId) sessionCountBySchedule.set(`${cid}:${r.scheduleId}`, r.count ?? 0)
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
      // Prefer the count for the student's chosen schedule; fall back to the
      // course-wide count, then to the expected slots × weeks (pre-materialize).
      let sessionCount =
        (schedId ? sessionCountBySchedule.get(`${row.courseId}:${schedId}`) : undefined) ??
        sessionCountByCourse.get(row.courseId) ??
        0
      if (sessionCount === 0) {
        const slots = Array.isArray(chosen?.schedule)
          ? chosen!.schedule
          : Array.isArray(row.courseSchedule)
            ? (row.courseSchedule as unknown[])
            : []
        const weeks = chosen?.weeksToSchedule ?? 8
        sessionCount = slots.length * (weeks || 1)
      }
      const p = progressByCourse.get(row.courseId)
      const lessonTotal =
        p?.totalLessons && p.totalLessons > 0
          ? p.totalLessons
          : (lessonCountByCourse.get(row.courseId) ?? 0)
      const lessonsDone = Math.min(p?.lessonsCompleted ?? 0, lessonTotal)
      const isCompleted = p?.isCompleted === true || row.enrollment.completedAt != null
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
