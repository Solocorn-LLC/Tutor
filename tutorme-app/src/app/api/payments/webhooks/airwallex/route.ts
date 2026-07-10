/**
 * POST /api/payments/webhooks/airwallex
 * Airwallex webhook handler.
 * - Verifies x-signature (HMAC-SHA256 of x-timestamp + raw body)
 * - Logs to WebhookEvent table
 * - Updates Payment and booking status
 * - Triggers email (stub)
 */

import { NextRequest, NextResponse } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import { handleApiError } from '@/lib/api/middleware'
import {
  webhookEvent,
  payment,
  user,
  profile,
  courseEnrollment,
  course,
  oneOnOneBookingRequest,
} from '@/lib/db/schema'
import { AirwallexGateway } from '@/lib/payments'
import { sendPaymentConfirmation } from '@/lib/notifications/payment-email'
import { notify } from '@/lib/notifications/notify'
import { eq, and, sql } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const timestamp = req.headers.get('x-timestamp') ?? ''
    const signature = req.headers.get('x-signature') ?? ''

    const gateway = new AirwallexGateway()
    const isValid = gateway.verifyWebhook({ rawBody, timestamp }, signature)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    let payload: unknown
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const body = payload as {
      id?: string
      name?: string
      data?: { id?: string; status?: string; payment_attempt_id?: string }
    }
    const eventName = body?.name ?? 'unknown'
    const gatewayPaymentId = body?.data?.id
    const paymentAttemptId = body?.data?.payment_attempt_id
    const eventId = body?.id

    if (eventId) {
      const [existing] = await drizzleDb
        .select()
        .from(webhookEvent)
        .where(
          and(
            eq(webhookEvent.gateway, 'AIRWALLEX'),
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
        .where(
          and(eq(payment.gatewayPaymentId, gatewayPaymentId), eq(payment.gateway, 'AIRWALLEX'))
        )
        .limit(1)
      paymentIdForEvent = p?.paymentId ?? null
    }

    const webhookEventId = crypto.randomUUID()
    await drizzleDb.insert(webhookEvent).values({
      eventId: webhookEventId,
      paymentId: paymentIdForEvent,
      gateway: 'AIRWALLEX',
      eventType: eventName,
      payload: payload as object,
      processed: false,
    })

    const result = await gateway.processWebhook(payload)

    if (result.success && result.paymentId && result.status === 'succeeded') {
      const [paymentRow] = await drizzleDb
        .select()
        .from(payment)
        .where(
          and(eq(payment.gatewayPaymentId, result.paymentId), eq(payment.gateway, 'AIRWALLEX'))
        )
        .limit(1)
      if (paymentRow) {
        const existingMeta = (paymentRow.metadata as Record<string, unknown>) || {}
        const metadata = paymentAttemptId
          ? { ...existingMeta, payment_attempt_id: paymentAttemptId }
          : existingMeta
        await drizzleDb
          .update(payment)
          .set({
            status: 'COMPLETED',
            paidAt: new Date(),
            ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
          })
          .where(eq(payment.paymentId, paymentRow.paymentId))
        const meta = paymentRow.metadata as Record<string, unknown> | null
        if (
          !paymentRow.bookingId &&
          meta?.type === 'course' &&
          typeof meta.courseId === 'string' &&
          typeof meta.studentId === 'string'
        ) {
          // Use the canonical enrollment path (transactional, dedup, schedule-capacity).
          // paymentConfirmed=true because we only reach here on a completed payment.
          const { enrollStudentInCourse } = await import('@/lib/api/enrollments')
          await enrollStudentInCourse(
            meta.studentId as string,
            meta.courseId as string,
            (meta.startDate as string | undefined) ?? null,
            (meta.scheduleId as string | undefined) ?? null,
            true
          )
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
            }).catch(err =>
              console.error('[Airwallex Webhook] Failed to send confirmation email:', err)
            )
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
            // Notify the tutor that the booking is now paid & confirmed.
            notify({
              userId: requestRow.tutorId,
              type: 'class',
              title: '1-on-1 payment received',
              message: 'The student has paid — the 1-on-1 session is confirmed.',
              data: { requestId: meta.requestId as string, type: 'one-on-one-paid' },
              actionUrl: '/tutor/dashboard',
            }).catch(() => {})
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
                console.error('[Airwallex Webhook] Failed to send confirmation email:', err)
              )
            }
          }
        } else if (paymentRow.bookingId) {
          // Clinics removed: no booking notifications.
        }
      }
    }

    if (
      result.success &&
      (result.status === 'cancelled' || result.eventType?.includes('cancelled'))
    ) {
      const [paymentRow] = await drizzleDb
        .select()
        .from(payment)
        .where(
          and(
            eq(payment.gatewayPaymentId, result.paymentId ?? ''),
            eq(payment.gateway, 'AIRWALLEX')
          )
        )
        .limit(1)
      if (paymentRow) {
        await drizzleDb
          .update(payment)
          .set({ status: 'CANCELLED' })
          .where(eq(payment.paymentId, paymentRow.paymentId))
      }
    }

    await drizzleDb
      .update(webhookEvent)
      .set({ processed: true, processedAt: new Date() })
      .where(eq(webhookEvent.eventId, webhookEventId))

    return NextResponse.json({ received: true })
  } catch (error) {
    return handleApiError(error, 'Webhook failed', 'api/payments/webhooks/airwallex/route.ts')
  }
}
