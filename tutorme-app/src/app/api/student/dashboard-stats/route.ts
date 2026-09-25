/**
 * GET /api/student/dashboard-stats
 *
 * Returns aggregate counts for the student dashboard hero:
 *  - coursesEnrolled: number of (non-deleted) course enrollments
 *  - coursesCompleted: enrollments where the student has finished every session
 *    in the count scope (explicit flag / completedAt short-circuit, lessons
 *    predicate as fallback when no sessions are materialized yet) — the SAME
 *    session-derived definition the My Courses tabs use, so hero and tabs agree
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
import { eq, and, inArray, isNull, isNotNull, gte } from 'drizzle-orm'
import { expandFamilyWithMap } from '@/lib/courses/variant-family'
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
          scheduleId: courseEnrollment.scheduleId,
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
      // sessions are counted too (see @/lib/courses/variant-family). The map rolls
      // template-scoped rows back up under the enrolled id.
      const { ids: courseIds, toEnrolled } = await expandFamilyWithMap([
        ...new Set(activeEnrollments.map(e => e.courseId).filter(Boolean)),
      ] as string[])

      // Session-derived completion, mirroring the enrollments route EXACTLY so
      // the dashboard hero and the My Courses tabs can never disagree:
      // countable = schedule-materialized (scheduleId NOT NULL), excluding
      // 'cancelled' rows and ended-FUTURE ghosts (slots retired before they
      // ran). Completed = ended && scheduledAt <= now. Counts prefer the
      // enrollment's chosen schedule, falling back to the course-wide family.
      const nowMs = now.getTime()
      const countableSessionRows =
        courseIds.length > 0
          ? await drizzleDb
              .select({
                courseId: liveSession.courseId,
                scheduleId: liveSession.scheduleId,
                status: liveSession.status,
                scheduledAt: liveSession.scheduledAt,
              })
              .from(liveSession)
              .where(
                and(inArray(liveSession.courseId, courseIds), isNotNull(liveSession.scheduleId))
              )
          : []
      const sessionCountBySchedule = new Map<string, number>() // `courseId:scheduleId`
      const sessionCountByCourse = new Map<string, number>()
      const completedCountBySchedule = new Map<string, number>()
      const completedCountByCourse = new Map<string, number>()
      // The 'cancelled' comparison must happen on a plain-string status: the
      // LiveSessionStatus enum has no 'cancelled' value, so comparing the typed
      // column to the literal errors at compile time (same reason the
      // enrollments route applies that predicate in JS).
      for (const s of countableSessionRows as Array<{
        courseId: string | null
        scheduleId: string | null
        status: string
        scheduledAt: Date | null
      }>) {
        const cid = toEnrolled.get(s.courseId ?? '') ?? s.courseId ?? ''
        if (s.status === 'cancelled') continue
        if (s.status === 'ended' && s.scheduledAt != null && s.scheduledAt.getTime() > nowMs)
          continue
        const isCompleted =
          s.status === 'ended' && s.scheduledAt != null && s.scheduledAt.getTime() <= nowMs
        sessionCountByCourse.set(cid, (sessionCountByCourse.get(cid) ?? 0) + 1)
        if (isCompleted) completedCountByCourse.set(cid, (completedCountByCourse.get(cid) ?? 0) + 1)
        if (s.scheduleId) {
          const key = `${cid}:${s.scheduleId}`
          sessionCountBySchedule.set(key, (sessionCountBySchedule.get(key) ?? 0) + 1)
          if (isCompleted)
            completedCountBySchedule.set(key, (completedCountBySchedule.get(key) ?? 0) + 1)
        }
      }

      // --- 2. Counts that don't depend on sessions ---
      const coursesEnrolled = activeEnrollments.length
      // Completed = explicit flag OR enrollment.completedAt OR every session in
      // the count scope has run (same derivation as the enrollments route, so
      // the hero and the My Courses tabs agree). When a course has no
      // materialized sessions yet (sessionCount === 0), fall back to the
      // lessons predicate so pre-materialization courses still complete.
      const coursesCompleted = activeEnrollments.filter(e => {
        if (e.isCompleted === true || e.completedAt != null) return true
        const scheduleKey = e.scheduleId ? `${e.courseId}:${e.scheduleId}` : null
        const scheduleScopedCount = scheduleKey
          ? sessionCountBySchedule.get(scheduleKey)
          : undefined
        const sessionCount = scheduleScopedCount ?? sessionCountByCourse.get(e.courseId) ?? 0
        if (sessionCount > 0) {
          const completedSessions =
            scheduleScopedCount != null
              ? (completedCountBySchedule.get(scheduleKey!) ?? 0)
              : (completedCountByCourse.get(e.courseId) ?? 0)
          return completedSessions >= sessionCount
        }
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
