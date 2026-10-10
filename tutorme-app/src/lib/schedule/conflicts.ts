/**
 * Shared conflict detection and recommendation utilities for scheduling.
 * Used across APIs to ensure consistent overlap checking and alternative slot suggestions.
 */

import { drizzleDb } from '@/lib/db/drizzle'
import {
  liveSession,
  calendarEvent,
  oneOnOneBookingRequest,
  calendarAvailability,
  calendarException,
  profile,
} from '@/lib/db/schema'
import { eq, and, or, gte, lte, lt, gt, isNull, inArray, ne } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/lib/db/schema'
import { bookingInstants, slotInstants } from '@/lib/one-on-one/time'
import { formatInZone, zonedDateParts, zonedWallClockToUtc, zonedWeekday } from '@/lib/time/tz'

export interface ConflictResult {
  type: 'live_session' | 'calendar_event' | 'one_on_one'
  id: string
  title: string
  startTime: Date
  endTime: Date
}

export interface AlternativeSlot {
  date: string
  startTime: string
  endTime: string
}

/**
 * Check for overlapping scheduled items for a tutor in a time range.
 * Queries liveSession, calendarEvent, and oneOnOneBookingRequest tables.
 *
 * `db` lets callers inside a transaction pass their tx handle so rows written
 * earlier in the same transaction are visible to conflict detection; it
 * defaults to the module-level pool client.
 */
