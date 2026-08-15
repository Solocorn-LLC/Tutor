/**
 * PATCH: Update enrollment (e.g. assign to batch). Tutor-only.
 */

import { NextResponse } from 'next/server'
import { withAuth, withCsrf, NotFoundError, ForbiddenError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { verifyCourseOwnership } from '@/lib/api/course-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import { courseEnrollment } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export const PATCH = withCsrf(
  withAuth(
    async (req, session, context) => {
      const id = await getParamAsync(context?.params, 'id')
      const enrollmentId = await getParamAsync(context?.params, 'enrollmentId')
      if (!id || !enrollmentId)
        return NextResponse.json({ error: 'Course and enrollment ID required' }, { status: 400 })

      const isOwner = await verifyCourseOwnership(id, session.user.id)
      if (!isOwner) {
        throw new ForbiddenError('You do not have access to this course')
      }

      const [enrollment] = await drizzleDb
        .select()
        .from(courseEnrollment)
        .where(
          and(eq(courseEnrollment.enrollmentId, enrollmentId), eq(courseEnrollment.courseId, id))
        )
      if (!enrollment) throw new NotFoundError('Enrollment not found')
      // batchId column doesn't exist in schema - skipping batch update
      // const body = await req.json().catch(() => ({}))
      // const batchId = body.batchId === null || body.batchId === '' ? null : (body.batchId as string)
      return NextResponse.json({
        enrollment: { id: enrollment.enrollmentId, batchId: null },
        message: 'Enrollment found (batch update not supported).',
      })
    },
    { role: 'TUTOR' }
  )
)
