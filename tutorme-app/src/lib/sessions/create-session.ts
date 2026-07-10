/**
 * Unified session creation service.
 *
 * LiveSession  = single source of truth for every teaching event.
 * CalendarEvent = guaranteed read-only projection for calendar rendering.
 *
 * All creation paths must call this service (no more direct inserts).
 */

import { eq, and, isNull, not } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, calendarEvent } from '@/lib/db/schema'
import { dailyProvider } from '@/lib/video/daily-provider'
import { ensureDailyWebhook } from '@/lib/video/daily-webhook'
import type { LiveSessionStatus } from '@/lib/db/schema/enums'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/lib/db/schema'

export type SessionType = 'COURSE' | 'ADHOC' | 'ONE_ON_ONE' | 'CLINIC'

export interface CreateSessionInput {
  tutorId: string
  title: string
  scheduledAt: Date
  durationMinutes: number
  category: string
  type: SessionType
  courseId?: string
  /** CourseSchedule this session is materialized from (course sessions only). */
  scheduleId?: string
  /** The lesson this session covers (its lesson-plan slot). Course sessions only. */
  lessonId?: string
  studentId?: string
  maxStudents?: number
  description?: string
  status?: LiveSessionStatus
  startedAt?: Date
  /** Defaults to 'Asia/Shanghai' */
  timezone?: string
  /** Optional: pass an existing Daily.co room if already created externally */
  existingRoom?: { id: string; url: string }
}

type DbClient = NodePgDatabase<typeof schema>

const TYPE_TO_EVENT_TYPE: Record<SessionType, 'LESSON' | 'CONSULTATION' | 'CLINIC' | 'OTHER'> = {
  COURSE: 'LESSON',
  ADHOC: 'OTHER',
  ONE_ON_ONE: 'CONSULTATION',
  CLINIC: 'CLINIC',
}

/**
 * Create a LiveSession + its CalendarEvent projection atomically.
 * Returns the created LiveSession row.
 */
export async function createSession(input: CreateSessionInput, tx?: DbClient) {
  const db = tx ?? drizzleDb
  const sessionId = crypto.randomUUID()
  const now = new Date()
  const endTime = new Date(input.scheduledAt.getTime() + input.durationMinutes * 60_000)
  const timezone = input.timezone || 'Asia/Shanghai'

  // 1. Create Daily.co room
  const room =
    input.existingRoom ??
    (await dailyProvider.createRoom(sessionId, {
      maxParticipants: input.maxStudents ?? 50,
      durationMinutes: input.durationMinutes,
    }))

  // Make sure the Daily webhook (recording + transcript) is registered. Fire-and-forget
  // so it never blocks or fails session creation.
  void ensureDailyWebhook()

  // 2. Insert LiveSession (source of truth)
  const [liveSessionRow] = await db
    .insert(liveSession)
    .values({
      sessionId,
      tutorId: input.tutorId,
      courseId: input.courseId ?? null,
      scheduleId: input.scheduleId ?? null,
      lessonId: input.lessonId ?? null,
      title: input.title,
      category: input.category,
      description: input.description ?? null,
      scheduledAt: input.scheduledAt,
      startedAt: input.startedAt ?? null,
      status: input.status ?? 'scheduled',
      roomId: room.id,
      roomUrl: room.url,
      maxStudents: input.maxStudents ?? 50,
      durationMinutes: input.durationMinutes,
    })
    .returning()

  // 3. Upsert CalendarEvent (read-only projection)
  const [calendarEventRow] = await db
    .insert(calendarEvent)
    .values({
      eventId: crypto.randomUUID(),
      tutorId: input.tutorId,
      title: input.title,
      description: input.description ?? null,
      type: TYPE_TO_EVENT_TYPE[input.type],
      status: 'CONFIRMED',
      startTime: input.scheduledAt,
      endTime,
      timezone,
      isAllDay: false,
      isRecurring: false,
      isVirtual: true,
      meetingUrl: room.url,
      courseId: input.courseId ?? null,
      studentId: input.studentId ?? null,
      attendees: input.studentId ? [input.studentId] : [],
      maxAttendees: input.maxStudents ?? 50,
      reminders: [15, 60],
      createdBy: input.tutorId,
      externalId: sessionId,
      isCancelled: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  return { liveSession: liveSessionRow, calendarEvent: calendarEventRow }
}

/**
 * Backfill missing CalendarEvent rows for existing LiveSessions.
 * Use this in a one-off migration / script.
 */
export async function backfillCalendarEventsForLiveSessions(
  opts: { dryRun?: boolean; limit?: number } = {}
) {
  const { dryRun = true, limit = 1000 } = opts

  const orphaned = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      tutorId: liveSession.tutorId,
      courseId: liveSession.courseId,
      title: liveSession.title,
      category: liveSession.category,
      description: liveSession.description,
      scheduledAt: liveSession.scheduledAt,
      durationMinutes: liveSession.durationMinutes,
      roomUrl: liveSession.roomUrl,
      maxStudents: liveSession.maxStudents,
      status: liveSession.status,
    })
    .from(liveSession)
    .leftJoin(calendarEvent, eq(calendarEvent.externalId, liveSession.sessionId))
    .where(and(isNull(calendarEvent.eventId), not(eq(liveSession.status, 'ended'))))
    .limit(limit)

  const results: Array<{ sessionId: string; eventId: string; dryRun: boolean }> = []

  for (const ls of orphaned) {
    if (!ls.scheduledAt) continue

    const endTime = new Date(ls.scheduledAt.getTime() + (ls.durationMinutes ?? 120) * 60_000)
    const eventType: 'LESSON' | 'CONSULTATION' | 'CLINIC' | 'OTHER' = ls.courseId
      ? 'LESSON'
      : 'OTHER'

    if (dryRun) {
      results.push({
        sessionId: ls.sessionId,
        eventId: `dry-run-${crypto.randomUUID()}`,
        dryRun: true,
      })
      continue
    }

    const [ce] = await drizzleDb
      .insert(calendarEvent)
      .values({
        eventId: crypto.randomUUID(),
        tutorId: ls.tutorId,
        title: ls.title,
        description: ls.description,
        type: eventType,
        status: 'CONFIRMED',
        startTime: ls.scheduledAt,
        endTime,
        timezone: 'Asia/Shanghai',
        isAllDay: false,
        isRecurring: false,
        isVirtual: true,
        meetingUrl: ls.roomUrl,
        courseId: ls.courseId,
        maxAttendees: ls.maxStudents ?? 50,
        reminders: [15, 60],
        createdBy: ls.tutorId,
        externalId: ls.sessionId,
        isCancelled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()

    results.push({ sessionId: ls.sessionId, eventId: ce.eventId, dryRun: false })
  }

  return { count: results.length, rows: results }
}
