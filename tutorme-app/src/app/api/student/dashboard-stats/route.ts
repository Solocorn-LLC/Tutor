/**
 * GET /api/student/dashboard-stats
 *
 * Returns aggregate counts for the student dashboard hero:
 *  - coursesEnrolled: active enrollments with remaining sessions
 *  - coursesCompleted: enrollments where all scheduled sessions are in the past
 *  - upcomingSessions: remaining course sessions across active enrollments
 *  - totalBookings: active/upcoming 1-on-1 bookings
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  courseEnrollment,
  courseProgress,
  course,
  courseSchedule,
  calendarEvent,
  liveSession,
  oneOnOneBookingRequest,
  type BookingRequestStatus,
  type LiveSessionStatus,
} from '@/lib/db/schema'
import { eq, and, inArray, isNull, gte } from 'drizzle-orm'
import {
  generateUpcomingSessions,
  mergeSessions,
  type ScheduleSlot,
  type RealSession,
  type VirtualSession,
} from '@/lib/schedule-sessions'
import { LIVE_SESSION_OPEN_STATUSES } from '@/lib/sessions/live-session-status'

const ACTIVE_BOOKING_STATUSES: BookingRequestStatus[] = ['PENDING', 'ACCEPTED', 'PAID']
const ACTIVE_LIVE_SESSION_STATUSES: LiveSessionStatus[] = LIVE_SESSION_OPEN_STATUSES

export const dynamic = 'force-dynamic'

function parseDateTime(date: Date | string | null, timeStr: string): Date | null {
  if (!date || !timeStr) return null
  const base = new Date(date)
  const [hours, minutes] = timeStr.split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  base.setHours(hours, minutes, 0, 0)
  return base
}

function isFuture(date: Date | string | null): boolean {
  if (!date) return false
  return new Date(date).getTime() > Date.now()
}

export const GET = withAuth(
  async (_req: NextRequest, session) => {
    const studentId = session.user.id
    const now = new Date()

    try {
      // --- 1. Load enrollments with course and progress ---
      const enrollmentRows = await drizzleDb
        .select({
          enrollmentId: courseEnrollment.enrollmentId,
          courseId: courseEnrollment.courseId,
          startDate: courseEnrollment.startDate,
          isCompleted: courseProgress.isCompleted,
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
      const courseIds = [...new Set(activeEnrollments.map(e => e.courseId).filter(Boolean))]

      // Load schedules for enrolled courses (a course may have multiple schedules)
      const scheduleRows =
        courseIds.length > 0
          ? await drizzleDb
              .select({
                courseId: courseSchedule.courseId,
                schedule: courseSchedule.schedule,
                weeksToSchedule: courseSchedule.weeksToSchedule,
              })
              .from(courseSchedule)
              .where(inArray(courseSchedule.courseId, courseIds))
          : []

      const schedulesByCourse = new Map<string, typeof scheduleRows>()
      for (const courseId of courseIds) {
        schedulesByCourse.set(
          courseId,
          scheduleRows.filter(s => s.courseId === courseId)
        )
      }

      // Early return if no enrollments and no bookings
      if (courseIds.length === 0) {
        const bookingRows = await drizzleDb
          .select({
            requestId: oneOnOneBookingRequest.requestId,
            requestedDate: oneOnOneBookingRequest.requestedDate,
            endTime: oneOnOneBookingRequest.endTime,
          })
          .from(oneOnOneBookingRequest)
          .where(
            and(
              eq(oneOnOneBookingRequest.studentId, studentId),
              inArray(oneOnOneBookingRequest.status, ACTIVE_BOOKING_STATUSES)
            )
          )

        const totalBookings = bookingRows.filter(b => {
          const endDateTime = parseDateTime(b.requestedDate, b.endTime)
          return endDateTime && endDateTime.getTime() >= now.getTime()
        }).length

        return NextResponse.json({
          success: true,
          data: {
            coursesEnrolled: 0,
            coursesCompleted: 0,
            upcomingSessions: 0,
            totalBookings,
          },
        })
      }

      // --- 2. Load realized future sessions for enrolled courses ---
      const [calendarEvents, liveSessions] = await Promise.all([
        drizzleDb
          .select({
            eventId: calendarEvent.eventId,
            courseId: calendarEvent.courseId,
            startTime: calendarEvent.startTime,
            endTime: calendarEvent.endTime,
            title: calendarEvent.title,
            status: calendarEvent.status,
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
            courseId: liveSession.courseId,
            scheduledAt: liveSession.scheduledAt,
            status: liveSession.status,
            title: liveSession.title,
            durationMinutes: liveSession.durationMinutes,
            category: liveSession.category,
            maxStudents: liveSession.maxStudents,
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

      // Group realized sessions by courseId
      const calendarEventsByCourse = new Map<string, typeof calendarEvents>()
      const liveSessionsByCourse = new Map<string, typeof liveSessions>()
      for (const courseId of courseIds) {
        calendarEventsByCourse.set(
          courseId,
          calendarEvents.filter(e => e.courseId === courseId)
        )
        liveSessionsByCourse.set(
          courseId,
          liveSessions.filter(s => s.courseId === courseId)
        )
      }

      // --- 3. Compute per-course session counts ---
      let coursesEnrolled = 0
      let coursesCompleted = 0
      let upcomingSessions = 0

      for (const enrollment of activeEnrollments) {
        if (!enrollment.courseId) continue

        const courseSchedules = schedulesByCourse.get(enrollment.courseId) ?? []
        const startDate = enrollment.startDate ? new Date(enrollment.startDate) : now
        const fromDate = startDate.getTime() > now.getTime() ? startDate : now

        // Virtual sessions from all course schedules
        const virtualSessions: VirtualSession[] = []
        for (const schedule of courseSchedules) {
          const slots = (schedule.schedule as ScheduleSlot[] | null) ?? []
          const weeksToSchedule = schedule.weeksToSchedule ?? 8
          if (slots.length > 0) {
            const sessions = generateUpcomingSessions(slots, '', '', {
              count: weeksToSchedule * slots.length,
              fromDate,
              maxStudents: 50,
            })
            virtualSessions.push(...sessions)
          }
        }

        // Realized sessions
        const courseCalEvents = calendarEventsByCourse.get(enrollment.courseId) ?? []
        const courseLiveSessions = liveSessionsByCourse.get(enrollment.courseId) ?? []

        const realSessions: RealSession[] = [
          ...courseCalEvents.map(e => ({
            id: e.eventId,
            title: e.title || 'Session',
            status: e.status || 'scheduled',
            scheduledAt: e.startTime?.toISOString() ?? null,
            startedAt: null,
            endedAt: e.endTime?.toISOString() ?? null,
            durationMinutes:
              e.startTime && e.endTime
                ? Math.round((e.endTime.getTime() - e.startTime.getTime()) / 60000)
                : 60,
            isVirtual: false,
            maxStudents: 50,
            category: 'General',
          })),
          ...courseLiveSessions.map(s => ({
            id: s.sessionId,
            title: s.title || 'Live Session',
            status: s.status,
            scheduledAt: s.scheduledAt?.toISOString() ?? null,
            startedAt: null,
            endedAt: null,
            durationMinutes: s.durationMinutes ?? 60,
            isVirtual: false,
            maxStudents: s.maxStudents ?? 50,
            category: s.category || 'General',
          })),
        ]

        const merged = mergeSessions(realSessions, virtualSessions)
        const futureSessions = merged.filter(s => isFuture(s.scheduledAt))

        if (futureSessions.length > 0) {
          coursesEnrolled++
          upcomingSessions += futureSessions.length
        } else {
          coursesCompleted++
        }
      }

      // --- 4. Active/upcoming 1-on-1 bookings ---
      const bookingRows = await drizzleDb
        .select({
          requestId: oneOnOneBookingRequest.requestId,
          requestedDate: oneOnOneBookingRequest.requestedDate,
          endTime: oneOnOneBookingRequest.endTime,
        })
        .from(oneOnOneBookingRequest)
        .where(
          and(
            eq(oneOnOneBookingRequest.studentId, studentId),
            inArray(oneOnOneBookingRequest.status, ACTIVE_BOOKING_STATUSES)
          )
        )

      const totalBookings = bookingRows.filter(b => {
        const endDateTime = parseDateTime(b.requestedDate, b.endTime)
        return endDateTime && endDateTime.getTime() >= now.getTime()
      }).length

      return NextResponse.json({
        success: true,
        data: {
          coursesEnrolled,
          coursesCompleted,
          upcomingSessions,
          totalBookings,
        },
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
