/**
 * Automated refund for a cancelled, paid 1-on-1 booking.
 *
 * Policy: refunds are PRORATED by sessions delivered — the student gets back
 * (undelivered sessions ÷ total sessions) × what they paid. A session counts as
 * delivered once its scheduled start time has passed. There is no cancellation
 * fee, and the policy is the same whether the student or the tutor cancels. The
 * caller computes the refundable fraction and passes it via `options`.
 *
 * The refund is issued through the SAME gateway the student paid with, recorded
 * in the `refund` table, and flips the `payment` to REFUNDED on success.
 */

import { and, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { drizzleDb } from '@/lib/db/drizzle'
import { payment, refund } from '@/lib/db/schema'
import { getPaymentGateway, type GatewayName } from './factory'

export interface RefundOutcome {
  refunded: boolean
  /** Amount returned to the student (paid × refundableFraction). */
  amount?: number
  /** Portion of the payment retained (paid − amount). */
  fee?: number
  currency?: string
  error?: string
}

export interface OneOnOneRefundOptions {
  /**
   * Portion of the payment to return, 0–1. Defaults to 1 (full refund), e.g. for
   * a hold that expired before any session happened.
   */
  refundableFraction?: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Split a paid amount into the refunded portion and the retained remainder. */
export function computeOneOnOneRefund(
  paidAmount: number,
  refundableFraction = 1
): { amount: number; fee: number } {
  const clamped = Math.min(1, Math.max(0, refundableFraction))
  const amount = round2(paidAmount * clamped)
  return { amount, fee: round2(paidAmount - amount) }
}

export async function refundPaidOneOnOne(
  requestId: string,
  reason?: string,
  options: OneOnOneRefundOptions = {}
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

  const { amount, fee } = computeOneOnOneRefund(pay.amount, options.refundableFraction)

  // Airwallex refunds require the payment_attempt_id, not the payment-intent id
  // stored in gatewayPaymentId (see api/payments/refund/route.ts).
  const metadata = pay.metadata as { payment_attempt_id?: string } | null
  const refundReference =
    pay.gateway === 'AIRWALLEX' && metadata?.payment_attempt_id
      ? metadata.payment_attempt_id
      : pay.gatewayPaymentId

  let result: { refundId: string; status: string; amountRefunded?: number; error?: string }
  try {
    result = await getPaymentGateway(pay.gateway as GatewayName).refundPayment(
      refundReference,
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
    reason: reason ?? '1-on-1 cancellation (prorated refund)',
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
