/**
 * Centralized tutor availability / slot generation.
 *
 * This is the single source of truth for "when is a tutor available for a
 * 1-on-1 (or any bookable session)?". It is used by:
 * - the public availability feed
 * - the 1-on-1 booking request validator
 * - the 1-on-1 accept/reschedule validator
 *
 * It combines the tutor's recurring `CalendarAvailability`, date-specific
 * `CalendarException`s, and existing commitments (`LiveSession`, `CalendarEvent`,
 * accepted/paid `OneOnOneBookingRequest`s) to return the actual bookable slots
 * in the tutor's own timezone.
 */

import { drizzleDb } from '@/lib/db/drizzle'
import {
  calendarAvailability,
  calendarException,
  profile,
} from '@/lib/db/schema'
import { eq, and, or, gte, lte, isNull } from 'drizzle-orm'
import { findConflicts } from '@/lib/schedule/conflicts'
import {
  formatInZone,
  zonedDateParts,
  zonedWeekday,
  zonedWallClockToUtc,
} from '@/lib/time/tz'
import { slotInstants } from '@/lib/one-on-one/time'

export interface TutorAvailableSlot {
  date: string // YYYY-MM-DD in tutor timezone
  startTime: string // HH:MM
  endTime: string // HH:MM
  dayOfWeek: number // 0=Sun .. 6=Sat, in tutor timezone
  timezone: string
}

export interface GenerateTutorAvailableSlotsOptions {
  tutorId: string
  startDate: Date
  endDate: Date
  slotDurationMinutes?: number
  bufferMinutes?: number
  timezone?: string
  includePast?: boolean
  excludeBookingRequestId?: string
  excludeSessionId?: string
  excludeEventId?: string
}

const MINUTES_PER_DAY = 24 * 60
const MS_PER_DAY = 24 * 60 * 60 * 1000

interface AvailabilityBlock {
  dayOfWeek: number
  startTime: string
  endTime: string
  timezone: string
  isAvailable: boolean
}

function parseHhmm(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

function formatHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function hhmmOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart < bEnd && aEnd > bStart
}

async function getTutorTimezone(tutorId: string, fallback?: string): Promise<string> {
  if (fallback) return fallback
  const [tutorProfile] = await drizzleDb
    .select({ timezone: profile.timezone })
    .from(profile)
    .where(eq(profile.userId, tutorId))
    .limit(1)
  return tutorProfile?.timezone ?? 'UTC'
}

type MinuteInterval = { start: number; end: number }

function subtractInterval(
  intervals: MinuteInterval[],
  toSubtract: MinuteInterval
): MinuteInterval[] {
  const out: MinuteInterval[] = []
  for (const interval of intervals) {
    if (toSubtract.end <= interval.start || toSubtract.start >= interval.end) {
      // No overlap — keep the interval as-is.
      out.push(interval)
      continue
    }
    if (toSubtract.start > interval.start) {
      out.push({ start: interval.start, end: Math.min(interval.end, toSubtract.start) })
    }
    if (toSubtract.end < interval.end) {
      out.push({ start: Math.max(interval.start, toSubtract.end), end: interval.end })
    }
  }
  return out
}

/**
 * Build the effective weekly availability for a tutor.
 *
 * Model: a tutor is available 24/7 by default (legacy behavior). Their declared
 * `CalendarAvailability` rows overlay that default. A row with `isAvailable=false`
 * blocks that window; a row with `isAvailable=true` confirms it.
 */
async function getEffectiveAvailability(
  tutorId: string,
  timezone: string
): Promise<AvailabilityBlock[]> {
  const rows = await drizzleDb
    .select()
    .from(calendarAvailability)
    .where(
      and(
        eq(calendarAvailability.tutorId, tutorId),
        or(
          isNull(calendarAvailability.validUntil),
          gte(calendarAvailability.validUntil, new Date())
        )
      )
    )

  // Start with the default 24/7 availability per day and subtract any blocked
  // windows. Available rows are already covered by the default, so they are a
  // no-op unless they come with a different timezone — we keep the default zone
  // for consistency.
  const byDay = new Map<number, MinuteInterval[]>()
  for (let day = 0; day <= 6; day += 1) {
    byDay.set(day, [{ start: 0, end: MINUTES_PER_DAY }])
  }

  for (const row of rows) {
    if (row.isAvailable !== false) continue
    const day = row.dayOfWeek
    const intervals = byDay.get(day)
    if (!intervals) continue
    byDay.set(
      day,
      subtractInterval(intervals, {
        start: parseHhmm(row.startTime),
        end: parseHhmm(row.endTime),
      })
    )
  }

  const blocks: AvailabilityBlock[] = []
  for (const [dayOfWeek, intervals] of byDay.entries()) {
    for (const interval of intervals) {
      blocks.push({
        dayOfWeek,
        startTime: formatHhmm(interval.start),
        endTime: formatHhmm(interval.end),
        timezone,
        isAvailable: true,
      })
    }
  }

  return blocks
}

