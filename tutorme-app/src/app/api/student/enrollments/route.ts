/**
 * Student Enrollment API
 * POST: Enroll student in a course
 * GET: List student's enrollments
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withAuth, NotFoundError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  course,
  courseLesson,
  courseEnrollment,
  courseProgress,
  payment,
  user,
} from '@/lib/db/schema'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

export const POST = withAuth(async (req, session) => {
  const body = await req.json().catch(() => ({}))
  const { courseId, startDate } = body

  if (!courseId || typeof courseId !== 'string') {
    return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
  }

  const [courseRow] = await drizzleDb
    .select()
    .from(course)
    .where(eq(course.courseId, courseId))
    .limit(1)

  if (!courseRow) {
    throw new NotFoundError('Course not found')
  }

  if (!courseRow.isFree && courseRow.price && courseRow.price > 0) {
    const [paymentRow] = await drizzleDb
      .select({ paymentId: payment.paymentId })
      .from(payment)
      .where(
        and(
          inArray(payment.status, ['COMPLETED', 'PENDING']),
          sql`${payment.metadata}->>'courseId' = ${courseId}`,
          sql`${payment.metadata}->>'studentId' = ${session.user.id}`
        )
      )
      .limit(1)

    if (!paymentRow) {
      return NextResponse.json(
        {
          error: 'Payment required',
          requiresPayment: true,
          amount: courseRow.price,
          currency: courseRow.currency || 'USD',
        },
        { status: 402 }
      )
    }
  }

  const totalLessons =
    (
      await drizzleDb
        .select({ count: sql<number>`count(*)::int` })
        .from(courseLesson)
        .where(eq(courseLesson.courseId, courseId))
    )[0]?.count ?? 0

  const [existingEnrollment] = await drizzleDb
    .select()
    .from(courseEnrollment)
    .where(
      and(eq(courseEnrollment.studentId, session.user.id), eq(courseEnrollment.courseId, courseId))
    )
    .limit(1)

  const [existingProgress] = await drizzleDb
    .select()
    .from(courseProgress)
    .where(
      and(eq(courseProgress.studentId, session.user.id), eq(courseProgress.courseId, courseId))
    )
    .limit(1)

  if (existingEnrollment || existingProgress) {
    return NextResponse.json({
      success: true,
      message: 'Already enrolled',
      enrollment: existingEnrollment,
      progress: existingProgress,
    })
  }

  const enrollmentId = crypto.randomUUID()
  const progressId = crypto.randomUUID()

  await drizzleDb.transaction(async tx => {
    await tx.insert(courseEnrollment).values({
      enrollmentId,
      studentId: session.user.id,
      courseId,
      startDate: startDate ? new Date(startDate) : undefined,
      lessonsCompleted: 0,
      enrollmentSource: 'browse',
    })

    await tx.insert(courseProgress).values({
      progressId,
      studentId: session.user.id,
      courseId,
      lessonsCompleted: 0,
      totalLessons,
      isCompleted: false,
    })
  })

  const [enrollment] = await drizzleDb
    .select()
    .from(courseEnrollment)
    .where(eq(courseEnrollment.enrollmentId, enrollmentId))
    .limit(1)
  const [progress] = await drizzleDb
    .select()
    .from(courseProgress)
    .where(eq(courseProgress.progressId, progressId))
    .limit(1)

  return NextResponse.json({
    success: true,
    message: 'Enrolled successfully',
    enrollment: enrollment!,
    progress: progress!,
  })
})

export const GET = withAuth(async (req, session) => {
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
    })
    .from(courseEnrollment)
    .innerJoin(course, eq(courseEnrollment.courseId, course.courseId))
    .leftJoin(user, eq(course.creatorId, user.userId))
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
      _count: {
        lessons: lessonCountByCourse.get(row.courseId) ?? 0,
      },
    },
  }))

  return NextResponse.json({ enrollments })
})
