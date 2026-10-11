/**
 * Read helpers for a student's weekly availability (StudentAvailability),
 * which is managed by the student's parent.
 *
 * Model: a student is free to book 24/7 BY DEFAULT. A parent can BLOCK specific
 * weekly hours (rows with `isAvailable = false`); only those hours are off-limits
 * and require the parent to re-open them. Hours with no row — or a row marked
 * available — are bookable. So the booking backend enforces a blacklist, not a
 * whitelist.
 */

import { eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { studentAvailability } from '@/lib/db/schema'

const pad = (n: number) => String(n).padStart(2, '0')

const DAY_MINUTES = 24 * 60

/**
 * The "day-HH:00" hour keys overlapped by the wall-clock minute range
 * [startMin, endMin) on `day` (0 = Sunday, as Date.getUTCDay). Ranges may
 * cross midnight: hours past 24:00 roll into the following weekday, matching
 * how slotInstants resolves overnight slots.
 */
function overlappedHourKeys(day: number, startMin: number, endMin: number): string[] {
  const keys: string[] = []
  let m = startMin
  while (m < endMin) {
    const dayOffset = Math.floor(m / DAY_MINUTES)
    const hourOfDay = Math.floor((m % DAY_MINUTES) / 60)
    keys.push(`${(day + dayOffset) % 7}-${pad(hourOfDay)}:00`)
    m = dayOffset * DAY_MINUTES + (hourOfDay + 1) * 60
  }
  return keys
}

/**
 * The set of hour keys ("<dayOfWeek>-HH:00", e.g. "1-14:00") a parent has
 * explicitly BLOCKED for a student. Empty when nothing is blocked (the default).
 * Each blocked row covers [startTime, endTime), expanded to every hour key it
 * overlaps — so a partial-hour block like 14:30–15:30 blocks both the 14:00 and
 * 15:00 hours.
 */
export async function getStudentBlockedHourSet(studentId: string): Promise<Set<string>> {
  const rows = await drizzleDb
    .select({
      dayOfWeek: studentAvailability.dayOfWeek,
      startTime: studentAvailability.startTime,
      endTime: studentAvailability.endTime,
      isAvailable: studentAvailability.isAvailable,
    })
    .from(studentAvailability)
    .where(eq(studentAvailability.studentId, studentId))

  const blocked = new Set<string>()
  for (const r of rows) {
    if (r.isAvailable !== false) continue
    const [sh, sm] = r.startTime.split(':').map(Number)
    const [eh, em] = r.endTime.split(':').map(Number)
    const startMin = sh * 60 + (sm || 0)
    let endMin = eh * 60 + (em || 0)
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) continue
    if (endMin <= startMin) endMin += DAY_MINUTES // overnight block
    for (const key of overlappedHourKeys(r.dayOfWeek, startMin, endMin)) blocked.add(key)
  }
  return blocked
}

/**
 * Pure check: does [startTime, endTime) on `date` overlap any parent-blocked
 * hour? Returns true (unbookable) for a blocked overlap OR an invalid range.
 *  - date: "YYYY-MM-DD" — the wall-clock date of the session; its weekday is
 *    unambiguous (no timezone shift), and overnight slots check the following
 *    weekday too, matching slotInstants.
 *  - startTime / endTime: "HH:mm"; an end before start means an overnight slot
 *    (e.g. 23:00–01:00), which is checked across the midnight boundary.
 */
export function slotOverlapsBlockedHours(
  blocked: ReadonlySet<string>,
  date: string,
  startTime: string,
  endTime: string
): boolean {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const startMin = sh * 60 + (sm || 0)
  let endMin = eh * 60 + (em || 0)
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return true
  if (endMin === startMin) return true // zero-length range is never bookable
  if (endMin < startMin) endMin += DAY_MINUTES // overnight slot
  if (blocked.size === 0) return false

  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  for (const key of overlappedHourKeys(day, startMin, endMin)) {
    if (blocked.has(key)) return true
  }
  return false
}

/**
 * Whether a proposed session time is bookable for the student — i.e. it does NOT
 * fall on an hour the parent has blocked. Free by default (nothing blocked).
 */
export async function isSlotWithinStudentAvailability(
  studentId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<boolean> {
  const blocked = await getStudentBlockedHourSet(studentId)
  return !slotOverlapsBlockedHours(blocked, date, startTime, endTime)
}
