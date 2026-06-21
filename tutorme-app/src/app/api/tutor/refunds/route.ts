/**
 * GET /api/tutor/refunds?status=PENDING&courseId=...
 *
 * Lists refunds for the logged-in tutor's course payments (default: PENDING),
 * so they can review and approve them. Created e.g. when a student unregisters
 * from a paid course.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { refund, payment, course, type RefundStatus } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

const VALID_STATUSES: RefundStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']

export const GET = withAuth(
  async (req: NextRequest, session) => {
    const url = new URL(req.url)
    const statusParam = url.searchParams.get('status')
    const courseId = url.searchParams.get('courseId')
    const status: RefundStatus =
      statusParam && (VALID_STATUSES as string[]).includes(statusParam)
        ? (statusParam as RefundStatus)
        : 'PENDING'

    const filters = [eq(payment.tutorId, session.user.id), eq(refund.status, status)]
    if (courseId) filters.push(eq(payment.courseId, courseId))

    const rows = await drizzleDb
      .select({
        refundId: refund.refundId,
        amount: refund.amount,
        reason: refund.reason,
        status: refund.status,
        createdAt: refund.createdAt,
        paymentId: payment.paymentId,
        currency: payment.currency,
        paymentAmount: payment.amount,
        courseId: payment.courseId,
        courseName: course.name,
      })
      .from(refund)
      .innerJoin(payment, eq(payment.paymentId, refund.paymentId))
      .leftJoin(course, eq(course.courseId, payment.courseId))
      .where(and(...filters))
      .orderBy(desc(refund.createdAt))
      .limit(100)

    return NextResponse.json({ refunds: rows })
  },
  { role: 'TUTOR' }
)
