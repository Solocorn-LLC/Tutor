/**
 * GET /api/tutor/courses/enrolled
 * List tutor courses that have enrolled students.
 */

import { NextResponse } from 'next/server'
import { desc, eq, sql, inArray, and } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseEnrollment, liveSession, courseVariant } from '@/lib/db/schema'

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
      .innerJoin(courseEnrollment, eq(courseEnrollment.courseId, course.courseId))
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

    // Get session counts for each course. `total` counts every non-cancelled
    // session (so a course whose sessions are all past/ended still shows a real
    // number rather than 0); `upcoming` counts only the actionable ones.
    const courseIds = courses.map(c => c.courseId)
    let sessionCounts: { courseId: string; total: number; upcoming: number }[] = []

    if (courseIds.length > 0) {
      const sessions = await drizzleDb
        .select({
          courseId: liveSession.courseId,
          total: sql<number>`count(*) filter (where ${liveSession.status} <> 'cancelled')::int`,
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

    // Fetch variant info
    const variantRows =
      courseIds.length > 0
        ? await drizzleDb
            .select({
              publishedCourseId: courseVariant.publishedCourseId,
              nationality: courseVariant.nationality,
              category: courseVariant.category,
            })
            .from(courseVariant)
            .where(inArray(courseVariant.publishedCourseId, courseIds))
        : []
    const variantMap = new Map(
      variantRows.map(v => [
        v.publishedCourseId,
        { nationality: v.nationality, category: v.category },
      ])
    )

    const coursesWithSessionCount = courses.map(c => {
      const variant = variantMap.get(c.courseId)
      const counts = sessionCounts.find(s => s.courseId === c.courseId)
      return {
        id: c.courseId,
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
        nationality: variant?.nationality ?? undefined,
        variantCategory: variant?.category ?? undefined,
      }
    })

    return NextResponse.json({ courses: coursesWithSessionCount })
  },
  { role: 'TUTOR' }
)
