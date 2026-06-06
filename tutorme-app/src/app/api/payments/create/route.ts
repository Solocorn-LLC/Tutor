/**
 * POST /api/payments/create
 * Creates a payment and returns checkout URL.
 * - Course: body.courseId — for course purchase (amount from course.price).
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  withAuth,
  withCsrf,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  withRateLimitPreset,
} from '@/lib/api/middleware'
import { getFamilyAccountForParent } from '@/lib/api/parent-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  course,
  courseProgress,
  user,
  profile,
  payment,
  oneOnOneBookingRequest,
} from '@/lib/db/schema'
import { getPaymentGateway, type GatewayName } from '@/lib/payments'
import { eq, and, sql } from 'drizzle-orm'
import { z } from 'zod'
import { createHash } from 'crypto'

function makeIdempotencyKey(parts: string[]): string {
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000))
  return createHash('sha256').update([...parts, String(bucket)].join(':')).digest('hex')
}

const createPaymentSchema = z
  .strictObject({
    bookingId: z.string().optional(),
    courseId: z.string().optional(),
    oneOnOneRequestId: z.string().optional(),
    studentId: z.string().optional(),
    gateway: z.enum(['HITPAY', 'AIRWALLEX']).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(data => data.bookingId || data.courseId || data.oneOnOneRequestId, {
    message: 'bookingId, courseId, or oneOnOneRequestId is required',
  })

export const POST = withCsrf(
  withAuth(async (req: NextRequest, session) => {
    const { response: rateLimitResponse } = await withRateLimitPreset(req, 'paymentCreate')
    if (rateLimitResponse) return rateLimitResponse

    let body: unknown
    try {
      body = await req.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parseResult = createPaymentSchema.safeParse(body)
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.issues.map(i => i.message).join(', '))
    }

    const {
      bookingId,
      courseId,
      oneOnOneRequestId,
      studentId,
      gateway: requestedGateway,
      metadata: customMetadata,
    } = parseResult.data

    let payerStudentId = session.user.id
    const userRole = (session.user.role || '').toUpperCase()

    if (userRole === 'PARENT') {
      if (!studentId || typeof studentId !== 'string') {
        throw new ValidationError('studentId is required when parent creates payment')
      }
      const family = await getFamilyAccountForParent(session)
      if (!family || !family.studentIds.includes(studentId)) {
        throw new ForbiddenError('You can only create payments for your linked children')
      }
      payerStudentId = studentId
    } else if (userRole === 'ADMIN') {
      if (studentId && typeof studentId === 'string') {
        payerStudentId = studentId
      }
    } else if (userRole !== 'STUDENT') {
      throw new ForbiddenError('Only students, parents, or admins can create payments')
    }

    // --- Course payment ---
    if (courseId) {
      const [courseRow] = await drizzleDb
        .select()
        .from(course)
        .where(and(eq(course.courseId, courseId), eq(course.isPublished, true)))
        .limit(1)
      if (!courseRow) throw new NotFoundError('Course not found')
      const amount = courseRow.price != null ? Number(courseRow.price) : 0
      if (amount <= 0) throw new ValidationError('This course is free; use Enroll instead')

      const [existingEnrollment] = await drizzleDb
        .select()
        .from(courseProgress)
        .where(
          and(eq(courseProgress.studentId, payerStudentId), eq(courseProgress.courseId, courseId))
        )
        .limit(1)
      if (existingEnrollment) {
        throw new ValidationError('You are already enrolled in this course')
      }

      const [userRow] = await drizzleDb
        .select({
          email: user.email,
          paymentGatewayPreference: profile.paymentGatewayPreference,
        })
        .from(user)
        .leftJoin(profile, eq(profile.userId, user.userId))
        .where(eq(user.userId, payerStudentId))
        .limit(1)
      const studentEmail = userRow?.email ?? ''
      const currency = (courseRow.currency as string) || 'SGD'

      // Determine gateway: frontend preference > user profile > environment default
      let gatewayName: GatewayName
      if (requestedGateway && (requestedGateway === 'HITPAY' || requestedGateway === 'AIRWALLEX')) {
        gatewayName = requestedGateway
      } else if (userRow?.paymentGatewayPreference) {
        gatewayName = userRow.paymentGatewayPreference as GatewayName
      } else {
        gatewayName = (process.env.PAYMENT_DEFAULT_GATEWAY || 'HITPAY') as GatewayName
      }

      const gateway = getPaymentGateway(gatewayName)

      const courseIdempotencyKey = makeIdempotencyKey([payerStudentId, 'course', courseId])
      const [existingPayment] = await drizzleDb
        .select()
        .from(payment)
        .where(
          and(
            eq(payment.status, 'PENDING'),
            sql`${payment.metadata}->>'idempotencyKey' = ${courseIdempotencyKey}`
          )
        )
        .limit(1)
      if (existingPayment?.gatewayCheckoutUrl) {
        return NextResponse.json({
          checkoutUrl: existingPayment.gatewayCheckoutUrl,
          paymentId: existingPayment.paymentId,
        })
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || ''
      const paymentResponse = await gateway.createPayment({
        amount,
        currency,
        courseId: courseId,
        studentEmail,
        description: `${courseRow.name} (${courseRow.categories?.[0] ?? 'Course'})`,
        metadata: {
          type: 'course',
          courseId,
          studentId: payerStudentId,
          payerId: session.user.id,
          payerRole: session.user.role,
          startDate: customMetadata?.startDate,
        },
        successUrl: `${baseUrl}/payment/success?type=course&courseId=${encodeURIComponent(courseId)}`,
        cancelUrl: `${baseUrl}/payment/cancel?type=course&courseId=${encodeURIComponent(courseId)}`,
      })

      const paymentId = crypto.randomUUID()
      await drizzleDb.transaction(async tx => {
        await tx.insert(payment).values({
          paymentId,
          bookingId: null,
          amount,
          currency,
          status: 'PENDING',
          gateway: gatewayName,
          tutorId: courseRow.creatorId ?? null,
          gatewayPaymentId: paymentResponse.paymentId,
          gatewayCheckoutUrl: paymentResponse.checkoutUrl,
          metadata: {
            type: 'course',
            courseId,
            studentId: payerStudentId,
            payerId: session.user.id,
            payerRole: session.user.role,
            startDate: customMetadata?.startDate,
            idempotencyKey: courseIdempotencyKey,
          },
        })
      })

      return NextResponse.json({
        checkoutUrl: paymentResponse.checkoutUrl,
        paymentId,
      })
    }

    // --- One-on-one payment ---
    if (oneOnOneRequestId) {
      const [requestRow] = await drizzleDb
        .select({
          request: oneOnOneBookingRequest,
          tutorCurrency: profile.currency,
          tutorPaymentGateway: profile.paymentGatewayPreference,
        })
        .from(oneOnOneBookingRequest)
        .innerJoin(user, eq(user.userId, oneOnOneBookingRequest.tutorId))
        .leftJoin(profile, eq(profile.userId, oneOnOneBookingRequest.tutorId))
        .where(eq(oneOnOneBookingRequest.requestId, oneOnOneRequestId))
        .limit(1)

      if (!requestRow) {
        throw new NotFoundError('One-on-one request not found')
      }

      if (requestRow.request.studentId !== payerStudentId) {
        throw new ForbiddenError('You can only pay for your own request')
      }

      if (requestRow.request.status !== 'ACCEPTED') {
        throw new ValidationError('This request is not accepted yet')
      }

      if (requestRow.request.paidAt) {
        throw new ValidationError('This request has already been paid')
      }

      const amount = Number(requestRow.request.costPerSession || 0)
      if (amount <= 0) {
        throw new ValidationError('Invalid payment amount')
      }

      const currency = requestRow.tutorCurrency || 'USD'

      const [payerUser] = await drizzleDb
        .select({
          email: user.email,
          paymentGatewayPreference: profile.paymentGatewayPreference,
        })
        .from(user)
        .leftJoin(profile, eq(profile.userId, user.userId))
        .where(eq(user.userId, payerStudentId))
        .limit(1)
      const studentEmail = payerUser?.email ?? ''

      let gatewayName: GatewayName
      if (requestedGateway && (requestedGateway === 'HITPAY' || requestedGateway === 'AIRWALLEX')) {
        gatewayName = requestedGateway
      } else if (payerUser?.paymentGatewayPreference) {
        gatewayName = payerUser.paymentGatewayPreference as GatewayName
      } else {
        gatewayName = (process.env.PAYMENT_DEFAULT_GATEWAY || 'HITPAY') as GatewayName
      }

      const gateway = getPaymentGateway(gatewayName)

      const oo1IdempotencyKey = createHash('sha256')
        .update(`${payerStudentId}:one-on-one:${oneOnOneRequestId}`)
        .digest('hex')
      const [existingOo1Payment] = await drizzleDb
        .select()
        .from(payment)
        .where(
          and(
            eq(payment.status, 'PENDING'),
            sql`${payment.metadata}->>'idempotencyKey' = ${oo1IdempotencyKey}`
          )
        )
        .limit(1)
      if (existingOo1Payment?.gatewayCheckoutUrl) {
        return NextResponse.json({
          checkoutUrl: existingOo1Payment.gatewayCheckoutUrl,
          paymentId: existingOo1Payment.paymentId,
        })
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || ''
      const paymentResponse = await gateway.createPayment({
        amount,
        currency,
        courseId: undefined,
        studentEmail,
        description: '1-on-1 tutoring session',
        metadata: {
          type: 'one-on-one',
          requestId: oneOnOneRequestId,
          tutorId: requestRow.request.tutorId,
          studentId: payerStudentId,
          payerId: session.user.id,
          payerRole: session.user.role,
        },
        successUrl: `${baseUrl}/payment/success?type=one-on-one&requestId=${encodeURIComponent(
          oneOnOneRequestId
        )}`,
        cancelUrl: `${baseUrl}/payment/cancel?type=one-on-one&requestId=${encodeURIComponent(
          oneOnOneRequestId
        )}`,
      })

      const paymentId = crypto.randomUUID()
      await drizzleDb.transaction(async tx => {
        await tx.insert(payment).values({
          paymentId,
          bookingId: null,
          amount,
          currency,
          status: 'PENDING',
          gateway: gatewayName,
          tutorId: requestRow.request.tutorId,
          gatewayPaymentId: paymentResponse.paymentId,
          gatewayCheckoutUrl: paymentResponse.checkoutUrl,
          metadata: {
            type: 'one-on-one',
            requestId: oneOnOneRequestId,
            tutorId: requestRow.request.tutorId,
            studentId: payerStudentId,
            payerId: session.user.id,
            payerRole: session.user.role,
            idempotencyKey: oo1IdempotencyKey,
          },
        })
      })

      return NextResponse.json({
        checkoutUrl: paymentResponse.checkoutUrl,
        paymentId,
      })
    }

    // --- Booking payment ---
    if (bookingId) {
      return NextResponse.json(
        { error: 'Clinic bookings have been removed from the platform.', legacy: true },
        { status: 410 }
      )
    }

    throw new ValidationError('courseId or oneOnOneRequestId is required')
  })
)
