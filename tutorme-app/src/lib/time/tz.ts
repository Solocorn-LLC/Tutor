/**
 * Dependency-free timezone helpers (no date libs in this repo).
 *
 * The scheduler/availability stack was mixing UTC and browser-local "HH:MM"
 * strings. These let us pin everything to ONE frame — the tutor's timezone —
 * by (a) reading a UTC instant's wall-clock in a zone, and (b) building the UTC
 * instant for a wall-clock time in a zone.
 */

interface ZonedParts {
  year: number
  month: number // 1-12
  day: number
  hour: number // 0-23
  minute: number
  second: number
}

/** The wall-clock parts of a UTC `date` as seen in `timeZone`. */
function partsInZone(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const m: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') m[p.type] = p.value
  }
  return {
    year: Number(m.year),
    month: Number(m.month),
    day: Number(m.day),
    // Some engines format midnight as '24'.
    hour: m.hour === '24' ? 0 : Number(m.hour),
    minute: Number(m.minute),
    second: Number(m.second),
  }
}

/** Offset (ms) that `timeZone` is AHEAD of UTC at the instant `date`. */
function offsetMsAt(date: Date, timeZone: string): number {
  const p = partsInZone(date, timeZone)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asIfUtc - date.getTime()
}

/**
 * Build the UTC Date for a wall-clock time (`year`, 1-based `month`, `day`,
 * `hour`, `minute`) in `timeZone`. DST-aware (re-checks the offset at the result).
 */
export function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const off = offsetMsAt(guess, timeZone)
  let result = new Date(guess.getTime() - off)
  const off2 = offsetMsAt(result, timeZone)
  if (off2 !== off) result = new Date(guess.getTime() - off2)
  return result
}

/** Format a UTC Date as { date: 'YYYY-MM-DD', time: 'HH:MM' } in `timeZone`. */
export function formatInZone(date: Date, timeZone: string): { date: string; time: string } {
  const p = partsInZone(date, timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  }
}

/** Day-of-week (0=Sun..6=Sat) of a UTC instant as seen in `timeZone`. */
export function zonedWeekday(date: Date, timeZone: string): number {
  const p = partsInZone(date, timeZone)
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
}

/** The wall-clock calendar date (Y/M/D) of a UTC instant in `timeZone`. */
export function zonedDateParts(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number } {
  const p = partsInZone(date, timeZone)
  return { year: p.year, month: p.month, day: p.day }
}