export async function findConflicts(
  tutorId: string,
  startArg: Date,
  endArg: Date,
  options: {
    excludeEventId?: string
    excludeSessionId?: string
    excludeOneOnOneId?: string
    /** Minutes of gap to require around the slot: an existing session within
     *  this many minutes of [startArg, endArg] counts as a conflict. */
    bufferMinutes?: number
  } = {},
  db: NodePgDatabase<typeof schema> = drizzleDb
): Promise<ConflictResult[]> {
  const conflicts: ConflictResult[] = []
  // Expand the window by the buffer so back-to-back / too-close bookings are
  // caught as conflicts (buffer 0 = exact overlap only).
  const bufferMs = Math.max(0, options.bufferMinutes ?? 0) * 60_000
  const start = new Date(startArg.getTime() - bufferMs)
  const end = new Date(endArg.getTime() + bufferMs)

  // 1. Overlapping live sessions (exclude schedule-less Go Live demo rooms)
  const liveSessionConditions = [
    eq(liveSession.tutorId, tutorId),
    inArray(liveSession.status, ['scheduled', 'active', 'preparing', 'live', 'paused']),
    // Overlap: session.scheduledAt < end AND (session.scheduledAt + duration) > start
    lt(liveSession.scheduledAt, end),
    ne(liveSession.sessionType, 'GO_LIVE_DEMO'),
  ]
  if (options.excludeSessionId) {
    liveSessionConditions.push(ne(liveSession.sessionId, options.excludeSessionId))
  }

  const liveSessions = await db
    .select({
      sessionId: liveSession.sessionId,
      title: liveSession.title,
      scheduledAt: liveSession.scheduledAt,
      durationMinutes: liveSession.durationMinutes,
    })
    .from(liveSession)
    .where(and(...liveSessionConditions))

  for (const ls of liveSessions) {
    if (!ls.scheduledAt) continue
    const lsStart = new Date(ls.scheduledAt)
    const lsEnd = new Date(lsStart.getTime() + (ls.durationMinutes ?? 60) * 60000)
    // Proper overlap check
    if (lsStart < end && lsEnd > start) {
      conflicts.push({
        type: 'live_session',
        id: ls.sessionId,
        title: ls.title || 'Live Session',
        startTime: lsStart,
        endTime: lsEnd,
      })
    }
  }

  // 2. Overlapping calendar events
  const eventConditions = [
    eq(calendarEvent.tutorId, tutorId),
    isNull(calendarEvent.deletedAt),
    eq(calendarEvent.isCancelled, false),
    lt(calendarEvent.startTime, end),
    gt(calendarEvent.endTime, start),
  ]
  if (options.excludeEventId) {
    eventConditions.push(ne(calendarEvent.eventId, options.excludeEventId))
  }

  // Calendar events are read-only projections of live sessions (externalId =
  // sessionId). An event whose source session has ENDED is historical, not a
  // future commitment — it must not block new bookings, just as the ended
  // session itself is excluded from the live-session check above. Without
  // this, retiring a future session (e.g. for re-materialization) would leave
  // its orphaned event behind as a permanent conflict on that slot.
  const events = await db
    .select({
      eventId: calendarEvent.eventId,
      title: calendarEvent.title,
      startTime: calendarEvent.startTime,
      endTime: calendarEvent.endTime,
    })
    .from(calendarEvent)
    .leftJoin(liveSession, eq(calendarEvent.externalId, liveSession.sessionId))
    .where(
      and(...eventConditions, or(isNull(liveSession.sessionId), ne(liveSession.status, 'ended')))
    )

  for (const ev of events) {
    conflicts.push({
      type: 'calendar_event',
      id: ev.eventId,
      title: ev.title || 'Calendar Event',
      startTime: new Date(ev.startTime),
      endTime: new Date(ev.endTime),
    })
  }

  // 3. Overlapping one-on-one bookings.
  // requestedDate is midnight-UTC of the booking's calendar date, but the real
  // instant depends on the booking's own timezone — so a booking whose UTC date
  // sits just outside [start, end] can still overlap once its wall-clock time is
  // resolved in a far-off zone. Pre-filter by UTC date widened ±1 day, then do
  // exact instant overlap in JS via bookingInstants().
  const rangeStartDay = new Date(new Date(start.toISOString().split('T')[0]).getTime() - 86_400_000)
  const rangeEndDay = new Date(new Date(end.toISOString().split('T')[0]).getTime() + 86_400_000)
  const oneOnOneConditions = [
    eq(oneOnOneBookingRequest.tutorId, tutorId),
    inArray(oneOnOneBookingRequest.status, ['ACCEPTED', 'PAID']),
    gte(oneOnOneBookingRequest.requestedDate, rangeStartDay),
    lte(oneOnOneBookingRequest.requestedDate, rangeEndDay),
  ]
  if (options.excludeOneOnOneId) {
    oneOnOneConditions.push(ne(oneOnOneBookingRequest.requestId, options.excludeOneOnOneId))
  }

  const oneOnOnes = await db
    .select({
      requestId: oneOnOneBookingRequest.requestId,
      requestedDate: oneOnOneBookingRequest.requestedDate,
      startTime: oneOnOneBookingRequest.startTime,
      endTime: oneOnOneBookingRequest.endTime,
      timezone: oneOnOneBookingRequest.timezone,
    })
    .from(oneOnOneBookingRequest)
    .where(and(...oneOnOneConditions))

  for (const oo of oneOnOnes) {
    const { start: ooStart, end: ooEnd } = bookingInstants(oo)
    if (ooStart < end && ooEnd > start) {
      conflicts.push({
        type: 'one_on_one',
        id: oo.requestId,
        title: 'One-on-One Booking',
        startTime: ooStart,
        endTime: ooEnd,
      })
    }
  }

  return conflicts
}

/**
 * Find alternative time slots for a given duration, respecting tutor availability
 * and avoiding all conflicts (live sessions, calendar events, one-on-ones).
 *
 * Everything is computed in the TUTOR's timezone (per availability-row zone,
 * profile timezone as fallback) — the previous server-local/UTC mix suggested
 * times in the wrong frame on any host whose zone isn't the tutor's.
 */
