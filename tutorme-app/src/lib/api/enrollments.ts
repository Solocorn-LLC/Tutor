import { NextResponse } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  course,
  courseLesson,
  courseEnrollment,
  courseProgress,
  payment,
} from '@/lib/db/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { NotFoundError } from '@/lib/api/middleware'

export interface EnrollmentResult {
  success: boolean
  message: string
  enrollment?: typeof courseEnrollment.$inferSelect
  progress?: typeof courseProgress.$inferSelect
}

/**
 * Enroll a student in a course. Shared logic used by both
 * POST /api/student/enrollments and POST /api/course/[courseId]/enroll.
 */
export async function enrollStudentInCourse(
  studentId: string,
  courseId: string,
  startDate?: string | Date | null
): Promise<EnrollmentResult> {
  const [courseRow] = await drizzleDb
    .select()
    .from(course)
    .where(eq(course.courseId, courseId))
    .limit(1)

  if (!courseRow) {
    throw new NotFoundError('Course not found')
  }

  // Payment check for paid courses
  if (!courseRow.isFree && courseRow.price && courseRow.price > 0) {
    const [paymentRow] = await drizzleDb
      .select({ paymentId: payment.paymentId })
      .from(payment)
      .where(
        and(
          inArray(payment.status, ['COMPLETED', 'PENDING']),
          sql`${payment.metadata}->>'courseId' = ${courseId}`,
          sql`${payment.metadata}->>'studentId' = ${studentId}`
        )
      )
      .limit(1)

    if (!paymentRow) {
      const paymentError = new Error('Payment required') as unknown as {
        requiresPayment: true
        amount: number
        currency: string
        status: number
      }
      paymentError.requiresPayment = true
      paymentError.amount = courseRow.price
      paymentError.currency = courseRow.currency || 'USD'
      paymentError.status = 402
      throw paymentError
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
      and(eq(courseEnrollment.studentId, studentId), eq(courseEnrollment.courseId, courseId))
    )
    .limit(1)

  const [existingProgress] = await drizzleDb
    .select()
    .from(courseProgress)
    .where(
      and(eq(courseProgress.studentId, studentId), eq(courseProgress.courseId, courseId))
    )
    .limit(1)

  if (existingEnrollment || existingProgress) {
    return {
      success: true,
      message: 'Already enrolled',
      enrollment: existingEnrollment,
      progress: existingProgress,
    }
  }

  const enrollmentId = crypto.randomUUID()
  const progressId = crypto.randomUUID()

  await drizzleDb.transaction(async tx => {
    await tx.insert(courseEnrollment).values({
      enrollmentId,
      studentId,
      courseId,
      startDate: startDate ? new Date(startDate) : undefined,
      lessonsCompleted: 0,
      enrollmentSource: 'browse',
    })

    await tx.insert(courseProgress).values({
      progressId,
      studentId,
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

  return {
    success: true,
    message: 'Enrolled successfully',
    enrollment: enrollment!,
    progress: progress!,
  }
}

/**
 * Build the HTTP response for a payment-required enrollment error.
 */
export function enrollmentPaymentRequiredResponse(error: {
  amount?: number
  currency?: string
}): Response {
  return NextResponse.json(
    {
      error: 'Payment required',
      requiresPayment: true,
      amount: error.amount,
      currency: error.currency,
    },
    { status: 402 }
  )
}
