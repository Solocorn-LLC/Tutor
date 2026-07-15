/**
 * Unenroll from a Subject API
 * Remove a subject from student's course
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, ValidationError, NotFoundError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseEnrollment } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { reconcileProposalsAfterDeparture } from '@/lib/schedule/reschedule-consent'

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
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
            // eslint-disable-next-line no-restricted-syntax -- exact match: unenroll targets THIS resolved course, not a session-derived id
            eq(courseEnrollment.courseId, courseRow.courseId)
          )
        )
        .limit(1)

      if (!enrollment) {
        throw new ValidationError('Not enrolled in this subject')
      }

      // Delete the enrollment and release the schedule seat in one transaction so the
      // cohort capacity counter doesn't drift upward and falsely report "full".
      await drizzleDb.transaction(async tx => {
        await tx
          .delete(courseEnrollment)
          .where(eq(courseEnrollment.enrollmentId, enrollment.enrollmentId))

        if (enrollment.scheduleId) {
          await tx.execute(
            sql`UPDATE "CourseSchedule"
                SET "enrolledCount" = GREATEST("enrolledCount" - 1, 0)
                WHERE id = ${enrollment.scheduleId}`
          )
        }
      })

      // A departed student's unanswered vote must not stall a pending reschedule.
      await reconcileProposalsAfterDeparture(session.user.id, courseRow.courseId)

      return NextResponse.json({
        success: true,
        message: `Unenrolled from ${courseRow.name}`,
      })
    },
    { role: 'STUDENT' }
  )
)
