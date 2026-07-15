/**
 * POST /api/student/courses/[id]/unenroll
 *
 * Lets a student unregister from a course with full cleanup:
 *  - delete the enrollment + its progress row, release the schedule seat
 *  - for a paid course, record a PENDING partial-refund request (no automatic
 *    gateway money movement): refund = paid x (unused session fraction) minus
 *    the LLM token cost attributed to this student+course
 *  - notify the tutor (course creator)
 *
 * The refund is recorded for tutor/admin approval via the existing refund flow.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import crypto from 'crypto'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { courseEnrollment, courseProgress, course, payment, refund } from '@/lib/db/schema'
import { notify } from '@/lib/notifications/notify'
import { reconcileProposalsAfterDeparture } from '@/lib/schedule/reschedule-consent'
import { sumLlmUsageForStudentCourse } from '@/lib/ai/usage'

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const studentId = session.user.id
      const courseId = await getParamAsync(context.params, 'id')
      if (!courseId) {
        return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
      }

      // 1. Verify enrollment + capture progress BEFORE deleting (needed for the refund math).
      const [enrollment] = await drizzleDb
        .select({
          enrollmentId: courseEnrollment.enrollmentId,
          scheduleId: courseEnrollment.scheduleId,
        })
        .from(courseEnrollment)
        .where(
          and(eq(courseEnrollment.studentId, studentId), eq(courseEnrollment.courseId, courseId))
        )
        .limit(1)
      if (!enrollment) {
        return NextResponse.json({ error: 'You are not enrolled in this course' }, { status: 404 })
      }

      const [courseRow] = await drizzleDb
        .select({ name: course.name, creatorId: course.creatorId })
        .from(course)
        .where(eq(course.courseId, courseId))
        .limit(1)

      const [progress] = await drizzleDb
        .select({
          lessonsCompleted: courseProgress.lessonsCompleted,
          totalLessons: courseProgress.totalLessons,
        })
        .from(courseProgress)
        .where(and(eq(courseProgress.studentId, studentId), eq(courseProgress.courseId, courseId)))
        .limit(1)

      // Completed (paid) payment for this enrollment, if any.
      const [paymentRow] = await drizzleDb
        .select({
          paymentId: payment.paymentId,
          amount: payment.amount,
          currency: payment.currency,
        })
        .from(payment)
        .where(
          and(eq(payment.enrollmentId, enrollment.enrollmentId), eq(payment.status, 'COMPLETED'))
        )
        .limit(1)

      // 2. Cleanup in a transaction: progress, enrollment, schedule seat.
      await drizzleDb.transaction(async tx => {
        await tx
          .delete(courseProgress)
          .where(
            and(eq(courseProgress.studentId, studentId), eq(courseProgress.courseId, courseId))
          )
        await tx
          .delete(courseEnrollment)
          .where(eq(courseEnrollment.enrollmentId, enrollment.enrollmentId))
        if (enrollment.scheduleId) {
          await tx.execute(
            sql`UPDATE "CourseSchedule"
                SET "enrolledCount" = GREATEST("enrolledCount" - 1, 0)
                WHERE id = ${enrollment.scheduleId}`
          )
        }
      })

      // Re-evaluate any pending reschedule proposals now that this student is
      // gone, so their unanswered vote can't leave a proposal stuck.
      await reconcileProposalsAfterDeparture(studentId, courseId)

      // 3. Partial refund request for paid courses.
      let refundInfo: { amount: number; currency: string; status: string } | null = null
      if (paymentRow && paymentRow.amount > 0) {
        const total = progress?.totalLessons ?? 0
        const done = progress?.lessonsCompleted ?? 0
        const usedFraction = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0
        const proRata = paymentRow.amount * (1 - usedFraction)

        // Deduct the LLM token cost this student incurred in this course.
        const { costUsd: tokenCost } = await sumLlmUsageForStudentCourse(studentId, courseId)
        const amount = Math.max(0, Math.round((proRata - tokenCost) * 100) / 100)

        await drizzleDb.insert(refund).values({
          refundId: crypto.randomUUID(),
          paymentId: paymentRow.paymentId,
          amount,
          reason: `Student unregistered from "${courseRow?.name ?? courseId}". Pro-rata on ${done}/${total} sessions taken, minus token cost $${tokenCost.toFixed(2)}.`,
          status: 'PENDING',
          createdAt: new Date(),
        })
        refundInfo = { amount, currency: paymentRow.currency, status: 'PENDING' }
      }

      // 4. Notify the tutor.
      if (courseRow?.creatorId) {
        await notify({
          userId: courseRow.creatorId,
          type: 'enrollment',
          title: 'A student left your course',
          message: refundInfo
            ? `A student unregistered from "${courseRow.name}". A partial refund of ${refundInfo.currency} ${refundInfo.amount.toFixed(2)} is pending your review.`
            : `A student unregistered from "${courseRow.name}".`,
          actionUrl: refundInfo ? `/tutor/refunds` : `/tutor/courses/${courseId}/enrollments`,
        }).catch(err => console.warn('[unenroll] tutor notify failed (non-critical):', err))
      }

      return NextResponse.json({ success: true, refund: refundInfo })
    },
    { role: 'STUDENT' }
  )
)
