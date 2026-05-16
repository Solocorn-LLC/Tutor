/**
 * Course Enrollment API
 * POST: Enroll the current student in a specific course
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, ValidationError, NotFoundError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import {
  enrollStudentInCourse,
  enrollmentPaymentRequiredResponse,
} from '@/lib/api/enrollments'

export const POST = withCsrf(
  withAuth(async (req: NextRequest, session, context) => {
    const courseId = await getParamAsync(context.params, 'courseId')

    if (!courseId) {
      throw new ValidationError('Course ID is required')
    }

    const body = await req.json().catch(() => ({}))
    const { startDate } = body

    try {
      const result = await enrollStudentInCourse(session.user.id, courseId, startDate)
      return NextResponse.json(result)
    } catch (error: unknown) {
      const err = error as any
      if (err instanceof NotFoundError) {
        return NextResponse.json({ error: err.message }, { status: 404 })
      }
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      if (err?.requiresPayment) {
        return enrollmentPaymentRequiredResponse(err)
      }
      throw error
    }
  })
)
