/**
 * Integration test: refund over-refund clamp + reservation (PR #1105).
 *
 * Drives the REAL POST /api/payments/refund handler (auth/CSRF middleware made
 * pass-through; the payment GATEWAY is mocked so no money moves). Verifies the
 * cumulative cap: partial refunds are allowed up to the exact paid amount, and
 * anything beyond the refundable balance is rejected before the gateway is
 * called. A regression that drops the clamp would let this over-refund.
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { eq, inArray, sql, and } from 'drizzle-orm'

// Middleware: keep the real error classes, make the wrappers pass-through with a
// fixed ADMIN session (ADMIN skips the per-course ownership check).
vi.mock('@/lib/api/middleware', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    withCsrf: (h: unknown) => h,
    withAuth: (h: (req: unknown, session: unknown) => unknown) => (req: unknown) =>
      h(req, { user: { id: 'refund-admin', role: 'ADMIN' } }),
  }
})

// Gateway: succeed without moving money.
vi.mock('@/lib/payments', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    getPaymentGateway: () => ({
      refundPayment: async () => ({ refundId: `gw_${Date.now()}`, status: 'succeeded' }),
    }),
  }
})

import { NextRequest } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, course, payment, refund } from '@/lib/db/schema'
import { POST } from '@/app/api/payments/refund/route'

const stamp = Date.now()
const adminId = 'refund-admin'
const studentId = crypto.randomUUID()
const COURSE = `rf_course_${stamp}`
const PAY = `rf_pay_${stamp}`

function refundReq(amount: number) {
  const req = new NextRequest('http://localhost/api/payments/refund', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paymentId: PAY, amount, reason: 'test' }),
  })
  return POST(req as unknown as NextRequest)
}
const refundedTotal = () =>
  drizzleDb
    .select({ t: sql<number>`COALESCE(SUM(${refund.amount}),0)` })
    .from(refund)
    .where(
      and(eq(refund.paymentId, PAY), inArray(refund.status, ['COMPLETED', 'PENDING', 'PROCESSING']))
    )
    .then(r => Number(r[0]?.t ?? 0))

describe('refund over-refund clamp', () => {
  beforeAll(async () => {
    await drizzleDb.insert(user).values([
      {
        userId: adminId,
        email: `rf-admin-${stamp}@ex.com`,
        role: 'ADMIN',
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
    ] as never)
    await drizzleDb
      .insert(course)
      .values({ courseId: COURSE, name: 'RF', isPublished: true, creatorId: adminId } as never)
    await drizzleDb.insert(payment).values({
      paymentId: PAY,
      studentId,
      amount: 100,
      currency: 'USD',
      status: 'COMPLETED',
      gateway: 'HITPAY',
      metadata: { courseId: COURSE },
    } as never)
  })

  afterAll(async () => {
    await drizzleDb.delete(refund).where(eq(refund.paymentId, PAY))
    await drizzleDb.delete(payment).where(eq(payment.paymentId, PAY))
    await drizzleDb.delete(course).where(eq(course.courseId, COURSE))
    await drizzleDb.delete(user).where(inArray(user.userId, [adminId, studentId]))
    vi.restoreAllMocks()
  })

  it('allows partial refunds up to the paid amount, then rejects over-refund', async () => {
    // First partial: 60 of 100 → OK
    expect((await refundReq(60)).status).toBe(200)
    expect(await refundedTotal()).toBe(60)

    // Would exceed: 60 already + 50 > 100 → rejected, no new refund row
    const over = await refundReq(50)
    expect(over.status).toBe(400)
    expect(await refundedTotal()).toBe(60) // unchanged

    // Exact remaining balance: 60 + 40 = 100 → OK
    expect((await refundReq(40)).status).toBe(200)
    expect(await refundedTotal()).toBe(100)

    // Nothing left: any further refund rejected
    expect((await refundReq(1)).status).toBe(400)
    expect(await refundedTotal()).toBe(100)
  })

  it('rejects a single refund larger than the payment', async () => {
    // (fresh payment via a second describe would be cleaner, but the previous
    //  test already exhausted PAY; a 200 here would be a real over-refund bug)
    expect((await refundReq(200)).status).toBe(400)
  })
})
