import { NextResponse } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  course,
  courseLesson,
  courseEnrollment,
  courseProgress,
  payment,
  courseSchedule,
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
 * POST /api/student/enrollments and POST /api/courses/[courseId]/enroll.
 *
 * Atomicity guarantee: the duplicate check, capacity enforcement, and all inserts
 * are performed inside a single DB transaction to prevent race conditions.
 */
export async function enrollStudentInCourse(
  studentId: string,
  courseId: string,
  startDate?: string | Date | null,
  scheduleId?: string | null,
  // Set by trusted callers (payment webhooks) where payment is already confirmed, so
  // the payment gate below is skipped and a paid enrollment is never blocked.
  paymentConfirmed = false
): Promise<EnrollmentResult> {
  const [courseRow] = await drizzleDb
    .select()
    .from(course)
    .where(eq(course.courseId, courseId))
    .limit(1)

  if (!courseRow) {
    throw new NotFoundError('Course not found')
  }

  // Payment check for paid courses (read-only, safe outside transaction)
  if (!paymentConfirmed && !courseRow.isFree && courseRow.price && courseRow.price > 0) {
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

  const enrollmentId = crypto.randomUUID()
  const progressId = crypto.randomUUID()

  let alreadyEnrolled = false

  await drizzleDb.transaction(async tx => {
    // Check for existing enrollment inside the transaction to prevent duplicate inserts
    const [existingEnrollment] = await tx
      .select({ enrollmentId: courseEnrollment.enrollmentId })
      .from(courseEnrollment)
      .where(
        and(eq(courseEnrollment.studentId, studentId), eq(courseEnrollment.courseId, courseId))
      )
      .limit(1)

    if (existingEnrollment) {
      alreadyEnrolled = true
      return
    }

    // Atomic capacity increment: only succeeds if enrolledCount < maxStudents.
    // This prevents race conditions where two concurrent requests both pass a
    // pre-transaction capacity check and both enroll, exceeding the limit.
    if (scheduleId) {
      if (paymentConfirmed) {
        // Paid student already committed — always grant the seat (never block a paid
        // enrollment), even if it slightly exceeds the soft cap.
        await tx.execute(
          sql`UPDATE "CourseSchedule"
              SET "enrolledCount" = "enrolledCount" + 1
              WHERE id = ${scheduleId} AND "courseId" = ${courseId}`
        )
      } else {
        const updated = await tx.execute(
          sql`UPDATE "CourseSchedule"
              SET "enrolledCount" = "enrolledCount" + 1
              WHERE id = ${scheduleId}
                AND "courseId" = ${courseId}
                AND ("maxStudents" IS NULL OR "enrolledCount" < "maxStudents")
              RETURNING id`
        )
        if (!updated.rows.length) {
          throw new Error('This schedule is full')
        }
      }
    }

    await tx.insert(courseEnrollment).values({
      enrollmentId,
      studentId,
      courseId,
      scheduleId: scheduleId || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      enrollmentSource: 'browse',
    })

    // Idempotent: a row may already exist from a legacy path that wrote progress
    // without an enrollment. Don't let that abort the whole enrollment.
    await tx
      .insert(courseProgress)
      .values({
        progressId,
        studentId,
        courseId,
        lessonsCompleted: 0,
        totalLessons,
        isCompleted: false,
      })
      .onConflictDoNothing()
  })

  if (alreadyEnrolled) {
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
      .where(and(eq(courseProgress.studentId, studentId), eq(courseProgress.courseId, courseId)))
      .limit(1)
    return {
      success: true,
      message: 'Already enrolled',
      enrollment: existingEnrollment,
      progress: existingProgress,
    }
  }

  const [enrollment] = await drizzleDb
    .select()
    .from(courseEnrollment)
    .where(eq(courseEnrollment.enrollmentId, enrollmentId))
    .limit(1)
  const [progress] = await drizzleDb
    .select()
    .from(courseProgress)
    .where(and(eq(courseProgress.studentId, studentId), eq(courseProgress.courseId, courseId)))
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