export async function findAlternativeSlots(
  tutorId: string,
  start: Date,
  durationMinutes: number,
  options: {
    maxSuggestions?: number
    searchDays?: number
    sameDayOfWeek?: boolean
    excludeEventId?: string
    excludeSessionId?: string
    excludeOneOnOneId?: string
  } = {}
): Promise<AlternativeSlot[]> {
  const {
    maxSuggestions = 3,
    searchDays = 14,
    sameDayOfWeek = false,
    excludeEventId,
    excludeSessionId,
    excludeOneOnOneId,
  } = options

  const [tutorProfile] = await drizzleDb
    .select({ timezone: profile.timezone })
    .from(profile)
    .where(eq(profile.userId, tutorId))
    .limit(1)
  const timeZone = tutorProfile?.timezone ?? 'UTC'

  const availabilityRows = await drizzleDb
    .select({
      dayOfWeek: calendarAvailability.dayOfWeek,
      startTime: calendarAvailability.startTime,
      endTime: calendarAvailability.endTime,
      timezone: calendarAvailability.timezone,
    })
    .from(calendarAvailability)
    .where(
      and(eq(calendarAvailability.tutorId, tutorId), eq(calendarAvailability.isAvailable, true))
    )

  // Exceptions are stored as UTC midnights; fetch a window widened ±2 days
  // around the search range so zone-local date matching can't miss DST edges.
  const DAY_MS = 86_400_000
  const windowStart = new Date(start.getTime() - 3 * DAY_MS)
  const windowEnd = new Date(start.getTime() + (searchDays + 2) * DAY_MS)
  const exceptionRows = await drizzleDb
    .select({
      date: calendarException.date,
      isAvailable: calendarException.isAvailable,
      startTime: calendarException.startTime,
      endTime: calendarException.endTime,
    })
    .from(calendarException)
    .where(
      and(
        eq(calendarException.tutorId, tutorId),
        gte(calendarException.date, windowStart),
        lte(calendarException.date, windowEnd)
      )
    )

  return suggestAlternativeSlots(
    {
      availability: availabilityRows,
      exceptions: exceptionRows,
      start,
      durationMinutes,
      maxSuggestions,
      searchDays,
      sameDayOfWeek,
      timeZone,
      now: new Date(),
    },
    async (candidateStart, candidateEnd) => {
      const conflicts = await findConflicts(tutorId, candidateStart, candidateEnd, {
        excludeEventId,
        excludeSessionId,
        excludeOneOnOneId,
      })
      if (conflicts.length === 0) return null
      return conflicts.reduce(
        (min, c) => (c.endTime.getTime() < min.getTime() ? c.endTime : min),
        candidateEnd
      )
    }
  )
}

export interface SuggestAvailabilityRow {
  dayOfWeek: number
  startTime: string
  endTime: string
  timezone?: string | null
}

export interface SuggestExceptionRow {
  date: Date
  isAvailable: boolean
  startTime: string | null
  endTime: string | null
}

export interface SuggestAlternativeSlotsCore {
  /** Weekly availability blocks, wall-clock times in each row's own timezone. */
  availability: SuggestAvailabilityRow[]
  /** Date-specific exceptions (UTC-midnight dates). */
  exceptions: SuggestExceptionRow[]
  /** The original slot's UTC instant (used for the sameDayOfWeek filter and skip). */
  start: Date
  durationMinutes: number
  maxSuggestions: number
  searchDays: number
  sameDayOfWeek: boolean
  /** Fallback timezone for rows/blocks without their own zone. */
  timeZone: string
  now: Date
}

function hhmmOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart
}

/**
 * Pure candidate-slot search, pinned to ONE frame: the tutor's timezone.
 * Mirrors the day-walk of generateTutorAvailableSlots (tutor-available-slots.ts):
 * UTC cursor in 24h steps, each day resolved to the tutor's wall calendar via
 * the tz helpers; availability HH:MM strings are interpreted with slotInstants
 * (DST-aware), so results are identical regardless of the host's timezone.
 *
 * `conflictEnd` must return the earliest conflicting commitment's end instant,
 * or null when the candidate is free. Returns tutor-local wall-clock strings.
 */
