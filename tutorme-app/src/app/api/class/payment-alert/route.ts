/**
 * POST /api/class/payment-alert
 * Secure payment authorization - child cannot join without parent approval/payment.
 * Only students can trigger payment alerts to notify their linked parent.
 * Global compliance: English messages, role-based security, audit logging.
 */

import { getServerSession, authOptions } from '@/lib/auth'
import { handleApiError } from '@/lib/api/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  familyMember,
  course,
  payment,
  courseEnrollment,
  familyNotification,
} from '@/lib/db/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { expandToCourseFamily } from '@/lib/courses/variant-family'
import { logAudit, AUDIT_ACTIONS } from '@/lib/security/audit'
import crypto from 'crypto'

const bodySchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  courseId: z.string().min(1, 'Course ID is required'),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions, request)

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'STUDENT') {
    return NextResponse.json(
      { error: 'Only students can alert parents for course payment' },
      { status: 403 }
    )
  }

  let body: z.infer<typeof bodySchema>
  try {
    const parsed = await request.json()
    body = bodySchema.parse(parsed)
  } catch (err: unknown) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((e: { message: string }) => e.message).join(', ')
        : 'Invalid request body'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const childRelations = ['child', 'children', 'CHILD', 'CHILDREN']
    const [member] = await drizzleDb
      .select()
      .from(familyMember)
      .where(
        and(
          eq(familyMember.userId, session.user.id),
          inArray(familyMember.relation, childRelations)
        )
      )
      .limit(1)

    if (!member) {
      return NextResponse.json(
        { error: 'No parent linkage found. Please link your account to a parent.' },
        { status: 400 }
      )
    }

    const familyId = member.familyAccountId

    const [courseRow] = await drizzleDb
      .select()
      .from(course)
      .where(eq(course.courseId, body.courseId))
      .limit(1)

    if (!courseRow) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const isPaidCourse = (courseRow.price ?? 0) > 0
    const amount = courseRow.price ?? 0
    const currency = courseRow.currency ?? 'SGD'

    if (!isPaidCourse) {
      return NextResponse.json({
        success: true,
        message: 'Course payment confirmed',
        canJoin: true,
      })
    }

    const enrollmentIds = await drizzleDb
      .select({ enrollmentId: courseEnrollment.enrollmentId })
      .from(courseEnrollment)
      .where(
        and(
          inArray(courseEnrollment.courseId, await expandToCourseFamily([body.courseId])),
          eq(courseEnrollment.studentId, session.user.id)
        )
      )

    const completedByEnrollment =
      enrollmentIds.length > 0
        ? await drizzleDb
            .select()
            .from(payment)
            .where(
              and(
                eq(payment.status, 'COMPLETED'),
                inArray(
                  payment.enrollmentId,
                  enrollmentIds.map(e => e.enrollmentId)
                )
              )
            )
        : []
    const completedByMetadata = await drizzleDb
      .select()
      .from(payment)
      .where(
        and(
          eq(payment.status, 'COMPLETED'),
          sql`${payment.metadata}->>'courseId' = ${body.courseId} AND ${payment.metadata}->>'studentId' = ${session.user.id}`
        )
      )

    const isPaid = completedByEnrollment.length > 0 || completedByMetadata.length > 0

    if (isPaid) {
      return NextResponse.json({
        success: true,
        message: 'Course payment confirmed',
        canJoin: true,
      })
    }

    const studentName = session.user.name ?? session.user.email ?? 'Your child'
    const paymentUrl = `/parent/payments?courseId=${encodeURIComponent(body.courseId)}&studentId=${encodeURIComponent(session.user.id)}`

    await drizzleDb.insert(familyNotification).values({
      notificationId: crypto.randomUUID(),
      parentId: familyId,
      title: 'Payment Required for Course',
      message: `${studentName} wants to join a paid course (${courseRow.name}). Please complete payment of ${currency} ${amount.toFixed(2)}. Go to: ${paymentUrl}`,
      isRead: false,
    })

    await logAudit(session.user.id, AUDIT_ACTIONS.PAYMENT_ALERT, {
      resource: 'payment-alert',
      resourceId: body.courseId,
      roomId: body.roomId,
      courseId: body.courseId,
      familyAccountId: familyId,
    })

    return NextResponse.json(
      {
        error: 'Payment required for this course. Parent has been notified.',
        paymentRequired: true,
        parentNotified: true,
      },
      { status: 402 }
    )
  } catch (error) {
    return handleApiError(
      error,
      'Failed to process payment alert',
      'api/class/payment-alert/route.ts'
    )
  }
}
