/**
 * POST /api/tutor/refunds/[refundId]/decline
 *
 * Declines an existing PENDING refund — marks it FAILED with no gateway/money
 * movement. Verifies the tutor owns the course behind the payment.
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
        .select({
          paymentId: payment.paymentId,
          tutorId: payment.tutorId,
          courseId: payment.courseId,
          metadata: payment.metadata,
        })
        .from(payment)
        .where(eq(payment.paymentId, refundRow.paymentId))
        .limit(1)
      if (!paymentRow) throw new NotFoundError('Payment not found')

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
          throw new ForbiddenError('You can only manage refunds for your own courses')
        }
      }

      await drizzleDb
        .update(refund)
        .set({ status: 'FAILED', processedAt: new Date() })
        .where(and(eq(refund.refundId, refundId), eq(refund.status, 'PENDING')))

      return NextResponse.json({ success: true, refundId, status: 'FAILED' })
    },
    { role: 'TUTOR' }
  )
)
