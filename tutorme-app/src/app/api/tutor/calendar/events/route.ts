/**
 * GET /api/tutor/calendar/events
 * Returns calendar events for the current tutor.
 * Queries CalendarEvent table (primary) and LiveSession (fallback) to ensure
 * sessions are always visible even if CalendarEvent rows are missing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { calendarEvent, liveSession } from '@/lib/db/schema'
import { eq, and, gte, lte, inArray, isNull } from 'drizzle-orm'

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
      })
      .from(calendarEvent)
      .leftJoin(liveSession, eq(liveSession.sessionId, calendarEvent.externalId))
      .where(and(...calFilters))
      .orderBy(calendarEvent.startTime)

    // --- Fallback source: LiveSession (for courses published before CalendarEvent bridge) ---
    const lsFilters = [
      eq(liveSession.tutorId, tutorId),
      inArray(liveSession.status, ['scheduled', 'active', 'preparing', 'live', 'paused']),
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
    const coveredSessionIds = new Set(
      calEvents.map(e => e.externalId).filter(Boolean) as string[]
    )

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
        sessionId: e.sessionId,
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
        })),
    ]

    // Sort by scheduledAt / startTime
    merged.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())

    return NextResponse.json({ events: merged })
  },
  { role: 'TUTOR' }
)
