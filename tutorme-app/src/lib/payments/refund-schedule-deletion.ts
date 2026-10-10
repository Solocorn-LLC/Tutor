/**
 * Automated refund + unenroll for students affected by a tutor deleting a
 * course schedule.
 *
 * Policy: when a schedule is deleted, every student enrolled in it is
 * unenrolled and refunded the prorated value of the unused sessions in that
 * schedule (paid x unused fraction), minus the LLM token cost the student
 * incurred in the course. Refunds are executed immediately through the SAME
 * gateway the student paid with and recorded in the `refund` table.
 *
 * Best-effort: a failure for one student never blocks the others. The result
 * summary lets the caller (schedule DELETE route) surface what happened.
 */

import { and, eq, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  courseEnrollment,
  courseProgress,
  courseSchedule,
  liveSession,
  payment,
  refund,
} from '@/lib/db/schema'
import { sumLlmUsageForStudentCourse } from '@/lib/ai/usage'
import { notify } from '@/lib/notifications/notify'
import { reconcileProposalsAfterDeparture } from '@/lib/schedule/reschedule-consent'
import { getPaymentGateway, type GatewayName } from './factory'

export type ScheduleRefundStatus = 'COMPLETED' | 'FAILED' | 'SKIPPED'

export interface ScheduleDeletionRefundResult {
  studentsUnenrolled: number
  refunds: Array<{
    studentId: string
    amount: number
    currency: string
    status: ScheduleRefundStatus
    error?: string
  }>
  pendingPaymentsCancelled: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Prorated refund for a schedule deletion:
 * paid x (1 - completed/total) - tokenCost, floored at 0 and rounded to cents.
 */
export function computeScheduleDeletionRefund(
  paid: number,
  totalSessions: number,
  completedSessions: number,
  tokenCost: number
): number {
  const usedFraction =
    totalSessions > 0 ? Math.min(1, Math.max(0, completedSessions / totalSessions)) : 0
  const proRata = paid * (1 - usedFraction)
  return Math.max(0, round2(proRata - tokenCost))
}

/**
 * Count total/completed sessions from a schedule's materialized liveSession
 * rows. Mirrors the countable-session predicate in
 * app/api/student/enrollments/route.ts: a cancelled session or an ENDED row
 * whose scheduledAt is still in the future (cancelled before it ever ran)
 * never counts; completed = ENDED and scheduledAt <= now.
 */
export function countScheduleSessions(
  rows: Array<{ status: string; scheduledAt: Date | null }>,
  now: Date
): { total: number; completed: number } {
  let total = 0
  let completed = 0
  for (const s of rows) {
    if (s.status === 'cancelled') continue
    const cancelledBeforeStart =
      s.status === 'ended' && s.scheduledAt != null && s.scheduledAt > now
    if (cancelledBeforeStart) continue
    total++
    if (s.status === 'ended' && s.scheduledAt != null && s.scheduledAt <= now) completed++
  }
  return { total, completed }
}

/**
 * Refund and unenroll every student enrolled in a schedule being deleted, and
 * cancel in-flight (not yet completed) payments that targeted it. Must run
 * BEFORE the CourseSchedule row is deleted: the fallback session math and the
 * seat decrement read the row.
 */
export async function handleScheduleDeletion(opts: {
  courseId: string
  scheduleId: string
  courseName: string
  tutorId?: string
}): Promise<ScheduleDeletionRefundResult> {
  const { courseId, scheduleId, courseName, tutorId } = opts
  const result: ScheduleDeletionRefundResult = {
    studentsUnenrolled: 0,
    refunds: [],
    pendingPaymentsCancelled: 0,
  }
  const now = new Date()

  const affected = await drizzleDb
    .select({
      enrollmentId: courseEnrollment.enrollmentId,
      studentId: courseEnrollment.studentId,
    })
    .from(courseEnrollment)
    .where(eq(courseEnrollment.scheduleId, scheduleId))

  const [scheduleRow] = await drizzleDb
    .select({ schedule: courseSchedule.schedule, weeksToSchedule: courseSchedule.weeksToSchedule })
    .from(courseSchedule)
    .where(eq(courseSchedule.scheduleId, scheduleId))
    .limit(1)

  const sessionRows = await drizzleDb
    .select({ status: liveSession.status, scheduledAt: liveSession.scheduledAt })
    .from(liveSession)
    .where(eq(liveSession.scheduleId, scheduleId))
  const counted = countScheduleSessions(sessionRows, now)

  // If sessions were never materialized, fall back to the expected pattern
  // size (slots x weeks) so the refund is a full refund minus token cost.
  const fallbackTotal = Array.isArray(scheduleRow?.schedule)
    ? scheduleRow.schedule.length * (scheduleRow.weeksToSchedule || 1)
    : 0
  const totalSessions = counted.total > 0 ? counted.total : fallbackTotal
  const completedSessions = counted.total > 0 ? counted.completed : 0

  for (const enrollment of affected) {
    try {
      // Completed payment for this enrollment, if any. Prefer the row-level
      // enrollment link; fall back to the scheduleId/studentId metadata pair
      // for payments whose webhook back-fill hasn't run yet.
      let [pay] = await drizzleDb
        .select()
        .from(payment)
        .where(
          and(eq(payment.enrollmentId, enrollment.enrollmentId), eq(payment.status, 'COMPLETED'))
        )
        .limit(1)
      if (!pay) {
        ;[pay] = await drizzleDb
          .select()
          .from(payment)
          .where(
            and(
              eq(payment.status, 'COMPLETED'),
              sql`${payment.metadata} ->> 'scheduleId' = ${scheduleId}`,
              sql`${payment.metadata} ->> 'studentId' = ${enrollment.studentId}`
            )
          )
          .limit(1)
      }

      let status: ScheduleRefundStatus = 'SKIPPED'
      let amount = 0
      let currency = pay?.currency ?? 'USD'
      let error: string | undefined

      if (pay && pay.amount > 0) {
        const { costUsd: tokenCost } = await sumLlmUsageForStudentCourse(
          enrollment.studentId,
          courseId
        )
        amount = computeScheduleDeletionRefund(
          pay.amount,
          totalSessions,
          completedSessions,
          tokenCost
        )
        currency = pay.currency ?? 'USD'

        if (amount <= 0) {
          status = 'SKIPPED'
        } else if (pay.gateway !== 'AIRWALLEX' && pay.gateway !== 'HITPAY') {
          status = 'FAILED'
          error = `Automated refunds aren't supported for ${pay.gateway}.`
          await drizzleDb.insert(refund).values({
            refundId: nanoid(),
            paymentId: pay.paymentId,
            amount,
            reason: `Schedule "${scheduleId}" of course "${courseName}" was removed. Refund could not be executed automatically: ${error}`,
            status: 'FAILED',
            createdAt: new Date(),
          })
        } else {
          // Airwallex refunds require the payment_attempt_id, not the
          // payment-intent id stored in gatewayPaymentId
          // (see api/payments/refund/route.ts).
          const metadata = pay.metadata as { payment_attempt_id?: string } | null
          const refundReference =
            pay.gateway === 'AIRWALLEX' && metadata?.payment_attempt_id
              ? metadata.payment_attempt_id
              : pay.gatewayPaymentId

          let gatewayResult: {
            refundId: string
            status: string
            amountRefunded?: number
            error?: string
          }
          if (!refundReference) {
            gatewayResult = {
              refundId: '',
              status: 'FAILED',
              error: 'Payment has no gateway reference to refund.',
            }
          } else {
            try {
              gatewayResult = await getPaymentGateway(pay.gateway as GatewayName).refundPayment(
                refundReference,
                amount
              )
            } catch (err) {
              gatewayResult = {
                refundId: '',
                status: 'FAILED',
                error: err instanceof Error ? err.message : 'Gateway error',
              }
            }
          }
          const ok = !gatewayResult.error
          status = ok ? 'COMPLETED' : 'FAILED'
          error = gatewayResult.error

          await drizzleDb.insert(refund).values({
            refundId: nanoid(),
            paymentId: pay.paymentId,
            amount,
            reason: `Schedule "${scheduleId}" of course "${courseName}" was removed. Pro-rata on ${completedSessions}/${totalSessions} sessions taken, minus token cost $${tokenCost.toFixed(2)}.`,
            status: ok ? 'COMPLETED' : 'FAILED',
            gatewayRefundId: gatewayResult.refundId || null,
            processedAt: ok ? new Date() : null,
            createdAt: new Date(),
          })

          if (ok) {
            // Partial refund by design — record refundedAt but keep the
            // payment COMPLETED so the refunded portion stays auditable.
            await drizzleDb
              .update(payment)
              .set({ refundedAt: new Date() })
              .where(eq(payment.paymentId, pay.paymentId))
          }
        }
      }

      await drizzleDb.transaction(async tx => {
        await tx
          .delete(courseProgress)
          .where(
            and(
              eq(courseProgress.studentId, enrollment.studentId),
              eq(courseProgress.courseId, courseId)
            )
          )
        await tx
          .delete(courseEnrollment)
          .where(eq(courseEnrollment.enrollmentId, enrollment.enrollmentId))
        // Release the seat on the (still existing) schedule row; keeps the
        // counter honest if the deletion aborts after this point.
        await tx.execute(
          sql`UPDATE "CourseSchedule"
              SET "enrolledCount" = GREATEST("enrolledCount" - 1, 0)
              WHERE id = ${scheduleId}`
        )
      })
      result.studentsUnenrolled++

      await reconcileProposalsAfterDeparture(enrollment.studentId, courseId).catch(err =>
        console.warn('[schedule-deletion] reconcile proposals failed (non-critical):', err)
      )

      await notify({
        userId: enrollment.studentId,
        type: 'enrollment',
        title: 'A schedule was removed from your course',
        message:
          status === 'COMPLETED'
            ? `The schedule for "${courseName}" was removed by the tutor. You have been unenrolled and a refund of ${currency} ${amount.toFixed(2)} was issued for the remaining sessions.`
            : `The schedule for "${courseName}" was removed by the tutor. You have been unenrolled. Our team will follow up regarding a refund for the remaining sessions.`,
        actionUrl: '/student/courses',
      }).catch(err =>
        console.warn('[schedule-deletion] student notify failed (non-critical):', err)
      )

      result.refunds.push({ studentId: enrollment.studentId, amount, currency, status, error })
    } catch (err) {
      result.refunds.push({
        studentId: enrollment.studentId,
        amount: 0,
        currency: 'USD',
        status: 'FAILED',
        error: err instanceof Error ? err.message : 'Unexpected error',
      })
    }
  }

  // Payments in flight for this schedule can never complete an enrollment now
  // — the schedule row is about to disappear. Cancelling them prevents the
  // webhook from retrying a failing enrollment forever.
  const cancelled = await drizzleDb
    .update(payment)
    .set({ status: 'CANCELLED' })
    .where(
      and(
        sql`${payment.metadata} ->> 'scheduleId' = ${scheduleId}`,
        inArray(payment.status, ['PENDING', 'PROCESSING'])
      )
    )
    .returning({ paymentId: payment.paymentId })
  result.pendingPaymentsCancelled = cancelled.length

  if (tutorId) {
    const failed = result.refunds.filter(r => r.status === 'FAILED').length
    const refunded = result.refunds.filter(r => r.status === 'COMPLETED').length
    await notify({
      userId: tutorId,
      type: 'payment',
      title: 'Schedule removed — students refunded',
      message: `Schedule of "${courseName}" was deleted. ${result.studentsUnenrolled} student(s) unenrolled, ${refunded} refund(s) issued${failed > 0 ? `, ${failed} refund(s) FAILED and need manual follow-up` : ''}.`,
      actionUrl: failed > 0 ? '/tutor/refunds' : `/tutor/courses/${courseId}`,
    }).catch(err => console.warn('[schedule-deletion] tutor notify failed (non-critical):', err))
  }

  return result
}
