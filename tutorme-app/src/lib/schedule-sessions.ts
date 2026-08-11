/**
 * Generate upcoming session instances from a recurring weekly schedule.
 * Virtual sessions are computed from schedule slots until they are "realized"
 * by a tutor launching them (creating a liveSession row).
 *
 * IMPORTANT: virtual session times MUST be computed in the same timezone the
 * publish path materializes real sessions in (the tutor's timezone, via
 * `zonedWallClockToUtc`). Otherwise a real session and its schedule slot land on
 * different UTC instants and `mergeSessions` fails to de-dupe them — showing each
 * session twice (once real, once virtual) and inflating the count.
 */

import { zonedWallClockToUtc, zonedDateParts, zonedWeekday } from '@/lib/time/tz'

export interface ScheduleSlot {
  dayOfWeek: string
  startTime: string
  durationMinutes: number
  /** Manual one-off date "YYYY-MM-DD" (the HH:MM is the tutor's local wall clock). */
  date?: string
}

export interface VirtualSession {
  id: string
  title: string
  status: 'virtual' | 'active' | 'scheduled' | 'ended' | 'preparing' | 'live' | 'paused'
  scheduledAt: string
  startedAt: string | null
  endedAt: string | null
  durationMinutes: number
  isVirtual: true
  roomId: string | null
  roomUrl: string | null
  maxStudents: number
  category: string
}

export interface RealSession {
  id: string
  title: string
  status: string
  scheduledAt: string | null
  startedAt: string | null
  endedAt: string | null
  durationMinutes: number
  isVirtual: boolean
  roomId?: string | null
  roomUrl?: string | null
  maxStudents: number
  category: string
}

const DAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

function parseDayOfWeek(day: string): number {
  return DAY_MAP[day.toLowerCase().trim()] ?? 1
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number)
  return { hours: h || 0, minutes: m || 0 }
}

/** Add `n` days to a wall-clock date (Y/1-based-M/D) → new Y/M/D, without tz drift. */
function addDays(
  year: number,
  month: number,
  day: number,
  n: number
): { year: number; month: number; day: number } {
  const t = new Date(Date.UTC(year, month - 1, day + n))
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }
}

/**
 * Generate upcoming virtual sessions from a weekly recurring schedule.
 * Returns the next `count` session instances, sorted chronologically.
 */
export function generateUpcomingSessions(
  schedule: ScheduleSlot[],
  courseName: string,
  courseCategory: string,
  options: {
    count?: number
    fromDate?: Date
    maxStudents?: number
    weeks?: number
    /** The tutor's timezone — the wall clock the "HH:MM" slots are expressed in.
     *  MUST match the publish path so virtual instants line up with real ones. */
    timeZone?: string
  } = {}
): VirtualSession[] {
  const {
    count = 10,
    fromDate = new Date(),
    maxStudents = 50,
    weeks,
    timeZone = 'UTC',
  } = options

  if (!schedule || schedule.length === 0) return []

  const sessions: VirtualSession[] = []
  const now = fromDate.getTime()
  const todayZ = zonedDateParts(fromDate, timeZone)
  const todayWeekday = zonedWeekday(fromDate, timeZone)

  const pushOccurrence = (occ: Date, durationMinutes: number) => {
    if (isNaN(occ.getTime())) return
    const scheduledAt = occ.toISOString()
    const scheduledMs = occ.getTime()
    const minutesSinceStart = (now - scheduledMs) / 60000
    const minutesUntilStart = -minutesSinceStart

    let status: VirtualSession['status'] = 'virtual'
    if (minutesSinceStart > durationMinutes) status = 'ended'
    else if (minutesSinceStart >= 0) status = 'active'
    else if (minutesUntilStart <= 60) status = 'scheduled'

    sessions.push({
      id: `virtual-${scheduledAt}`,
      title: courseName,
      status,
      scheduledAt,
      startedAt: status === 'active' || status === 'ended' ? scheduledAt : null,
      endedAt:
        status === 'ended' ? new Date(scheduledMs + durationMinutes * 60000).toISOString() : null,
      durationMinutes: durationMinutes || 60,
      isVirtual: true,
      roomId: null,
      roomUrl: null,
      maxStudents,
      category: courseCategory || 'General',
    })
  }

  for (const slot of schedule) {
    const { hours, minutes } = parseTime(slot.startTime)
    const durationMinutes = slot.durationMinutes || 60

    // Manual one-off date: the HH:MM is the tutor's local wall clock.
    if (slot.date) {
      const [y, m, d] = slot.date.split('-').map(Number)
      if (y && m && d)
        pushOccurrence(zonedWallClockToUtc(y, m, d, hours, minutes, timeZone), durationMinutes)
      continue
    }

    // Weekly recurrence: find this/next occurrence of the weekday in the tutor's
    // timezone, then convert each week's wall-clock slot to UTC (same as publish).
    const targetDay = parseDayOfWeek(slot.dayOfWeek)
    const daysUntil = (targetDay - todayWeekday + 7) % 7
    const first = addDays(todayZ.year, todayZ.month, todayZ.day, daysUntil)
    const projectionWeeks = weeks ?? 12
    for (let w = 0; w < projectionWeeks; w++) {
      const wk = addDays(first.year, first.month, first.day, w * 7)
      pushOccurrence(
        zonedWallClockToUtc(wk.year, wk.month, wk.day, hours, minutes, timeZone),
        durationMinutes
      )
    }
  }

  // Sort by scheduled time and deduplicate (same instant)
  const unique = new Map<string, VirtualSession>()
  sessions.forEach(s => unique.set(s.scheduledAt, s))

  return Array.from(unique.values())
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, count)
}

/**
 * Merge real live sessions with virtual schedule-based sessions.
 *
 * Two de-dup rules keep the count honest:
 *  1. A virtual (schedule-projected) session is dropped when a real session already
 *     covers that slot — matched by proximity in time (works once virtual and real
 *     instants are computed in the same timezone; see `generateUpcomingSessions`).
 *  2. When real sessions exist (a published course materializes its full schedule),
 *     virtuals PAST the last real session are dropped — they are phantom future
 *     projections beyond what was actually scheduled. Drafts (no real sessions yet)
 *     keep all virtuals so the schedule can still be previewed.
 */
export function mergeSessions(
  realSessions: RealSession[],
  virtualSessions: VirtualSession[]
): (RealSession | VirtualSession)[] {
  const TOLERANCE_MS = 30 * 60 * 1000
  const realTimes = realSessions
    .map(rs => (rs.scheduledAt ? new Date(rs.scheduledAt).getTime() : NaN))
    .filter(t => !Number.isNaN(t))
  // Cap virtual projection at the materialized window. Infinity when there are no
  // real sessions (a draft) so its schedule still previews.
  const lastRealTime = realTimes.length > 0 ? Math.max(...realTimes) : Infinity

  const keptVirtual = virtualSessions.filter(vs => {
    if (!vs.scheduledAt) return true
    const vt = new Date(vs.scheduledAt).getTime()
    if (vt > lastRealTime) return false // phantom future projection beyond the schedule
    return !realTimes.some(rt => Math.abs(rt - vt) <= TOLERANCE_MS)
  })

  return [...realSessions, ...keptVirtual].sort(
    (a, b) => new Date(a.scheduledAt || 0).getTime() - new Date(b.scheduledAt || 0).getTime()
  )
}
