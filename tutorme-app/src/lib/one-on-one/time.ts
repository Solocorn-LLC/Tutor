/**
 * Absolute-UTC reconstruction for 1-on-1 bookings.
 *
 * A booking stores three pieces: `requestedDate` (a timestamp written as
 * midnight-UTC of the picked calendar date), `startTime`/`endTime` (wall-clock
 * "HH:MM" strings) and `timezone` (the zone those wall-clock times belong to).
 * Historically the scheduler rebuilt instants with `new Date(`${date}T${time}`)`,
 * which silently interprets the time in the *server's* zone and ignores the
 * stored `timezone` entirely — so a Shanghai 14:00 booking and a New York 14:00
 * booking collapsed to the same instant. These helpers pin every booking to its
 * own zone so conflict math is done on true UTC instants.
 */

import { zonedWallClockToUtc } from '@/lib/time/tz'

const DAY_MS = 24 * 60 * 60 * 1000

function hhmm(time: string): [number, number] {
  const [h, m] = time.split(':').map(Number)
  return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0]
}

/**
 * The true UTC start/end instants for a wall-clock slot (`YYYY-MM-DD` +
 * `HH:MM` strings) interpreted in `timezone`. DST-aware via the tz helpers.
 * If the end wall-clock is at//before the start (a slot crossing midnight),
 * the end rolls forward a day so the interval stays positive.
 */
export function slotInstants(
  date: string,
  startTime: string,
  endTime: string,
  timezone: string | null | undefined
): { start: Date; end: Date } {
  const tz = timezone || 'UTC'
  const [y, mo, d] = date.split('-').map(Number)
  const [sh, sm] = hhmm(startTime)
  const [eh, em] = hhmm(endTime)
  const start = zonedWallClockToUtc(y, mo, d, sh, sm, tz)
  let end = zonedWallClockToUtc(y, mo, d, eh, em, tz)
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + DAY_MS)
  return { start, end }
}

/**
 * The true UTC start/end instants of a stored booking. The calendar date is
 * taken from `requestedDate`'s UTC parts (that's how it is written — midnight
 * UTC of the picked date), and the wall-clock times are interpreted in the
 * booking's stored `timezone`.
 */
export function bookingInstants(booking: {
  requestedDate: Date
  startTime: string
  endTime: string
  timezone: string | null | undefined
}): { start: Date; end: Date } {
  const rd = booking.requestedDate
  const date = `${rd.getUTCFullYear()}-${String(rd.getUTCMonth() + 1).padStart(2, '0')}-${String(
    rd.getUTCDate()
  ).padStart(2, '0')}`
  return slotInstants(date, booking.startTime, booking.endTime, booking.timezone)
}

/** The storable `requestedDate` for a picked `YYYY-MM-DD` — midnight UTC, so
 *  the calendar date round-trips regardless of the server's own timezone. */
export function requestedDateFromString(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}