/**
 * Return the tutor's bookable slots between `startDate` and `endDate` (UTC
 * bounds). Slots are expressed in the tutor's wall-clock timezone and are
 * guaranteed not to overlap existing commitments or fall outside declared
 * availability.
 */
export async function generateTutorAvailableSlots(
  options: GenerateTutorAvailableSlotsOptions
): Promise<TutorAvailableSlot[]> {
  const {
    tutorId,
    startDate,
    endDate,
    slotDurationMinutes = 60,
    bufferMinutes,
    timezone,
    includePast = false,
    excludeBookingRequestId,
    excludeSessionId,
    excludeEventId,
  } = options

  const [tutorProfile] = await drizzleDb
    .select({ timezone: profile.timezone, bufferMinutes: profile.bufferMinutes })
    .from(profile)
    .where(eq(profile.userId, tutorId))
    .limit(1)

  const tutorTz = timezone ?? tutorProfile?.timezone ?? 'UTC'
  const effectiveBuffer = bufferMinutes ?? tutorProfile?.bufferMinutes ?? 0

  const availability = await getEffectiveAvailability(tutorId, tutorTz)

  // Date-specific overrides for the requested window.
  const exceptions = await drizzleDb
    .select()
    .from(calendarException)
    .where(
      and(
        eq(calendarException.tutorId, tutorId),
        gte(calendarException.date, startDate),
        lte(calendarException.date, endDate)
      )
    )

  const now = new Date()
  const durationMinutes = Math.max(1, slotDurationMinutes)
  const slots: TutorAvailableSlot[] = []

  // 3. Walk each UTC day in the requested range and resolve it to the tutor's
  //    local calendar day.
  let cursor = new Date(startDate)
  while (cursor <= endDate) {
    const { year, month, day } = zonedDateParts(cursor, tutorTz)
    const dateStr = `${String(year).padStart(2, '0')}-${String(month).padStart(2, '0')}-${String(
      day
    ).padStart(2, '0')}`
    const dayOfWeek = zonedWeekday(cursor, tutorTz)

    const normalizedExceptions = exceptions
      .filter(e => formatInZone(e.date, tutorTz).date === dateStr)
      .map(e => ({
        ...e,
        localDate: formatInZone(e.date, tutorTz).date,
      }))

    // Whole-day block exception (isAvailable=false, no times).
    const dayBlocked = normalizedExceptions.some(e => !e.isAvailable && !e.startTime && !e.endTime)
    if (!dayBlocked) {
      const dayAvailability = availability.filter(a => a.dayOfWeek === dayOfWeek)

      for (const block of dayAvailability) {
        const blockStartMin = parseHhmm(block.startTime)
        const blockEndMin = Math.min(MINUTES_PER_DAY, parseHhmm(block.endTime))

        for (
          let startMin = blockStartMin;
          startMin + durationMinutes <= blockEndMin;
          startMin += durationMinutes
        ) {
          const candidateStartTime = formatHhmm(startMin)
          const candidateEndTime = formatHhmm(startMin + durationMinutes)

          const { start: candidateStartUtc, end: candidateEndUtc } = slotInstants(
            dateStr,
            candidateStartTime,
            candidateEndTime,
            block.timezone ?? tutorTz
          )

          if (!includePast && candidateEndUtc <= now) {
            continue
          }

          // Time-level exception blocking this candidate?
          const timeBlocked = normalizedExceptions.some(
            e =>
              !e.isAvailable &&
              e.startTime &&
              e.endTime &&
              hhmmOverlap(candidateStartTime, candidateEndTime, e.startTime, e.endTime)
          )
          if (timeBlocked) {
            continue
          }

          const conflicts = await findConflicts(tutorId, candidateStartUtc, candidateEndUtc, {
            bufferMinutes: effectiveBuffer,
            excludeOneOnOneId: excludeBookingRequestId,
            excludeSessionId,
            excludeEventId,
          })
          if (conflicts.length > 0) {
            continue
          }

          slots.push({
            date: dateStr,
            startTime: candidateStartTime,
            endTime: candidateEndTime,
            dayOfWeek,
            timezone: block.timezone ?? tutorTz,
          })
        }
      }
    }

    cursor = new Date(cursor.getTime() + MS_PER_DAY)
  }

  return slots
}

