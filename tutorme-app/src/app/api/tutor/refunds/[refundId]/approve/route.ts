/**
 * POST /api/tutor/refunds/[refundId]/approve
 *
 * Approves and processes an EXISTING pending refund row (e.g. created when a
 * student unregistered). Verifies the tutor owns the course, calls the payment
 * gateway, then UPDATES the existing refund row (and the payment) — unlike
 * /api/payments/refund which CREATES a new refund from a paymentId.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import {
  withAuth,
  withCsrf,
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { refund, payment, course } from '@/lib/db/schema'
import { getPaymentGateway, type GatewayName } from '@/lib/payments'

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const role = session.user.role
      const refundId = await getParamAsync(context.params, 'refundId')
      if (!refundId) throw new ValidationError('refundId is required')

      const [refundRow] = await drizzleDb
        .select()
        .from(refund)
        .where(eq(refund.refundId, refundId))
        .limit(1)
      if (!refundRow) throw new NotFoundError('Refund not found')
      if (refundRow.status !== 'PENDING') {
        throw new ValidationError(`Refund is already ${refundRow.status.toLowerCase()}`)
      }

      const [paymentRow] = await drizzleDb
        .select()
        .from(payment)
        .where(eq(payment.paymentId, refundRow.paymentId))
        .limit(1)
      if (!paymentRow) throw new NotFoundError('Payment not found')

      // Authorize: tutor must own the course behind this payment (admins exempt).
      if (role !== 'ADMIN') {
        let owns = paymentRow.tutorId === session.user.id
        if (!owns) {
          const meta = paymentRow.metadata as { courseId?: string } | null
          const courseId = paymentRow.courseId ?? meta?.courseId
          if (courseId) {
            const [courseRow] = await drizzleDb
              .select({ creatorId: course.creatorId })
              .from(course)
              .where(eq(course.courseId, courseId))
              .limit(1)
            owns = courseRow?.creatorId === session.user.id
          }
        }
        if (!owns) {
          throw new ForbiddenError('You can only approve refunds for your own courses')
        }
      }

      // Process via the gateway (same resolution as /api/payments/refund).
      const gateway = getPaymentGateway(paymentRow.gateway as GatewayName)
      const meta = paymentRow.metadata as { payment_attempt_id?: string } | null
      const refundPaymentId =
        paymentRow.gateway === 'AIRWALLEX' && meta?.payment_attempt_id
          ? meta.payment_attempt_id
          : (paymentRow.gatewayPaymentId ?? paymentRow.paymentId)

      let gatewayResp
      try {
        gatewayResp = await gateway.refundPayment(refundPaymentId, refundRow.amount)
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Gateway refund failed' },
          { status: 502 }
        )
      }
      if (gatewayResp.error) {
        return NextResponse.json(
          { error: gatewayResp.error, status: gatewayResp.status },
          { status: 400 }
        )
      }

      const succeeded = gatewayResp.status === 'succeeded' || gatewayResp.status === 'RECEIVED'
      const newStatus = succeeded ? 'COMPLETED' : 'PROCESSING'

      // UPDATE the existing refund row (do not create a duplicate).
      await drizzleDb
        .update(refund)
        .set({
          status: newStatus,
          gatewayRefundId: gatewayResp.refundId,
          processedAt: succeeded ? new Date() : null,
        })
        .where(and(eq(refund.refundId, refundId), eq(refund.status, 'PENDING')))

      const fullRefund = refundRow.amount >= paymentRow.amount
      if (fullRefund && succeeded) {
        await drizzleDb
          .update(payment)
          .set({ status: 'REFUNDED', refundedAt: new Date() })
          .where(eq(payment.paymentId, paymentRow.paymentId))
      }

      return NextResponse.json({
        success: true,
        refundId,
        status: newStatus,
        amountRefunded: gatewayResp.amountRefunded ?? refundRow.amount,
      })
    },
    { role: 'TUTOR' }
  )
)
