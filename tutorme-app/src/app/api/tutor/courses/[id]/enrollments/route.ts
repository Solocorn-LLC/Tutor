import { NextResponse } from 'next/server'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { courseEnrollment, user, profile, courseLesson, courseLessonProgress } from '@/lib/db/schema'

export const GET = withAuth(
  async (_req, session, context) => {
    const courseId = await getParamAsync(context.params, 'id')

    if (!courseId || courseId === 'undefined' || courseId === 'null') {
      return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
    }

    const enrollments = await drizzleDb
      .select({
        enrollmentId: courseEnrollment.enrollmentId,
        studentId: courseEnrollment.studentId,
        enrolledAt: courseEnrollment.enrolledAt,
        studentName: profile.name,
        studentEmail: user.email,
      })
      .from(courseEnrollment)
      .innerJoin(user, eq(user.userId, courseEnrollment.studentId))
      .innerJoin(profile, eq(profile.userId, user.userId))
      .where(eq(courseEnrollment.courseId, courseId))
      .orderBy(courseEnrollment.enrolledAt)

    // Get all lesson IDs for this course
    const lessons = await drizzleDb
      .select({ lessonId: courseLesson.lessonId })
      .from(courseLesson)
      .where(eq(courseLesson.courseId, courseId))

    const lessonIds = lessons.map(l => l.lessonId)

    // Get completed lesson counts per student
    const studentIds = enrollments.map(e => e.studentId)
    const progressCounts =
      studentIds.length > 0 && lessonIds.length > 0
        ? await drizzleDb
            .select({
              studentId: courseLessonProgress.studentId,
              count: sql<number>`count(*)::int`,
            })
            .from(courseLessonProgress)
            .where(
              and(
                eq(courseLessonProgress.status, 'COMPLETED'),
                inArray(courseLessonProgress.lessonId, lessonIds)
              )
            )
            .groupBy(courseLessonProgress.studentId)
        : []

    const progressMap = new Map(progressCounts.map(p => [p.studentId, p.count ?? 0]))

    const enrollmentsWithProgress = enrollments.map(e => ({
      ...e,
      lessonsCompleted: progressMap.get(e.studentId) ?? 0,
    }))

    return NextResponse.json({ enrollments: enrollmentsWithProgress })
  },
  { role: 'TUTOR' }
)
