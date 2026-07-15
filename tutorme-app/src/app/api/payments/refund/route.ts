/**
 * POST /api/payments/refund
 * Admin or Tutor can initiate refunds.
 * - Calls gateway refund API
 * - Creates Refund record and updates Payment
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  withAuth,
  withCsrf,
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { payment, refund, course } from '@/lib/db/schema'
import { getPaymentGateway, type GatewayName } from '@/lib/payments'
import { and, eq, inArray, sql } from 'drizzle-orm'

export const POST = withCsrf(
  withAuth(async (req: NextRequest, session) => {
    const role = session.user.role
    if (role !== 'TUTOR' && role !== 'ADMIN') {
      throw new ForbiddenError('Only tutors or admins can initiate refunds')
    }

    const body = await req.json()
    const { paymentId, amount, reason } = body

    if (!paymentId) {
      throw new ValidationError('paymentId is required')
    }

    const [paymentRow] = await drizzleDb
      .select()
      .from(payment)
      .where(eq(payment.paymentId, paymentId))
      .limit(1)

    if (!paymentRow) {
      throw new NotFoundError('Payment not found')
    }

    if (paymentRow.status === 'REFUNDED') {
      throw new ValidationError('Payment is already refunded')
    }

    const isBookingPayment = paymentRow.bookingId != null
    if (isBookingPayment) {
      return NextResponse.json(
        { error: 'Clinic bookings have been removed from the platform.', legacy: true },
        { status: 410 }
      )
    } else {
      const meta = paymentRow.metadata as { courseId?: string } | null
      const courseId = meta?.courseId
      if (!courseId || typeof courseId !== 'string') {
        throw new ForbiddenError('Course payment could not be resolved')
      }
      const [courseRow] = await drizzleDb
        .select({ creatorId: course.creatorId })
        .from(course)
        .where(eq(course.courseId, courseId))
        .limit(1)
      if (!courseRow) {
        throw new NotFoundError('Course not found')
      }
      const isCreatorOfCourse = courseRow.creatorId === session.user.id
      if (role === 'TUTOR' && !isCreatorOfCourse) {
        throw new ForbiddenError('You can only refund payments for your own courses')
      }
    }

    const gateway = getPaymentGateway(paymentRow.gateway as GatewayName)
    const refundAmount = amount != null && amount > 0 ? amount : paymentRow.amount

    // Reserve the refund under a payment-row lock BEFORE moving money. This does
    // three things atomically: caps the total (requested + everything already
    // refunded, including in-flight PROCESSING, must not exceed the payment);
    // blocks two concurrent refunds from both passing the cap; and records the
    // intent so a crash right after the gateway moves money can't leave money
    // moved with no local record. The row starts PROCESSING and is settled
    // (COMPLETED/PENDING/FAILED) after the gateway responds.
    const refundId = crypto.randomUUID()
    const reservation = await drizzleDb.transaction(async tx => {
      await tx.execute(sql`SELECT 1 FROM "Payment" WHERE id = ${paymentRow.paymentId} FOR UPDATE`)
      const [prior] = await tx
        .select({ total: sql<number>`COALESCE(SUM(${refund.amount}), 0)` })
        .from(refund)
        .where(
          and(
            eq(refund.paymentId, paymentRow.paymentId),
            inArray(refund.status, ['COMPLETED', 'PENDING', 'PROCESSING'])
          )
        )
      const already = Number(prior?.total ?? 0)
      if (refundAmount <= 0 || already + refundAmount > paymentRow.amount + 0.001) {
        return { over: true as const, already }
      }
      await tx.insert(refund).values({
        refundId,
        paymentId: paymentRow.paymentId,
        amount: refundAmount,
        reason: reason ?? 'customer_requested',
        status: 'PROCESSING',
      })
      return { over: false as const, already }
    })
    if (reservation.over) {
      const refundable = Math.max(0, paymentRow.amount - reservation.already)
      return NextResponse.json(
        {
          error: `Refund amount exceeds the refundable balance. Paid ${paymentRow.amount}, already refunded ${reservation.already}, refundable ${refundable}.`,
        },
        { status: 400 }
      )
    }

    // Airwallex requires payment_attempt_id for refunds; we store it in metadata on payment_intent.succeeded
    const metadata = paymentRow.metadata as { payment_attempt_id?: string } | null
    const refundPaymentId =
      paymentRow.gateway === 'AIRWALLEX' && metadata?.payment_attempt_id
        ? metadata.payment_attempt_id
        : (paymentRow.gatewayPaymentId ?? paymentRow.paymentId)
    const refundResponse = await gateway.refundPayment(refundPaymentId, refundAmount)

    if (refundResponse.error) {
      // The money didn't move — mark the reserved intent FAILED so it doesn't
      // linger as PROCESSING and the reserved balance is freed.
      await drizzleDb.update(refund).set({ status: 'FAILED' }).where(eq(refund.refundId, refundId))
      return NextResponse.json(
        { error: refundResponse.error, status: refundResponse.status },
        { status: 400 }
      )
    }

    const settled = refundResponse.status === 'succeeded' || refundResponse.status === 'RECEIVED'
    const refundStatus = settled ? 'COMPLETED' : 'PENDING'
    // Settle the row reserved above (it was inserted PROCESSING before the gateway call).
    await drizzleDb
      .update(refund)
      .set({
        status: refundStatus,
        gatewayRefundId: refundResponse.refundId,
        processedAt: settled ? new Date() : null,
      })
      .where(eq(refund.refundId, refundId))

    const fullRefund = refundAmount >= paymentRow.amount
    await drizzleDb
      .update(payment)
      .set({
        status: fullRefund ? 'REFUNDED' : paymentRow.status,
        refundedAt: fullRefund ? new Date() : paymentRow.refundedAt,
      })
      .where(eq(payment.paymentId, paymentRow.paymentId))

    return NextResponse.json({
      success: true,
      refundId,
      status: refundStatus,
      amountRefunded: refundResponse.amountRefunded ?? refundAmount,
    })
  })
)
