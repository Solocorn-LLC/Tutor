/**
 * Materialize a course's weekly schedule into real LiveSession + CalendarEvent
 * rows so it shows on the tutor/student calendars.
 *
 * The full publish flow (`/api/tutor/courses/[id]/publish`) does this inline with
 * availability/conflict checks. The lighter "add a schedule" entry points (the
 * dashboard ScheduleViewModal → `POST /api/tutor/courses/[id]/schedules`) only
 * persisted the CourseSchedule pattern and never created sessions, so the schedule
 * never reached the calendar. This shared helper closes that gap.
 */

import { and, eq, gt, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, calendarEvent } from '@/lib/db/schema'
import { zonedWallClockToUtc, zonedWeekday, zonedDateParts } from '@/lib/time/tz'
import { createSession } from './create-session'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/lib/db/schema'

const DAY_MAP: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

export interface ScheduleSlotInput {
  dayOfWeek: string
  startTime: string
  durationMinutes?: number
  /** Expanded slots carry a concrete `YYYY-MM-DD`; pure weekly patterns don't. */
  date?: string
}

/**
 * Generate the future session instants for a schedule, in the tutor's timezone.
 * Mirrors the publish route's generateSessionDates: honours per-slot dates when
 * present, otherwise repeats the weekday for `weeksAhead` weeks, and skips any
 * instant within the next hour.
 */
export function generateScheduleSessionDates(
  schedule: ScheduleSlotInput[],
  weeksAhead = 8,
  timeZone = 'UTC'
): Array<{ scheduledAt: Date; durationMinutes: number }> {
  const sessions: Array<{ scheduledAt: Date; durationMinutes: number }> = []
  const cutoffMs = Date.now() + 60 * 60 * 1000 // skip sessions within the next hour

  const addDays = (year: number, month: number, day: number, n: number) => {
    const t = new Date(Date.UTC(year, month - 1, day + n))
    return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }
  }

  for (const slot of schedule) {
    const targetDay = DAY_MAP[slot.dayOfWeek]
    if (targetDay === undefined) continue

    const timeParts = (slot.startTime ?? '').split(':')
    if (timeParts.length !== 2) continue
    const hours = parseInt(timeParts[0], 10)
    const minutes = parseInt(timeParts[1], 10)
    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    )
      continue

    const durationMinutes = slot.durationMinutes || 60

    if (slot.date) {
      const [year, month, day] = slot.date.split('-').map(Number)
      if (!year || !month || !day) continue
      const sessionDate = zonedWallClockToUtc(year, month, day, hours, minutes, timeZone)
      if (isNaN(sessionDate.getTime())) continue
      if (sessionDate.getTime() < cutoffMs) continue
      sessions.push({ scheduledAt: sessionDate, durationMinutes })
      continue
    }

    // Next occurrence of this weekday in the tutor's timezone.
    const now = new Date()
    const todayZ = zonedDateParts(now, timeZone)
    const todayWeekday = zonedWeekday(now, timeZone)
    const daysUntil = (targetDay - todayWeekday + 7) % 7
    let occ = addDays(todayZ.year, todayZ.month, todayZ.day, daysUntil)
    let first = zonedWallClockToUtc(occ.year, occ.month, occ.day, hours, minutes, timeZone)
    if (first.getTime() < cutoffMs) {
      occ = addDays(occ.year, occ.month, occ.day, 7)
      first = zonedWallClockToUtc(occ.year, occ.month, occ.day, hours, minutes, timeZone)
    }

    for (let w = 0; w < weeksAhead; w++) {
      const wk = addDays(occ.year, occ.month, occ.day, w * 7)
      const sessionDate = zonedWallClockToUtc(wk.year, wk.month, wk.day, hours, minutes, timeZone)
      if (isNaN(sessionDate.getTime())) continue
      sessions.push({ scheduledAt: sessionDate, durationMinutes })
    }
  }

  sessions.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  return sessions
}

export interface MaterializeScheduleOptions {
  tutorId: string
  courseId: string
  scheduleId: string
  slots: ScheduleSlotInput[]
  weeksToSchedule?: number
  /** Tutor's timezone (from calendarAvailability); defaults to UTC. */
  timezone?: string
  maxStudents?: number | null
  title: string
  category: string
  description?: string | null
}

/**
 * Create LiveSession + CalendarEvent rows for every future occurrence of a
 * schedule. Returns the number of sessions created.
 */
export async function materializeScheduleSessions(
  opts: MaterializeScheduleOptions,
  tx?: NodePgDatabase<typeof schema>
): Promise<number> {
  const dates = generateScheduleSessionDates(
    opts.slots,
    opts.weeksToSchedule ?? 8,
    opts.timezone ?? 'UTC'
  )

  let created = 0
  for (const d of dates) {
    await createSession(
      {
        tutorId: opts.tutorId,
        title: opts.title,
        scheduledAt: d.scheduledAt,
        durationMinutes: d.durationMinutes,
        category: opts.category,
        type: 'COURSE',
        courseId: opts.courseId,
        scheduleId: opts.scheduleId,
        description: opts.description ?? undefined,
        status: 'scheduled',
        maxStudents: opts.maxStudents ?? 50,
        timezone: 'UTC',
      },
      tx
    )
    created++
  }
  return created
}

/**
 * Retire the FUTURE, not-yet-started sessions materialized from a schedule so
 * they leave the calendar — used when a schedule's times change (before
 * re-materializing) or when a schedule is removed. Past/active sessions are
 * left untouched. Soft-retires (status 'ended' + calendarEvent cancelled) rather
 * than hard-deleting, to avoid touching rows other tables may reference.
 * Returns the number of sessions retired.
 */
export async function clearFutureScheduleSessions(scheduleId: string): Promise<number> {
  const now = new Date()
  const future = await drizzleDb
    .select({ sessionId: liveSession.sessionId })
    .from(liveSession)
    .where(
      and(
        eq(liveSession.scheduleId, scheduleId),
        eq(liveSession.status, 'scheduled'),
        gt(liveSession.scheduledAt, now)
      )
    )
  if (future.length === 0) return 0
  const ids = future.map(s => s.sessionId)
  await drizzleDb
    .update(liveSession)
    .set({ status: 'ended', endedAt: now })
    .where(inArray(liveSession.sessionId, ids))
  await drizzleDb
    .update(calendarEvent)
    .set({ isCancelled: true, deletedAt: now })
    .where(inArray(calendarEvent.externalId, ids))
  return ids.length
}
