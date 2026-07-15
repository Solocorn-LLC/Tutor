/**
 * GET /api/tutor/courses/enrolled
 * List tutor courses that have enrolled students.
 */

import { NextResponse } from 'next/server'
import { desc, eq, sql, inArray, and } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  course,
  courseEnrollment,
  liveSession,
  courseVariant,
  courseSchedule,
} from '@/lib/db/schema'

export const GET = withAuth(
  async (_req, session) => {
    const tutorId = session?.user?.id
    if (!tutorId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const enrollmentCount = sql<number>`count(${courseEnrollment.enrollmentId})`.as(
      'enrollmentCount'
    )

    const courses = await drizzleDb
      .select({
        courseId: course.courseId,
        name: course.name,
        categories: course.categories,
        isPublished: course.isPublished,
        price: course.price,
        currency: course.currency,
        schedule: course.schedule,
        enrollmentCount,
      })
      .from(course)
      // leftJoin (not inner) so a published course with zero enrollments still
      // appears on the tutor dashboard — enrollment is not a precondition for a
      // published course to show as active.
      .leftJoin(courseEnrollment, eq(courseEnrollment.courseId, course.courseId))
      .where(and(eq(course.creatorId, tutorId), eq(course.isPublished, true)))
      .groupBy(
        course.courseId,
        course.name,
        course.categories,
        course.isPublished,
        course.price,
        course.currency,
        course.schedule
      )
      .orderBy(desc(enrollmentCount))

    // Get session counts for each course. `total` counts every session (so a
    // course whose sessions are all past/ended still shows a real number rather
    // than 0); `upcoming` counts only the actionable ones. There is no
    // 'cancelled' LiveSessionStatus — cancelling a session sets it to 'ended' —
    // so the old `status <> 'cancelled'` filter both errored (invalid enum
    // literal) and excluded nothing; `total` is simply the full count.
    const courseIds = courses.map(c => c.courseId)
    let sessionCounts: { courseId: string; total: number; upcoming: number }[] = []

    if (courseIds.length > 0) {
      const sessions = await drizzleDb
        .select({
          courseId: liveSession.courseId,
          total: sql<number>`count(*)::int`,
          upcoming: sql<number>`count(*) filter (where ${liveSession.status} in ('scheduled', 'active', 'live', 'paused'))::int`,
        })
        .from(liveSession)
        .where(eq(liveSession.tutorId, tutorId))
        .groupBy(liveSession.courseId)

      sessionCounts = sessions.map(s => ({
        courseId: s.courseId ?? '',
        total: s.total,
        upcoming: s.upcoming,
      }))
    }

    // Count weekly-pattern schedule rows per course. A course can have schedules
    // without any materialized liveSession rows (sessions are materialized at
    // publish), so the dashboard needs this to show "View Sessions" rather than
    // "Schedule sessions" for a course that already has a schedule.
    let scheduleCounts: { courseId: string; count: number }[] = []
    if (courseIds.length > 0) {
      const rows = await drizzleDb
        .select({
          courseId: courseSchedule.courseId,
          count: sql<number>`count(*)::int`,
        })
        .from(courseSchedule)
        .where(inArray(courseSchedule.courseId, courseIds))
        .groupBy(courseSchedule.courseId)
      scheduleCounts = rows.map(r => ({ courseId: r.courseId, count: r.count }))
    }

    // Fetch variant info
    const variantRows =
      courseIds.length > 0
        ? await drizzleDb
            .select({
              publishedCourseId: courseVariant.publishedCourseId,
              templateCourseId: courseVariant.templateCourseId,
              nationality: courseVariant.nationality,
              category: courseVariant.category,
            })
            .from(courseVariant)
            .where(inArray(courseVariant.publishedCourseId, courseIds))
        : []
    const variantMap = new Map(
      variantRows.map(v => [
        v.publishedCourseId,
        {
          templateCourseId: v.templateCourseId,
          nationality: v.nationality,
          category: v.category,
        },
      ])
    )

    const coursesWithSessionCount = courses.map(c => {
      const variant = variantMap.get(c.courseId)
      const counts = sessionCounts.find(s => s.courseId === c.courseId)
      const scheduleCount = scheduleCounts.find(s => s.courseId === c.courseId)?.count ?? 0
      return {
        id: c.courseId,
        // The scheduler/course builder operates on the TEMPLATE course; this id
        // is the published variant, so expose its template for "Add schedule"
        // style links (falls back to the published id for legacy/direct courses).
        templateCourseId: variant?.templateCourseId ?? c.courseId,
        name: c.name,
        categories: c.categories,
        isPublished: c.isPublished,
        price: c.price,
        currency: c.currency,
        schedule: c.schedule,
        enrollmentCount: c.enrollmentCount,
        subject: c.categories?.[0] ?? null,
        sessionCount: counts?.total ?? 0,
        upcomingSessionsCount: counts?.upcoming ?? 0,
        scheduleCount,
        nationality: variant?.nationality ?? undefined,
        variantCategory: variant?.category ?? undefined,
      }
    })

    return NextResponse.json({ courses: coursesWithSessionCount })
  },
  { role: 'TUTOR' }
)
