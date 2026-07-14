/**
 * Integration test: series refund is a single, correct refund.
 *
 * A recurring series is paid in ONE transaction (amount = Σ costPerSession) keyed
 * to the head request. Cancelling refunds that one payment once — 85% (a 15% fee
 * retained) — and a second attempt refunds nothing (no over-refund).
 *
 * The payment gateway is mocked; the DB is real. Requires DATABASE_URL (setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { eq, inArray } from 'drizzle-orm'

vi.mock('@/lib/payments/factory', () => ({
  getPaymentGateway: () => ({
    refundPayment: async () => ({ refundId: 'gw-refund-test', status: 'COMPLETED' }),
  }),
}))

import { drizzleDb } from '@/lib/db/drizzle'
import { user, payment, refund } from '@/lib/db/schema'
import { refundPaidOneOnOne, computeOneOnOneRefund } from '@/lib/payments/refund-one-on-one'

const stamp = Date.now()
const tutorId = crypto.randomUUID()
const studentId = crypto.randomUUID()
const userIds = [tutorId, studentId]
const headRequestId = `oo_refund_${stamp}`
const paymentId = `pay_${stamp}`
const SERIES_TOTAL = 135 // 3 × 45

describe('series refund', () => {
  beforeAll(async () => {
    await drizzleDb.insert(user).values([
      {
        userId: tutorId,
        email: `rf-tutor-${stamp}@ex.com`,
        role: 'TUTOR',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        userId: studentId,
        email: `rf-stu-${stamp}@ex.com`,
        role: 'STUDENT',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    // One payment covering the whole series, keyed to the head request.
    await drizzleDb.insert(payment).values({
      paymentId,
      amount: SERIES_TOTAL,
      currency: 'USD',
      status: 'COMPLETED',
      gateway: 'HITPAY',
      tutorId,
      gatewayPaymentId: 'gw_pay_123',
      metadata: { type: 'one-on-one', requestId: headRequestId, seriesId: `series_${stamp}` },
    })
  })

  afterAll(async () => {
    await drizzleDb.delete(refund).where(eq(refund.paymentId, paymentId))
    await drizzleDb.delete(payment).where(eq(payment.paymentId, paymentId))
    await drizzleDb.delete(user).where(inArray(user.userId, userIds))
  })

  it('refunds the whole series once (85%), then nothing on a repeat', async () => {
    const expected = computeOneOnOneRefund(SERIES_TOTAL) // { amount: 114.75, fee: 20.25 }

    const first = await refundPaidOneOnOne(headRequestId, 'Cancelled by student')
    expect(first.refunded).toBe(true)
    expect(first.amount).toBe(expected.amount)
    expect(first.fee).toBe(expected.fee)

    // Exactly one refund row, and the payment is now REFUNDED.
    const refundRows = await drizzleDb.select().from(refund).where(eq(refund.paymentId, paymentId))
    expect(refundRows).toHaveLength(1)
    expect(refundRows[0].amount).toBe(expected.amount)

    const [pay] = await drizzleDb
      .select({ status: payment.status })
      .from(payment)
      .where(eq(payment.paymentId, paymentId))
    expect(pay.status).toBe('REFUNDED')

    // A second cancel finds no COMPLETED payment → no over-refund.
    const second = await refundPaidOneOnOne(headRequestId, 'Cancelled by student')
    expect(second.refunded).toBe(false)
    const stillOne = await drizzleDb.select().from(refund).where(eq(refund.paymentId, paymentId))
    expect(stillOne).toHaveLength(1)
  })
})
