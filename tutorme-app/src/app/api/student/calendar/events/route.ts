/**
 * GET /api/student/calendar/events
 * Returns calendar events for the current student.
 * Queries CalendarEvent joined with CourseEnrollment, and also queries
 * LiveSession directly as a fallback for courses that don't have CalendarEvent rows.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  calendarEvent,
  courseEnrollment,
  profile,
  liveSession,
  course,
  sessionParticipant,
} from '@/lib/db/schema'
import { eq, and, gte, lte, inArray, isNull, sql } from 'drizzle-orm'
import { LIVE_SESSION_OPEN_STATUSES } from '@/lib/sessions/live-session-status'

export const GET = withAuth(
  async (req: NextRequest, session) => {
    const studentId = session.user.id
    const { searchParams } = new URL(req.url)
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')

    const startDate = startParam ? new Date(startParam) : new Date()
    const endDate = endParam ? new Date(endParam) : new Date()

    if (endParam) {
      endDate.setHours(23, 59, 59, 999)
    }

    // Find courses the student is enrolled in
    const enrollments = await drizzleDb
      .select({ courseId: courseEnrollment.courseId })
      .from(courseEnrollment)
      .where(eq(courseEnrollment.studentId, studentId))

    const courseIds = enrollments.map(e => e.courseId).filter(Boolean)

    if (courseIds.length === 0) {
      return NextResponse.json({ events: [] })
    }

    // --- Primary source: CalendarEvent ---
    const calFilters = [
      inArray(calendarEvent.courseId, courseIds),
      eq(calendarEvent.isCancelled, false),
      isNull(calendarEvent.deletedAt),
    ]

    if (startParam) {
      calFilters.push(gte(calendarEvent.startTime, startDate))
    }
    if (endParam) {
      calFilters.push(lte(calendarEvent.startTime, endDate))
    }

    const calEvents = await drizzleDb
      .select({
        eventId: calendarEvent.eventId,
        title: calendarEvent.title,
        description: calendarEvent.description,
        startTime: calendarEvent.startTime,
        endTime: calendarEvent.endTime,
        status: calendarEvent.status,
        meetingUrl: calendarEvent.meetingUrl,
        courseId: calendarEvent.courseId,
        location: calendarEvent.location,
        isVirtual: calendarEvent.isVirtual,
        tutorId: calendarEvent.tutorId,
        externalId: calendarEvent.externalId,
        sessionStatus: liveSession.status,
      })
      .from(calendarEvent)
      .leftJoin(liveSession, eq(liveSession.sessionId, calendarEvent.externalId))
      .where(and(...calFilters))
      .orderBy(calendarEvent.startTime)

    // --- Fallback source: LiveSession (for courses published before CalendarEvent bridge) ---
    const lsFilters = [
      inArray(liveSession.courseId, courseIds),
      inArray(liveSession.status, LIVE_SESSION_OPEN_STATUSES),
    ]

    if (startParam) {
      lsFilters.push(gte(liveSession.scheduledAt, startDate))
    }
    if (endParam) {
      lsFilters.push(lte(liveSession.scheduledAt, endDate))
    }

    const liveSessions = await drizzleDb
      .select({
        sessionId: liveSession.sessionId,
        title: liveSession.title,
        description: liveSession.description,
        scheduledAt: liveSession.scheduledAt,
        status: liveSession.status,
        roomUrl: liveSession.roomUrl,
        courseId: liveSession.courseId,
        durationMinutes: liveSession.durationMinutes,
        tutorId: liveSession.tutorId,
      })
      .from(liveSession)
      .where(and(...lsFilters))
      .orderBy(liveSession.scheduledAt)

    // Build a set of externalIds already covered by CalendarEvent to avoid duplicates
    const coveredExternalIds = new Set(calEvents.map(e => e.externalId).filter(Boolean) as string[])

    // Merge fallback LiveSessions that aren't already covered
    const merged = [
      ...calEvents.map(e => ({
        id: e.eventId,
        sessionId: e.externalId,
        bookingId: e.eventId,
        title: e.title,
        subject: e.description || 'Class',
        start: e.startTime?.toISOString() ?? new Date().toISOString(),
        end: e.endTime?.toISOString() ?? new Date().toISOString(),
        duration:
          e.endTime && e.startTime
            ? Math.round((new Date(e.endTime).getTime() - new Date(e.startTime).getTime()) / 60000)
            : 60,
        type: 'class' as const,
        tutorId: e.tutorId,
        meetingUrl: e.meetingUrl,
        location: e.location,
        isVirtual: e.isVirtual,
        status: e.sessionStatus || 'scheduled',
        courseId: e.courseId,
      })),
      ...liveSessions
        .filter(ls => !coveredExternalIds.has(ls.sessionId))
        .map(ls => ({
          id: ls.sessionId,
          sessionId: ls.sessionId,
          bookingId: ls.sessionId,
          title: ls.title || 'Live Session',
          subject: ls.description || 'Class',
          start: ls.scheduledAt?.toISOString() ?? new Date().toISOString(),
          end: ls.scheduledAt
            ? new Date(ls.scheduledAt.getTime() + (ls.durationMinutes || 60) * 60000).toISOString()
            : new Date().toISOString(),
          duration: ls.durationMinutes || 60,
          type: 'class' as const,
          tutorId: ls.tutorId,
          meetingUrl: ls.roomUrl,
          location: 'Online',
          isVirtual: true,
          status: ls.status,
          courseId: ls.courseId,
        })),
    ]

    // Sort by start time
    merged.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

    // Fetch tutor names from profile
    const tutorIds = [...new Set(merged.map(e => e.tutorId).filter(Boolean))]
    const tutorProfiles =
      tutorIds.length > 0
        ? await drizzleDb
            .select({ userId: profile.userId, name: profile.name })
            .from(profile)
            .where(inArray(profile.userId, tutorIds))
        : []

    const tutorMap = new Map(tutorProfiles.map(t => [t.userId, t.name]))

    // Fetch course names
    const eventCourseIds = [...new Set(merged.map(e => e.courseId).filter(Boolean))] as string[]
    const courseRows =
      eventCourseIds.length > 0
        ? await drizzleDb
            .select({ courseId: course.courseId, name: course.name })
            .from(course)
            .where(inArray(course.courseId, eventCourseIds))
        : []
    const courseMap = new Map(courseRows.map(c => [c.courseId, c.name]))

    // Fetch session participant counts
    const sessionIds = [...new Set(merged.map(e => e.sessionId).filter(Boolean))] as string[]
    const participantRows =
      sessionIds.length > 0
        ? await drizzleDb
            .select({
              sessionId: sessionParticipant.sessionId,
              count: sql<number>`count(*)::int`.as('count'),
            })
            .from(sessionParticipant)
            .where(inArray(sessionParticipant.sessionId, sessionIds))
            .groupBy(sessionParticipant.sessionId)
        : []
    const participantMap = new Map(participantRows.map(p => [p.sessionId, p.count]))

    const formatted = merged.map(e => ({
      ...e,
      tutorName: e.tutorId ? (tutorMap.get(e.tutorId) ?? 'Tutor') : 'Tutor',
      courseName: e.courseId ? (courseMap.get(e.courseId) ?? undefined) : undefined,
      category: e.courseId ? (courseMap.get(e.courseId) ?? undefined) : undefined,
      enrolledCount: e.sessionId ? (participantMap.get(e.sessionId) ?? 0) : 0,
    }))

    return NextResponse.json({ events: formatted })
  },
  { role: 'STUDENT' }
)
