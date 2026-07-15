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

/**
 * The set of hour keys ("<dayOfWeek>-HH:00", e.g. "1-14:00") a parent has
 * explicitly BLOCKED for a student. Empty when nothing is blocked (the default).
 */
export async function getStudentBlockedHourSet(studentId: string): Promise<Set<string>> {
  const rows = await drizzleDb
    .select({
      dayOfWeek: studentAvailability.dayOfWeek,
      startTime: studentAvailability.startTime,
      isAvailable: studentAvailability.isAvailable,
    })
    .from(studentAvailability)
    .where(eq(studentAvailability.studentId, studentId))

  const blocked = new Set<string>()
  for (const r of rows) {
    if (r.isAvailable === false) blocked.add(`${r.dayOfWeek}-${r.startTime}`)
  }
  return blocked
}

/**
 * Pure check: does [startTime, endTime) on `date` overlap any parent-blocked
 * hour? Returns true (unbookable) for a blocked overlap OR an invalid range.
 *  - date: "YYYY-MM-DD" (weekday parsed as UTC so it doesn't shift with the
 *    server timezone)
 *  - startTime / endTime: "HH:mm"
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
  const endMin = eh * 60 + (em || 0)
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) return true
  if (blocked.size === 0) return false

  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  for (let h = Math.floor(startMin / 60); h * 60 < endMin; h++) {
    if (blocked.has(`${day}-${pad(h)}:00`)) return true
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