export interface CheckTutorAvailabilityOptions {
  tutorId: string
  date: string // YYYY-MM-DD
  startTime: string // HH:MM
  endTime: string // HH:MM
  timezone?: string
}

/**
 * Check whether a proposed wall-clock slot falls within the tutor's declared
 * weekly availability and is not blocked by a date-specific exception.
 *
 * This intentionally does NOT check existing session conflicts — use
 * `findConflicts` for that — so the two concerns (schedule policy vs. live
 * state) stay separate and debuggable.
 */
export async function isSlotWithinTutorAvailability(
  options: CheckTutorAvailabilityOptions
): Promise<boolean> {
  const { tutorId, date, startTime, endTime, timezone } = options
  const tutorTz = timezone ?? (await getTutorTimezone(tutorId))

  const availability = await getEffectiveAvailability(tutorId, tutorTz)

  // Exceptions are stored as UTC midnights. Fetch a window around the local
  // date and filter by the tutor-local calendar date to avoid DST edge misses.
  const dateMidnight = new Date(`${date}T00:00:00.000Z`)
  const rangeStart = new Date(dateMidnight.getTime() - 2 * MS_PER_DAY)
  const rangeEnd = new Date(dateMidnight.getTime() + 2 * MS_PER_DAY)

  const exceptions = await drizzleDb
    .select()
    .from(calendarException)
    .where(
      and(
        eq(calendarException.tutorId, tutorId),
        gte(calendarException.date, rangeStart),
        lte(calendarException.date, rangeEnd)
      )
    )

  const localDateExceptions = exceptions.filter(
    e => formatInZone(e.date, tutorTz).date === date
  )

  // Whole-day block exception (isAvailable=false, no times).
  if (localDateExceptions.some(e => !e.isAvailable && !e.startTime && !e.endTime)) {
    return false
  }

  // Resolve the weekday of the requested local date in the tutor's zone.
  const [y, mo, d] = date.split('-').map(Number)
  const noonInZone = zonedWallClockToUtc(y, mo, d, 12, 0, tutorTz)
  const dayOfWeek = zonedWeekday(noonInZone, tutorTz)

  const dayAvailability = availability.filter(a => a.dayOfWeek === dayOfWeek)

  // The requested range must be fully contained in at least one available block.
  const rangeContained = dayAvailability.some(
    block => block.startTime <= startTime && block.endTime >= endTime
  )
  if (!rangeContained) return false

  // Time-specific exception blocking this range?
  const timeBlocked = localDateExceptions.some(
    e =>
      !e.isAvailable &&
      !!e.startTime &&
      !!e.endTime &&
      hhmmOverlap(startTime, endTime, e.startTime, e.endTime)
  )
  if (timeBlocked) return false

  return true
}

export interface CheckTutorSlotOptions {
  tutorId: string
  date: string // YYYY-MM-DD
  startTime: string // HH:MM
  endTime: string // HH:MM
  timezone: string
  bufferMinutes?: number
  excludeBookingRequestId?: string
  excludeSessionId?: string
  excludeEventId?: string
}

/**
 * Check whether a single wall-clock slot is actually bookable for this tutor.
 * Shorthand for generating the surrounding window and checking membership.
 */
export async function isSlotAvailableForTutor(options: CheckTutorSlotOptions): Promise<boolean> {
  const { tutorId, date, startTime, endTime, timezone, ...rest } = options
  const { start, end } = slotInstants(date, startTime, endTime, timezone)
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000)

  // Search a small window around the candidate so we don't need to generate
  // the entire availability horizon.
  const windowStart = new Date(start.getTime() - MS_PER_DAY)
  const windowEnd = new Date(end.getTime() + MS_PER_DAY)

  const available = await generateTutorAvailableSlots({
    tutorId,
    startDate: windowStart,
    endDate: windowEnd,
    slotDurationMinutes: durationMinutes,
    timezone,
    includePast: true,
    ...rest,
  })

  return available.some(
    s => s.date === date && s.startTime === startTime && s.endTime === endTime
  )
}
