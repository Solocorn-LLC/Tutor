/**
 * GET /api/tutor/calendar/events
 * Returns calendar events for the current tutor.
 * Queries CalendarEvent table (primary) and LiveSession (fallback) to ensure
 * sessions are always visible even if CalendarEvent rows are missing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  calendarEvent,
  liveSession,
  course,
  sessionParticipant,
  courseVariant,
  oneOnOneBookingRequest,
  groupSession,
} from '@/lib/db/schema'
import { eq, and, gte, lte, inArray, isNull, isNotNull, sql } from 'drizzle-orm'

export const GET = withAuth(
  async (req: NextRequest, session) => {
    const tutorId = session.user.id
    const { searchParams } = new URL(req.url)
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')

    const startDate = startParam ? new Date(startParam) : new Date()
    const endDate = endParam ? new Date(endParam) : new Date()

    if (endParam) {
      endDate.setHours(23, 59, 59, 999)
    }

    // --- Primary source: CalendarEvent ---
    const calFilters = [
      eq(calendarEvent.tutorId, tutorId),
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
        sessionStatus: liveSession.status,
        sessionId: liveSession.sessionId,
        externalId: calendarEvent.externalId,
        // A 1-on-1 CalendarEvent + LiveSession is created the moment the tutor
        // ACCEPTS, before the student pays. Surface the booking status so an
        // unpaid session doesn't offer a "Start Session" into a room the student
        // can't enter. Non-1-on-1 events have no booking row → null → not pending.
        bookingStatus: oneOnOneBookingRequest.status,
        // A group session links its own CalendarEvent. A booking (1-on-1) OR a
        // group session means this is a "direct" session that lives in the shared
        // /call room — NOT a course class (which opens the course-builder classroom).
        groupSessionId: groupSession.groupSessionId,
      })
      .from(calendarEvent)
      .leftJoin(liveSession, eq(liveSession.sessionId, calendarEvent.externalId))
      .leftJoin(
        oneOnOneBookingRequest,
        eq(oneOnOneBookingRequest.calendarEventId, calendarEvent.eventId)
      )
      .leftJoin(groupSession, eq(groupSession.calendarEventId, calendarEvent.eventId))
      .where(and(...calFilters))
      .orderBy(calendarEvent.startTime)

    // --- Fallback source: LiveSession (for courses published before CalendarEvent bridge) ---
    const lsFilters = [
      eq(liveSession.tutorId, tutorId),
      inArray(liveSession.status, ['scheduled', 'active', 'preparing', 'live', 'paused']),
      // Skip orphaned sessions: a course deleted before sessions were ended on
      // delete leaves rows with courseId nulled (FK) but still 'scheduled', which
      // otherwise linger on the calendar forever. Genuine course-less sessions
      // (ad-hoc) surface via their CalendarEvent, so nothing real is hidden.
      isNotNull(liveSession.courseId),
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
      })
      .from(liveSession)
      .where(and(...lsFilters))
      .orderBy(liveSession.scheduledAt)

    // Build a set of sessionIds already covered by CalendarEvent to avoid duplicates
    const coveredSessionIds = new Set(calEvents.map(e => e.externalId).filter(Boolean) as string[])

    // Merge fallback LiveSessions that aren't already covered
    const merged = [
      ...calEvents.map(e => ({
        id: e.eventId,
        title: e.title,
        subject: e.description || 'Class',
        scheduledAt: e.startTime?.toISOString() ?? new Date().toISOString(),
        duration:
          e.endTime && e.startTime
            ? Math.round((new Date(e.endTime).getTime() - new Date(e.startTime).getTime()) / 60000)
            : 60,
        status: e.sessionStatus || 'scheduled',
        meetingUrl: e.meetingUrl,
        courseId: e.courseId,
        location: e.location,
        isVirtual: e.isVirtual,
        sessionId: e.sessionId || e.externalId,
        pendingPayment: e.bookingStatus === 'ACCEPTED',
        // 1-on-1 or group → the shared /call room, not the course-builder classroom.
        isDirectSession: !!e.bookingStatus || !!e.groupSessionId,
      })),
      ...liveSessions
        .filter(ls => !coveredSessionIds.has(ls.sessionId))
        .map(ls => ({
          id: ls.sessionId,
          title: ls.title || 'Live Session',
          subject: ls.description || 'Class',
          scheduledAt: ls.scheduledAt?.toISOString() ?? new Date().toISOString(),
          duration: ls.durationMinutes || 60,
          status: ls.status,
          meetingUrl: ls.roomUrl,
          courseId: ls.courseId,
          location: 'Online',
          isVirtual: true,
          sessionId: ls.sessionId,
          pendingPayment: false,
          // Fallback rows are course sessions (they require a non-null courseId).
          isDirectSession: false,
        })),
    ]

    // Final dedup: one logical session can surface both as a CalendarEvent and a
    // LiveSession (e.g. when CalendarEvent.externalId wasn't linked). Collapse by
    // sessionId (CalendarEvent-sourced rows come first, so they win) so the same
    // session is never emitted twice — which previously made it "conflict" with
    // its own duplicate in the calendar.
    const seenKeys = new Set<string>()
    const dedupedEvents = merged.filter(e => {
      const key = e.sessionId || e.id
      if (!key) return true
      if (seenKeys.has(key)) return false
      seenKeys.add(key)
      return true
    })

    // Fetch course names
    const courseIds = [...new Set(dedupedEvents.map(e => e.courseId).filter(Boolean))] as string[]
    const courseRows =
      courseIds.length > 0
        ? await drizzleDb
            .select({ courseId: course.courseId, name: course.name })
            .from(course)
            .where(inArray(course.courseId, courseIds))
        : []
    const courseMap = new Map(courseRows.map(c => [c.courseId, c.name]))

    // Fetch variant nationalities and categories
    const variantRows =
      courseIds.length > 0
        ? await drizzleDb
            .select({
              publishedCourseId: courseVariant.publishedCourseId,
              nationality: courseVariant.nationality,
              category: courseVariant.category,
            })
            .from(courseVariant)
            .where(inArray(courseVariant.publishedCourseId, courseIds))
        : []
    const variantMap = new Map(
      variantRows.map(v => [
        v.publishedCourseId,
        { nationality: v.nationality, category: v.category },
      ])
    )

    // Fetch session participant counts
    const sessionIds = [...new Set(dedupedEvents.map(e => e.sessionId).filter(Boolean))] as string[]
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

    const enriched = dedupedEvents.map(e => {
      const variant = e.courseId ? variantMap.get(e.courseId) : undefined
      return {
        ...e,
        courseName: e.courseId ? (courseMap.get(e.courseId) ?? undefined) : undefined,
        category: e.courseId ? (courseMap.get(e.courseId) ?? undefined) : undefined,
        nationality: variant?.nationality ?? undefined,
        variantCategory: variant?.category ?? undefined,
        enrolledCount: e.sessionId ? (participantMap.get(e.sessionId) ?? 0) : 0,
      }
    })

    // Sort by scheduledAt / startTime
    enriched.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())

    return NextResponse.json({ events: enriched })
  },
  { role: 'TUTOR' }
)