export async function suggestAlternativeSlots(
  core: SuggestAlternativeSlotsCore,
  conflictEnd: (start: Date, end: Date) => Promise<Date | null>
): Promise<AlternativeSlot[]> {
  const {
    availability,
    exceptions,
    start,
    durationMinutes,
    maxSuggestions,
    searchDays,
    sameDayOfWeek,
    timeZone,
    now,
  } = core
  const suggestions: AlternativeSlot[] = []
  const durationMs = durationMinutes * 60000
  const DAY_MS = 86_400_000

  // Search starts the day before the original slot, at tutor-local midnight.
  const firstDay = zonedDateParts(new Date(start.getTime() - DAY_MS), timeZone)
  const searchStart = zonedWallClockToUtc(
    firstDay.year,
    firstDay.month,
    firstDay.day,
    0,
    0,
    timeZone
  )
  const searchEnd = new Date(searchStart.getTime() + searchDays * DAY_MS)
  const targetWeekday = zonedWeekday(start, timeZone)

  for (
    let cursor = searchStart;
    cursor <= searchEnd;
    cursor = new Date(cursor.getTime() + DAY_MS)
  ) {
    if (suggestions.length >= maxSuggestions) break

    const dateStr = formatInZone(cursor, timeZone).date
    const dayOfWeek = zonedWeekday(cursor, timeZone)

    if (sameDayOfWeek && dayOfWeek !== targetWeekday) continue

    const dayExceptions = exceptions.filter(e => formatInZone(e.date, timeZone).date === dateStr)

    // Whole-day block exception
    if (dayExceptions.some(e => !e.isAvailable && !e.startTime && !e.endTime)) continue

    const dayAvailability = availability.filter(a => a.dayOfWeek === dayOfWeek)

    for (const slot of dayAvailability) {
      if (suggestions.length >= maxSuggestions) break

      // The block's wall-clock times live in its own zone; output strings are
      // formatted in that same zone so they mean what the tutor reads.
      const blockZone = slot.timezone ?? timeZone
      const { start: slotStartUtc, end: slotEndUtc } = slotInstants(
        dateStr,
        slot.startTime,
        slot.endTime,
        blockZone
      )

      // Skip blocks fully in the past
      if (slotEndUtc <= now) continue

      let tryStart = new Date(slotStartUtc)
      while (tryStart.getTime() + durationMs <= slotEndUtc.getTime()) {
        if (suggestions.length >= maxSuggestions) break

        const tryEnd = new Date(tryStart.getTime() + durationMs)

        // Never suggest a slot that has already passed
        if (tryEnd <= now) {
          tryStart = new Date(tryStart.getTime() + 30 * 60000)
          continue
        }

        // Skip the original time
        if (
          Math.abs(tryStart.getTime() - start.getTime()) < 60000 &&
          Math.abs(tryEnd.getTime() - (start.getTime() + durationMs)) < 60000
        ) {
          tryStart = new Date(tryStart.getTime() + 30 * 60000)
          continue
        }

        // Time-level block exception (wall-clock comparison in the block zone)
        const tryStartHhmm = formatInZone(tryStart, blockZone).time
        const tryEndHhmm = formatInZone(tryEnd, blockZone).time
        const timeBlocked = dayExceptions.some(
          e =>
            !e.isAvailable &&
            !!e.startTime &&
            !!e.endTime &&
            hhmmOverlap(tryStartHhmm, tryEndHhmm, e.startTime, e.endTime)
        )
        if (timeBlocked) {
          tryStart = new Date(tryStart.getTime() + 30 * 60000)
          continue
        }

        const conflictEndAt = await conflictEnd(tryStart, tryEnd)
        if (conflictEndAt === null) {
          suggestions.push({
            date: formatInZone(tryStart, blockZone).date,
            startTime: formatInZone(tryStart, blockZone).time,
            endTime: formatInZone(tryEnd, blockZone).time,
          })
          break
        }

        // Advance past the conflict, always making forward progress
        tryStart = new Date(Math.max(conflictEndAt.getTime(), tryStart.getTime() + 30 * 60000))
      }
    }
  }

  return suggestions
}
