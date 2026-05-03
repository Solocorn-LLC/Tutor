/**
 * POST /api/payments/webhooks/hitpay
 * Hitpay webhook handler.
 * - Verifies Hitpay-Signature (HMAC-SHA256 with salt)
 * - Logs to WebhookEvent table
 * - Updates Payment and booking status
 * - Triggers email (stub)
 */

import { NextRequest, NextResponse } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  webhookEvent,
  payment,
  user,
  profile,
  courseEnrollment,
  course,
  oneOnOneBookingRequest,
} from '@/lib/db/schema'
import { HitpayGateway } from '@/lib/payments'
import {
  sendPaymentConfirmation,
  sendTutorPaymentReceived,
} from '@/lib/notifications/payment-email'
import { eq, and, or, sql } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('hitpay-signature') ?? ''

  const gateway = new HitpayGateway()
  const isValid = gateway.verifyWebhook(rawBody, signature)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const body = payload as { id?: string; status?: string; payment_request_id?: string }
  const gatewayPaymentId = body?.id ?? body?.payment_request_id ?? ''
  const eventId = body?.id

  if (eventId) {
    const [existing] = await drizzleDb
      .select()
      .from(webhookEvent)
      .where(
        and(
          eq(webhookEvent.gateway, 'HITPAY'),
          eq(webhookEvent.processed, true),
          sql`${webhookEvent.payload}->>'id' = ${eventId}`
        )
      )
      .limit(1)
    if (existing) return NextResponse.json({ received: true })
  }

  let paymentIdForEvent: string | null = null
  if (gatewayPaymentId) {
    const [p] = await drizzleDb
      .select()
      .from(payment)
      .where(and(eq(payment.gatewayPaymentId, gatewayPaymentId), eq(payment.gateway, 'HITPAY')))
      .limit(1)
    paymentIdForEvent = p?.paymentId ?? null
  }

  const webhookEventId = crypto.randomUUID()
  await drizzleDb.insert(webhookEvent).values({
    eventId: webhookEventId,
    paymentId: paymentIdForEvent,
    gateway: 'HITPAY',
    eventType: 'payment_request.completed',
    payload: payload as object,
    processed: false,
  })

  const result = await gateway.processWebhook(payload)

  if (result.success && (result.status === 'completed' || result.status === 'succeeded')) {
    const ids = [result.paymentId ?? '', body?.id, body?.payment_request_id].filter(
      Boolean
    ) as string[]
    let paymentRow:
      | {
          paymentId: string
          bookingId: string | null
          metadata: unknown
          amount: number
          currency: string
          tutorId?: string | null
        }
      | undefined
    if (ids.length > 0) {
      ;[paymentRow] = await drizzleDb
        .select()
        .from(payment)
        .where(
          and(eq(payment.gateway, 'HITPAY'), or(...ids.map(id => eq(payment.gatewayPaymentId, id))))
        )
        .limit(1)
    }

    if (paymentRow) {
      await drizzleDb
        .update(payment)
        .set({ status: 'COMPLETED', paidAt: new Date() })
        .where(eq(payment.paymentId, paymentRow.paymentId))

      const meta = paymentRow.metadata as Record<string, unknown> | null
      if (
        !paymentRow.bookingId &&
        meta?.type === 'course' &&
        typeof meta.courseId === 'string' &&
        typeof meta.studentId === 'string'
      ) {
        const { enrollStudentInCourse } = await import('@/lib/enrollment')
        enrollStudentInCourse(
          meta.studentId as string,
          meta.courseId as string,
          meta.startDate as string | undefined
        )
          .then(async () => {
            const [enrollment] = await drizzleDb
              .select({
                enrollmentId: courseEnrollment.enrollmentId,
                creatorId: course.creatorId,
              })
              .from(courseEnrollment)
              .innerJoin(course, eq(course.courseId, courseEnrollment.courseId))
              .where(
                and(
                  eq(courseEnrollment.studentId, meta.studentId as string),
                  eq(courseEnrollment.courseId, meta.courseId as string)
                )
              )
              .limit(1)
            if (enrollment) {
              await drizzleDb
                .update(payment)
                .set({
                  enrollmentId: enrollment.enrollmentId,
                  tutorId: enrollment.creatorId ?? paymentRow.tutorId,
                })
                .where(eq(payment.paymentId, paymentRow.paymentId))
            }
          })
          .catch(err => console.error('[Hitpay Webhook] Enrollment failed:', err))
        const [userRow] = await drizzleDb
          .select({
            email: user.email,
            name: profile.name,
          })
          .from(user)
          .leftJoin(profile, eq(profile.userId, user.userId))
          .where(eq(user.userId, meta.studentId as string))
          .limit(1)
        const description = 'Course enrollment'
        if (userRow?.email) {
          sendPaymentConfirmation({
            paymentId: paymentRow.paymentId,
            studentEmail: userRow.email,
            studentName: userRow.name ?? undefined,
            amount: paymentRow.amount,
            currency: paymentRow.currency,
            description,
          }).catch(err => console.error('[Hitpay Webhook] Failed to send confirmation email:', err))
        }
      } else if (meta?.type === 'one-on-one' && typeof meta.requestId === 'string') {
        await drizzleDb
          .update(oneOnOneBookingRequest)
          .set({ status: 'PAID', paidAt: new Date() })
          .where(eq(oneOnOneBookingRequest.requestId, meta.requestId as string))

        const [requestRow] = await drizzleDb
          .select({
            studentId: oneOnOneBookingRequest.studentId,
            tutorId: oneOnOneBookingRequest.tutorId,
          })
          .from(oneOnOneBookingRequest)
          .where(eq(oneOnOneBookingRequest.requestId, meta.requestId as string))
          .limit(1)

        if (requestRow) {
          const [userRow] = await drizzleDb
            .select({ email: user.email, name: profile.name })
            .from(user)
            .leftJoin(profile, eq(profile.userId, user.userId))
            .where(eq(user.userId, requestRow.studentId))
            .limit(1)
          if (userRow?.email) {
            sendPaymentConfirmation({
              paymentId: paymentRow.paymentId,
              studentEmail: userRow.email,
              studentName: userRow.name ?? undefined,
              amount: paymentRow.amount,
              currency: paymentRow.currency,
              description: '1-on-1 tutoring session',
            }).catch(err =>
              console.error('[Hitpay Webhook] Failed to send confirmation email:', err)
            )
          }
        }
      } else if (paymentRow.bookingId) {
        // Clinics removed: no booking notifications.
      }
    }
  }

  await drizzleDb
    .update(webhookEvent)
    .set({ processed: true, processedAt: new Date() })
    .where(eq(webhookEvent.eventId, webhookEventId))

  return NextResponse.json({ received: true })
}
