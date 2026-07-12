/**
 * Automated per-seat refund for a group session.
 *
 * Same policy as a 1-on-1 cancellation: refundable at any time, minus a fixed
 * 15% fee (student gets 85% back). Each seat has its own Payment row (keyed by
 * `metadata.participantId`), so a refund targets exactly that student's seat.
 */

import { and, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { drizzleDb } from '@/lib/db/drizzle'
import { payment, refund } from '@/lib/db/schema'
import { getPaymentGateway, type GatewayName } from './factory'
import { computeOneOnOneRefund, type RefundOutcome } from './refund-one-on-one'

/**
 * Refund a single paid group-session seat by its participant id. Best-effort:
 * returns `{ refunded: false, error }` rather than throwing so a cancellation
 * flow can surface the failure without rolling back the seat release.
 */
export async function refundGroupSeat(
  participantId: string,
  reason?: string
): Promise<RefundOutcome> {
  const [pay] = await drizzleDb
    .select()
    .from(payment)
    .where(
      and(
        eq(payment.status, 'COMPLETED'),
        sql`${payment.metadata} ->> 'participantId' = ${participantId}`
      )
    )
    .limit(1)

  if (!pay) return { refunded: false, error: 'No completed payment found for this seat.' }
  if (!pay.gatewayPaymentId) {
    return { refunded: false, error: 'Payment has no gateway reference to refund.' }
  }
  if (pay.gateway !== 'AIRWALLEX' && pay.gateway !== 'HITPAY') {
    return { refunded: false, error: `Automated refunds aren't supported for ${pay.gateway}.` }
  }

  const { amount, fee } = computeOneOnOneRefund(pay.amount)

  let result: { refundId: string; status: string; amountRefunded?: number; error?: string }
  try {
    result = await getPaymentGateway(pay.gateway as GatewayName).refundPayment(
      pay.gatewayPaymentId,
      amount
    )
  } catch (err) {
    result = {
      refundId: '',
      status: 'FAILED',
      error: err instanceof Error ? err.message : 'Gateway error',
    }
  }
  const ok = !result.error

  await drizzleDb.insert(refund).values({
    refundId: nanoid(),
    paymentId: pay.paymentId,
    amount,
    reason: reason ?? 'Group session seat cancellation (15% fee retained)',
    status: ok ? 'COMPLETED' : 'FAILED',
    gatewayRefundId: result.refundId || null,
    processedAt: ok ? new Date() : null,
  })

  if (ok) {
    await drizzleDb
      .update(payment)
      .set({ status: 'REFUNDED', refundedAt: new Date() })
      .where(eq(payment.paymentId, pay.paymentId))
    return { refunded: true, amount, fee, currency: pay.currency }
  }
  return { refunded: false, amount, fee, currency: pay.currency, error: result.error }
}
