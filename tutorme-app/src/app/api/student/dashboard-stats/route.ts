/**
 * GET /api/student/dashboard-stats
 *
 * Returns aggregate counts for the student dashboard hero:
 *  - coursesEnrolled: number of (non-deleted) course enrollments
 *  - coursesCompleted: enrollments where the student has finished every lesson
 *    (progress lessonsCompleted >= totalLessons), or an explicit completion flag
 *  - upcomingSessions: future MATERIALIZED sessions, deduped the same way the
 *    student calendar does (so the number matches the calendar, not a projection)
 *  - totalBookings: 1-on-1 bookings the student has placed (excludes requests that
 *    were rejected or expired without ever becoming a booking)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  courseEnrollment,
  courseProgress,
  course,
  calendarEvent,
  liveSession,
  oneOnOneBookingRequest,
  type BookingRequestStatus,
  type LiveSessionStatus,
} from '@/lib/db/schema'
import { eq, and, inArray, isNull, gte } from 'drizzle-orm'
import { expandToCourseFamily } from '@/lib/courses/variant-family'
import { LIVE_SESSION_OPEN_STATUSES } from '@/lib/sessions/live-session-status'

// A booking that was rejected by the tutor or expired never became a booking, so
// it is excluded from "Total Bookings". Everything else (incl. cancelled) counts
// as a booking the student actually placed.
const BOOKED_STATUSES: BookingRequestStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PAID',
  'CANCELLED',
  'COMPLETED',
]
const ACTIVE_LIVE_SESSION_STATUSES: LiveSessionStatus[] = LIVE_SESSION_OPEN_STATUSES

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  async (_req: NextRequest, session) => {
    const studentId = session.user.id
    const now = new Date()

    try {
      // --- 1. Load enrollments with course + progress (lessons drive completion) ---
      const enrollmentRows = await drizzleDb
        .select({
          enrollmentId: courseEnrollment.enrollmentId,
          courseId: courseEnrollment.courseId,
          completedAt: courseEnrollment.completedAt,
          isCompleted: courseProgress.isCompleted,
          lessonsCompleted: courseProgress.lessonsCompleted,
          totalLessons: courseProgress.totalLessons,
          courseDeletedAt: course.deletedAt,
        })
        .from(courseEnrollment)
        .leftJoin(course, eq(course.courseId, courseEnrollment.courseId))
        .leftJoin(
          courseProgress,
          and(
            eq(courseProgress.studentId, studentId),
            eq(courseProgress.courseId, courseEnrollment.courseId)
          )
        )
        .where(eq(courseEnrollment.studentId, studentId))

      const activeEnrollments = enrollmentRows.filter(e => !e.courseDeletedAt)
      // Expand enrolled (published) ids to the variant family so template-scoped
      // sessions are counted too (see @/lib/courses/variant-family).
      const courseIds = await expandToCourseFamily([
        ...new Set(activeEnrollments.map(e => e.courseId).filter(Boolean)),
      ] as string[])

      // --- 2. Counts that don't depend on sessions ---
      const coursesEnrolled = activeEnrollments.length
      // Completed = explicit flag (kept as a fallback for when it gets written) OR
      // the student has finished every lesson per their progress row.
      const coursesCompleted = activeEnrollments.filter(e => {
        if (e.isCompleted === true || e.completedAt != null) return true
        const total = e.totalLessons ?? 0
        const done = e.lessonsCompleted ?? 0
        return total > 0 && done >= total
      }).length

      // --- 3. Bookings (lifetime, real bookings only) ---
      const bookingRows = await drizzleDb
        .select({ requestId: oneOnOneBookingRequest.requestId })
        .from(oneOnOneBookingRequest)
        .where(
          and(
            eq(oneOnOneBookingRequest.studentId, studentId),
            inArray(oneOnOneBookingRequest.status, BOOKED_STATUSES)
          )
        )
      const totalBookings = bookingRows.length

      if (courseIds.length === 0) {
        return NextResponse.json({
          success: true,
          data: { coursesEnrolled, coursesCompleted, upcomingSessions: 0, totalBookings },
        })
      }

      // --- 4. Upcoming sessions = future MATERIALIZED sessions, deduped like the
      // student calendar (a LiveSession bridged to a CalendarEvent via externalId
      // is counted once). No projected/virtual sessions, so this matches what the
      // student actually sees on their calendar. ---
      const [calendarEvents, liveSessions] = await Promise.all([
        drizzleDb
          .select({
            eventId: calendarEvent.eventId,
            externalId: calendarEvent.externalId,
          })
          .from(calendarEvent)
          .where(
            and(
              inArray(calendarEvent.courseId, courseIds),
              eq(calendarEvent.isCancelled, false),
              isNull(calendarEvent.deletedAt),
              gte(calendarEvent.startTime, now)
            )
          ),

        drizzleDb
          .select({
            sessionId: liveSession.sessionId,
          })
          .from(liveSession)
          .where(
            and(
              inArray(liveSession.courseId, courseIds),
              inArray(liveSession.status, ACTIVE_LIVE_SESSION_STATUSES),
              gte(liveSession.scheduledAt, now)
            )
          ),
      ])

      const coveredSessionIds = new Set(
        calendarEvents.map(e => e.externalId).filter(Boolean) as string[]
      )
      const upcomingSessions =
        calendarEvents.length + liveSessions.filter(s => !coveredSessionIds.has(s.sessionId)).length

      return NextResponse.json({
        success: true,
        data: { coursesEnrolled, coursesCompleted, upcomingSessions, totalBookings },
      })
    } catch (error) {
      return handleApiError(
        error,
        'Failed to fetch dashboard stats',
        'api/student/dashboard-stats/route.ts'
      )
    }
  },
  { role: 'STUDENT' }
)
