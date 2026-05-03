import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseEnrollment, courseLesson, payment, refund } from '@/lib/db/schema'
import { eq, and, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { notifyMany } from '@/lib/notifications/notify'
import { getPaymentGateway, type GatewayName } from '@/lib/payments'

const patchCourseSchema = z.strictObject({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  languageOfInstruction: z.string().optional(),
  price: z.number().optional(),
  currency: z.string().optional(),
  isFree: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  categories: z.array(z.string()).optional(),
  schedule: z.array(z.record(z.string(), z.unknown())).optional(),
})

// GET /api/tutor/courses/[id] - Get a single course with lessons
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions, req)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const userId = session.user.id

    // Fetch course with lessons
    const courseData = await drizzleDb
      .select({
        courseId: course.courseId,
        name: course.name,
        description: course.description,
        isPublished: course.isPublished,
        languageOfInstruction: course.languageOfInstruction,
        price: course.price,
        currency: course.currency,
        isFree: course.isFree,
        schedule: course.schedule,
        categories: course.categories,
        creatorId: course.creatorId,
      })
      .from(course)
      .where(and(eq(course.courseId, id), eq(course.creatorId, userId)))
      .limit(1)

    if (courseData.length === 0) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Fetch lessons for this course
    const lessons = await drizzleDb
      .select({
        lessonId: courseLesson.lessonId,
        title: courseLesson.title,
        description: courseLesson.description,
        order: courseLesson.order,
        duration: courseLesson.duration,
        builderData: courseLesson.builderData,
      })
      .from(courseLesson)
      .where(eq(courseLesson.courseId, id))
      .orderBy(courseLesson.order)

    const courseRow = courseData[0]

    // Fetch enrollment count
    const [enrollmentAgg] = await drizzleDb
      .select({
        count: sql<number>`count(*)::int`.as('count'),
      })
      .from(courseEnrollment)
      .where(eq(courseEnrollment.courseId, id))

    // Transform to expected format
    const responseCourse = {
      id: courseRow.courseId,
      name: courseRow.name,
      description: courseRow.description,
      isPublished: courseRow.isPublished,
      languageOfInstruction: courseRow.languageOfInstruction,
      price: courseRow.price,
      currency: courseRow.currency,
      isFree: courseRow.isFree ?? false,
      schedule: courseRow.schedule || [],
      categories: courseRow.categories || [],
      // Group lessons into a single module for compatibility
      modules: [
        {
          id: 'default-module',
          title: 'Course Content',
          description: null,
          order: 0,
          lessons: lessons.map(l => ({
            id: l.lessonId,
            title: l.title,
            description: l.description,
            order: l.order,
            duration: l.duration,
          })),
        },
      ],
      studentCount: enrollmentAgg?.count ?? 0,
    }

    return NextResponse.json({ course: responseCourse })
  } catch (error) {
    console.error('[GET /api/tutor/courses/[id]] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch course' }, { status: 500 })
  }
}

// PATCH /api/tutor/courses/[id] - Update course details
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions, req)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const userId = session.user.id

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parseResult = patchCourseSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map(i => i.message).join(', ') },
        { status: 400 }
      )
    }

    const parsedBody = parseResult.data

    // Verify ownership
    const existingCourse = await drizzleDb
      .select({ courseId: course.courseId })
      .from(course)
      .where(and(eq(course.courseId, id), eq(course.creatorId, userId)))
      .limit(1)

    if (existingCourse.length === 0) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}

    if (parsedBody.name !== undefined) updateData.name = parsedBody.name.trim()
    if (parsedBody.description !== undefined) updateData.description = parsedBody.description
    if (parsedBody.languageOfInstruction !== undefined)
      updateData.languageOfInstruction = parsedBody.languageOfInstruction
    if (parsedBody.price !== undefined) updateData.price = parsedBody.price
    if (parsedBody.currency !== undefined) updateData.currency = parsedBody.currency
    if (parsedBody.isFree !== undefined) updateData.isFree = parsedBody.isFree
    if (parsedBody.isPublished !== undefined) updateData.isPublished = parsedBody.isPublished
    if (parsedBody.categories !== undefined) updateData.categories = parsedBody.categories
    if (parsedBody.schedule !== undefined) updateData.schedule = parsedBody.schedule

    // Update the course
    await drizzleDb.update(course).set(updateData).where(eq(course.courseId, id))

    // Fetch updated course
    const updatedCourse = await drizzleDb
      .select({
        courseId: course.courseId,
        name: course.name,
        description: course.description,
        isPublished: course.isPublished,
        languageOfInstruction: course.languageOfInstruction,
        price: course.price,
        currency: course.currency,
        isFree: course.isFree,
        schedule: course.schedule,
        categories: course.categories,
      })
      .from(course)
      .where(eq(course.courseId, id))
      .limit(1)

    return NextResponse.json({
      message: 'Course updated successfully',
      course: updatedCourse[0],
    })
  } catch (error) {
    console.error('[PATCH /api/tutor/courses/[id]] Error:', error)
    return NextResponse.json({ error: 'Failed to update course' }, { status: 500 })
  }
}

