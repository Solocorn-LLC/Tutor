/**
 * Automated refund for a cancelled, paid 1-on-1 booking.
 *
 * Policy: a cancellation is refundable at any time, minus a fixed 15% fee (the
 * student receives 85% of what they paid; the platform/tutor keeps 15%). The
 * refund is issued through the SAME gateway the student paid with, recorded in
 * the `refund` table, and flips the `payment` to REFUNDED on success.
 */

import { and, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { drizzleDb } from '@/lib/db/drizzle'
import { payment, refund } from '@/lib/db/schema'
import { getPaymentGateway, type GatewayName } from './factory'

/** Fee retained on any 1-on-1 cancellation refund. */
export const ONE_ON_ONE_CANCELLATION_FEE_RATE = 0.15

export interface RefundOutcome {
  refunded: boolean
  /** Amount returned to the student (paid − 15%). */
  amount?: number
  /** Fee retained (15% of what was paid). */
  fee?: number
  currency?: string
  error?: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Split a paid amount into the 85% refund and the 15% fee. */
export function computeOneOnOneRefund(paidAmount: number): { amount: number; fee: number } {
  const fee = round2(paidAmount * ONE_ON_ONE_CANCELLATION_FEE_RATE)
  return { amount: round2(paidAmount - fee), fee }
}

export async function refundPaidOneOnOne(
  requestId: string,
  reason?: string
): Promise<RefundOutcome> {
  const [pay] = await drizzleDb
    .select()
    .from(payment)
    .where(
      and(eq(payment.status, 'COMPLETED'), sql`${payment.metadata} ->> 'requestId' = ${requestId}`)
    )
    .limit(1)

  if (!pay) return { refunded: false, error: 'No completed payment found for this booking.' }
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
    reason: reason ?? '1-on-1 cancellation (15% fee retained)',
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
