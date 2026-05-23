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
} from '@/lib/db/schema'
import { eq, and, or, gte, lte, lt, gt, isNull, inArray, ne } from 'drizzle-orm'

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
 */
export async function findConflicts(
  tutorId: string,
  start: Date,
  end: Date,
  options: {
    excludeEventId?: string
    excludeSessionId?: string
    excludeOneOnOneId?: string
  } = {}
): Promise<ConflictResult[]> {
  const conflicts: ConflictResult[] = []

  // 1. Overlapping live sessions
  const liveSessionConditions = [
    eq(liveSession.tutorId, tutorId),
    inArray(liveSession.status, ['scheduled', 'active', 'preparing', 'live', 'paused']),
    // Overlap: session.scheduledAt < end AND (session.scheduledAt + duration) > start
    lt(liveSession.scheduledAt, end),
  ]
  if (options.excludeSessionId) {
    liveSessionConditions.push(ne(liveSession.sessionId, options.excludeSessionId))
  }

  const liveSessions = await drizzleDb
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

  const events = await drizzleDb
    .select({
      eventId: calendarEvent.eventId,
      title: calendarEvent.title,
      startTime: calendarEvent.startTime,
      endTime: calendarEvent.endTime,
    })
    .from(calendarEvent)
    .where(and(...eventConditions))

  for (const ev of events) {
    conflicts.push({
      type: 'calendar_event',
      id: ev.eventId,
      title: ev.title || 'Calendar Event',
      startTime: new Date(ev.startTime),
      endTime: new Date(ev.endTime),
    })
  }

  // 3. Overlapping one-on-one bookings
  const oneOnOneConditions = [
    eq(oneOnOneBookingRequest.tutorId, tutorId),
    inArray(oneOnOneBookingRequest.status, ['ACCEPTED', 'PAID']),
    // requestedDate is a date; we approximate by checking if the booking date is within the range
    gte(oneOnOneBookingRequest.requestedDate, new Date(start.toISOString().split('T')[0])),
    lte(oneOnOneBookingRequest.requestedDate, new Date(end.toISOString().split('T')[0])),
  ]
  if (options.excludeOneOnOneId) {
    oneOnOneConditions.push(ne(oneOnOneBookingRequest.requestId, options.excludeOneOnOneId))
  }

  const oneOnOnes = await drizzleDb
    .select({
      requestId: oneOnOneBookingRequest.requestId,
      requestedDate: oneOnOneBookingRequest.requestedDate,
      startTime: oneOnOneBookingRequest.startTime,
      endTime: oneOnOneBookingRequest.endTime,
    })
    .from(oneOnOneBookingRequest)
    .where(and(...oneOnOneConditions))

  for (const oo of oneOnOnes) {
    const dateStr = oo.requestedDate.toISOString().split('T')[0]
    const ooStart = new Date(`${dateStr}T${oo.startTime}:00`)
    const ooEnd = new Date(`${dateStr}T${oo.endTime}:00`)
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

  const suggestions: AlternativeSlot[] = []
  const durationMs = durationMinutes * 60000

  const searchStart = new Date(start)
  searchStart.setDate(searchStart.getDate() - 1)
  searchStart.setHours(0, 0, 0, 0)

  const searchEnd = new Date(searchStart)
  searchEnd.setDate(searchEnd.getDate() + searchDays)

  // Get tutor availability
  const availabilityRows = await drizzleDb
    .select()
    .from(calendarAvailability)
    .where(
      and(
        eq(calendarAvailability.tutorId, tutorId),
        eq(calendarAvailability.isAvailable, true)
      )
    )

  // Get exceptions in range
  const exceptions = await drizzleDb
    .select()
    .from(calendarException)
    .where(
      and(
        eq(calendarException.tutorId, tutorId),
        gte(calendarException.date, searchStart),
        lte(calendarException.date, searchEnd)
      )
    )

  const cursor = new Date(searchStart)

  while (cursor <= searchEnd && suggestions.length < maxSuggestions) {
    const dateStr = cursor.toISOString().split('T')[0]
    const dayOfWeek = cursor.getDay()

    if (sameDayOfWeek && dayOfWeek !== start.getDay()) {
      cursor.setDate(cursor.getDate() + 1)
      continue
    }

    // Check day-level exception
    const dayException = exceptions.find(
      e => e.date.toISOString().split('T')[0] === dateStr && !e.isAvailable
    )
    if (dayException) {
      cursor.setDate(cursor.getDate() + 1)
      continue
    }

    // Get availability for this day
    const dayAvailability = availabilityRows.filter(a => a.dayOfWeek === dayOfWeek)

    for (const slot of dayAvailability) {
      if (suggestions.length >= maxSuggestions) break

      const slotStart = new Date(`${dateStr}T${slot.startTime}`)
      const slotEnd = new Date(`${dateStr}T${slot.endTime}`)

      // Skip past slots
      if (slotEnd <= new Date()) continue

      // Check time-level exception
      const timeException = exceptions.find(e => {
        if (e.date.toISOString().split('T')[0] !== dateStr) return false
        if (!e.startTime || !e.endTime) return false
        const exStart = new Date(`${dateStr}T${e.startTime}`)
        const exEnd = new Date(`${dateStr}T${e.endTime}`)
        return slotStart < exEnd && slotEnd > exStart
      })
      if (timeException) continue

      // Try to fit the requested duration within this availability slot
      let tryStart = new Date(slotStart)
      while (tryStart.getTime() + durationMs <= slotEnd.getTime()) {
        if (suggestions.length >= maxSuggestions) break

        const tryEnd = new Date(tryStart.getTime() + durationMs)

        // Skip the original time
        if (
          Math.abs(tryStart.getTime() - start.getTime()) < 60000 &&
          Math.abs(tryEnd.getTime() - (start.getTime() + durationMs)) < 60000
        ) {
          tryStart.setMinutes(tryStart.getMinutes() + 30)
          continue
        }

        // Check for conflicts
        const conflicts = await findConflicts(tutorId, tryStart, tryEnd, {
          excludeEventId,
          excludeSessionId,
          excludeOneOnOneId,
        })

        if (conflicts.length === 0) {
          suggestions.push({
            date: dateStr,
            startTime: tryStart.toTimeString().slice(0, 5),
            endTime: tryEnd.toTimeString().slice(0, 5),
          })
          break
        }

        // Advance past the conflict
        const earliestConflictEnd = conflicts.reduce(
          (min, c) => (c.endTime.getTime() < min.getTime() ? c.endTime : min),
          tryEnd
        )
        tryStart = new Date(earliestConflictEnd)
      }
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  return suggestions
}