// DELETE /api/tutor/courses/[id] - Delete a course
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions, req)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const userId = session.user.id
    const confirmDelete = req.nextUrl.searchParams.get('confirm') === 'true'

    // Verify ownership
    const existingCourse = await drizzleDb
      .select({
        courseId: course.courseId,
        name: course.name,
        isPublished: course.isPublished,
      })
      .from(course)
      .where(and(eq(course.courseId, id), eq(course.creatorId, userId)))
      .limit(1)

    if (existingCourse.length === 0) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const courseRow = existingCourse[0]

    const enrolled = await drizzleDb
      .select({ studentId: courseEnrollment.studentId })
      .from(courseEnrollment)
      .where(eq(courseEnrollment.courseId, id))
    const enrolledStudentIds = enrolled.map(e => e.studentId).filter(Boolean)

    if (courseRow.isPublished && enrolledStudentIds.length > 0 && !confirmDelete) {
      return NextResponse.json(
        {
          error: 'This published course has enrolled students.',
          requiresConfirmation: true,
          enrolledCount: enrolledStudentIds.length,
          courseName: courseRow.name,
        },
        { status: 409 }
      )
    }

    let refundedPayments = 0
    let refundFailedPayments = 0

    if (courseRow.isPublished && enrolledStudentIds.length > 0) {
      const payments = await drizzleDb
        .select({
          paymentId: payment.paymentId,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          gateway: payment.gateway,
          gatewayPaymentId: payment.gatewayPaymentId,
          metadata: payment.metadata,
        })
        .from(payment)
        .where(
          and(eq(payment.courseId, id), eq(payment.status, 'COMPLETED'), isNull(payment.refundedAt))
        )

      const batches: (typeof payments)[] = []
      for (let i = 0; i < payments.length; i += 5) {
        batches.push(payments.slice(i, i + 5))
      }

      for (const batch of batches) {
        const results = await Promise.allSettled(
          batch.map(async p => {
            const gateway = getPaymentGateway(p.gateway as GatewayName)
            const metadata = (p.metadata as { payment_attempt_id?: string } | null) ?? null
            const refundPaymentId =
              p.gateway === 'AIRWALLEX' && metadata?.payment_attempt_id
                ? metadata.payment_attempt_id
                : (p.gatewayPaymentId ?? p.paymentId)

            const refundResponse = await gateway.refundPayment(refundPaymentId, p.amount)
            if (refundResponse.error) {
              throw new Error(refundResponse.error)
            }

            const refundStatus =
              refundResponse.status === 'succeeded' || refundResponse.status === 'RECEIVED'
                ? 'COMPLETED'
                : 'PENDING'
            const refundId = crypto.randomUUID()
            await drizzleDb.insert(refund).values({
              refundId,
              paymentId: p.paymentId,
              amount: p.amount,
              reason: 'course_deleted',
              status: refundStatus,
              gatewayRefundId: refundResponse.refundId,
              processedAt:
                refundResponse.status === 'succeeded' || refundResponse.status === 'RECEIVED'
                  ? new Date()
                  : null,
            })

            await drizzleDb
              .update(payment)
              .set({
                status: 'REFUNDED',
                refundedAt: new Date(),
              })
              .where(eq(payment.paymentId, p.paymentId))

            return true
          })
        )

        results.forEach(r => {
          if (r.status === 'fulfilled') refundedPayments += 1
          else refundFailedPayments += 1
        })
      }

      try {
        const message =
          refundFailedPayments > 0
            ? 'Your tutor removed this course. Refunds for paid enrollments are being processed. If you do not receive a refund, please contact support.'
            : 'Your tutor removed this course. Refunds for paid enrollments have been initiated automatically and will be returned to your original payment method.'
        await notifyMany({
          userIds: enrolledStudentIds,
          type: 'payment',
          title: `Course removed: ${courseRow.name}`,
          message,
          actionUrl: '/student/courses',
          data: { courseId: id, reason: 'course_deleted', refundsInitiated: refundedPayments },
        })
      } catch (notifyErr) {
        console.error('[DELETE /api/tutor/courses/[id]] notifyMany error:', notifyErr)
      }
    }

    // Delete the course (cascade will handle lessons)
    await drizzleDb.delete(course).where(eq(course.courseId, id))

    return NextResponse.json({
      message: 'Course deleted successfully',
      refundsInitiated: refundedPayments,
      refundsFailed: refundFailedPayments,
      enrolledCount: enrolledStudentIds.length,
    })
  } catch (error) {
    console.error('[DELETE /api/tutor/courses/[id]] Error:', error)
    return NextResponse.json({ error: 'Failed to delete course' }, { status: 500 })
  }
}
