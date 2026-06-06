/**
 * Unenroll from a Subject API
 * Remove a subject from student's course
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, ValidationError, NotFoundError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseEnrollment } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export const POST = withCsrf(
  withAuth(async (req: NextRequest, session) => {
    const { subjectCode } = await req.json()

    if (!subjectCode) {
      throw new ValidationError('Subject code required')
    }

    const [courseRow] = await drizzleDb
      .select()
      .from(course)
      .where(eq(course.categories, [subjectCode.toLowerCase()]))
      .limit(1)

    if (!courseRow) {
      throw new NotFoundError('Subject not found')
    }

    const [enrollment] = await drizzleDb
      .select()
      .from(courseEnrollment)
      .where(
        and(
          eq(courseEnrollment.studentId, session.user.id),
          eq(courseEnrollment.courseId, courseRow.courseId)
        )
      )
      .limit(1)

    if (!enrollment) {
      throw new ValidationError('Not enrolled in this subject')
    }

    await drizzleDb
      .delete(courseEnrollment)
      .where(eq(courseEnrollment.enrollmentId, enrollment.enrollmentId))

    return NextResponse.json({
      success: true,
      message: `Unenrolled from ${courseRow.name}`,
    })
  }, { role: 'STUDENT' })
)
