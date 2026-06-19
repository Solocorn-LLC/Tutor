/**
 * PATCH /api/student/enrollments/schedule
 *
 * Switch the schedule a student is enrolled in for a course. Cascades the
 * capacity counters (decrement the old schedule, atomically increment the new
 * one with a full-check) and updates the enrollment's scheduleId — all in one
 * transaction so a partial switch can't leak a seat. The student's session list
 * and session count are scoped by this scheduleId, so they update automatically.
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { courseEnrollment, courseSchedule } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'

export const PATCH = withCsrf(
  withAuth(
    async (req, session) => {
      const body = await req.json().catch(() => ({}))
      const { courseId, scheduleId } = body as { courseId?: string; scheduleId?: string }

      if (!courseId || typeof courseId !== 'string') {
        return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
      }
      if (!scheduleId || typeof scheduleId !== 'string') {
        return NextResponse.json({ error: 'Schedule ID is required' }, { status: 400 })
      }

      try {
        await drizzleDb.transaction(async tx => {
          // The student's enrollment in this course.
          const [enrollment] = await tx
            .select({
              enrollmentId: courseEnrollment.enrollmentId,
              scheduleId: courseEnrollment.scheduleId,
            })
            .from(courseEnrollment)
            .where(
              and(
                eq(courseEnrollment.studentId, session.user.id),
                eq(courseEnrollment.courseId, courseId)
              )
            )
            .limit(1)

          if (!enrollment) {
            throw new Error('You are not enrolled in this course')
          }
          if (enrollment.scheduleId === scheduleId) {
            return // already on this schedule — no-op
          }

          // The target schedule must belong to this course.
          const [target] = await tx
            .select({ scheduleId: courseSchedule.scheduleId })
            .from(courseSchedule)
            .where(
              and(eq(courseSchedule.scheduleId, scheduleId), eq(courseSchedule.courseId, courseId))
            )
            .limit(1)
          if (!target) {
            throw new Error('That schedule is not available for this course')
          }

          // Claim a seat on the new schedule first (atomic full-check) so we
          // never free the old seat and then fail to get the new one.
          const claimed = await tx.execute(
            sql`UPDATE "CourseSchedule"
                SET "enrolledCount" = "enrolledCount" + 1
                WHERE id = ${scheduleId}
                  AND "courseId" = ${courseId}
                  AND ("maxStudents" IS NULL OR "enrolledCount" < "maxStudents")
                RETURNING id`
          )
          if (!claimed.rows.length) {
            throw new Error('That schedule is full')
          }

          // Release the old seat (floored at 0).
          if (enrollment.scheduleId) {
            await tx.execute(
              sql`UPDATE "CourseSchedule"
                  SET "enrolledCount" = GREATEST("enrolledCount" - 1, 0)
                  WHERE id = ${enrollment.scheduleId}`
            )
          }

          await tx
            .update(courseEnrollment)
            .set({ scheduleId })
            .where(eq(courseEnrollment.enrollmentId, enrollment.enrollmentId))
        })

        return NextResponse.json({ success: true, scheduleId })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to switch schedule'
        return NextResponse.json({ error: message }, { status: 400 })
      }
    },
    { role: 'STUDENT' }
  )
)
