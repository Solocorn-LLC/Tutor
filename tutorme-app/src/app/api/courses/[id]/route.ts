/**
 * Course Detail API
 * GET: Get details for a specific course, including enrollment status
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseLesson, courseEnrollment, courseSchedule } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { computeCourseSessionCount } from '@/lib/courses/session-count'
import { getParamAsync } from '@/lib/api/params'

export const GET = withAuth(
  async (req: NextRequest, session, context) => {
    const courseId = await getParamAsync(context.params, 'id')

    if (!courseId) {
      return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
    }

    const [courseRow] = await drizzleDb
      .select()
      .from(course)
      .where(eq(course.courseId, courseId))
      .limit(1)

    if (!courseRow) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const [lessonCount] = await drizzleDb
      .select({ count: sql<number>`count(*)::int` })
      .from(courseLesson)
      .where(eq(courseLesson.courseId, courseId))

    const schedules = await drizzleDb
      .select({
        schedule: courseSchedule.schedule,
        weeksToSchedule: courseSchedule.weeksToSchedule,
      })
      .from(courseSchedule)
      .where(eq(courseSchedule.courseId, courseId))

    const sessionCount = computeCourseSessionCount(schedules)

    const [enrollmentRow] = await drizzleDb
      .select({ enrollmentId: courseEnrollment.enrollmentId })
      .from(courseEnrollment)
      .where(
        and(
          eq(courseEnrollment.studentId, session.user.id),
          eq(courseEnrollment.courseId, courseId)
        )
      )
      .limit(1)

    const detail = {
      id: courseRow.courseId,
      name: courseRow.name,
      subject: courseRow.categories?.[0] || 'general',
      description: courseRow.description,
      estimatedHours: 0,
      price: courseRow.isFree ? 0 : courseRow.price,
      currency: courseRow.currency,
      modulesCount: 0,
      lessonsCount: lessonCount?.count ?? 0,
      sessionCount,
      enrolled: !!enrollmentRow,
    }

    return NextResponse.json(detail)
  },
  { role: 'STUDENT' }
)
