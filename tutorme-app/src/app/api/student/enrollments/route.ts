/**
 * Student Enrollment API
 * POST: Enroll student in a course
 * GET: List student's enrollments
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withAuth, withCsrf, NotFoundError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseLesson, courseEnrollment, courseVariant, user } from '@/lib/db/schema'
import { eq, inArray, desc } from 'drizzle-orm'
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

    const enrollments = enrollmentsRows.map(row => ({
      ...row.enrollment,
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
        _count: {
          lessons: lessonCountByCourse.get(row.courseId) ?? 0,
        },
      },
    }))

    return NextResponse.json({ enrollments })
  },
  { role: 'STUDENT' }
)
