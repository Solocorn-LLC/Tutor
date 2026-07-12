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
import { HitpayGateway } from '@/lib/payments'
import { sendPaymentConfirmation } from '@/lib/notifications/payment-email'
import { notify } from '@/lib/notifications/notify'
import { getOrCreateConversation } from '@/lib/messaging/conversation'
import { admitPaidSeat } from '@/lib/group-session/seats'
import { eq, and, or, sql } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  try {
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
            and(
              eq(payment.gateway, 'HITPAY'),
              or(...ids.map(id => eq(payment.gatewayPaymentId, id)))
            )
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
            }).catch(() => {})
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
              }).catch(() => {})
            }
            // Notify the tutor that the booking is now paid & confirmed.
            notify({
              userId: requestRow.tutorId,
              type: 'class',
              title: '1-on-1 payment received',
              message: 'The student has paid — the 1-on-1 session is confirmed.',
              data: { requestId: meta.requestId as string, type: 'one-on-one-paid' },
              actionUrl: '/tutor/dashboard',
            }).catch(() => {})
            // Open a direct-message thread so the student and tutor now appear in
            // each other's chat list on the communications page.
            getOrCreateConversation(requestRow.studentId, requestRow.tutorId).catch(() => {})
          }
        } else if (meta?.type === 'group-session' && typeof meta.participantId === 'string') {
          // Confirm the seat: flip it to PAID, admit the student to the shared
          // room, and flip the session to FULL if this was the last seat.
          await admitPaidSeat(meta.participantId as string, paymentRow.paymentId)
          if (typeof meta.tutorId === 'string') {
            notify({
              userId: meta.tutorId as string,
              type: 'class',
              title: 'Group session seat booked',
              message: 'A student paid for a seat in your group session.',
              data: {
                groupSessionId: meta.groupSessionId,
                participantId: meta.participantId,
                type: 'group-seat-paid',
              },
              actionUrl: '/tutor/dashboard',
            }).catch(() => {})
            if (typeof meta.studentId === 'string') {
              getOrCreateConversation(meta.studentId as string, meta.tutorId as string).catch(
                () => {}
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
  } catch (error) {
    return handleApiError(error, 'Webhook failed', 'api/payments/webhooks/hitpay/route.ts')
  }
}
