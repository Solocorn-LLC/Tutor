/**
 * Read helpers for a student's weekly availability (StudentAvailability),
 * which is managed by the student's parent. Used by the booking backend so a
 * 1-on-1 can only be scheduled within the hours the parent marked free.
 */

import { eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { studentAvailability } from '@/lib/db/schema'

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * The set of free hour keys ("<dayOfWeek>-HH:00", e.g. "1-14:00") a student is
 * marked available for. Returns `null` when the student has NO availability
 * configured at all, so callers can choose not to enforce (rather than block a
 * student whose parent hasn't set any availability yet).
 */
export async function getStudentFreeHourSet(studentId: string): Promise<Set<string> | null> {
  const rows = await drizzleDb
    .select({
      dayOfWeek: studentAvailability.dayOfWeek,
      startTime: studentAvailability.startTime,
      isAvailable: studentAvailability.isAvailable,
    })
    .from(studentAvailability)
    .where(eq(studentAvailability.studentId, studentId))

  if (rows.length === 0) return null

  const free = new Set<string>()
  for (const r of rows) {
    if (r.isAvailable) free.add(`${r.dayOfWeek}-${r.startTime}`)
  }
  return free
}

/**
 * Whether a proposed session time falls within the student's available hours.
 *  - date: "YYYY-MM-DD"
 *  - startTime / endTime: "HH:mm"
 *
 * Returns true when the student has no availability configured (not enforced),
 * or when every clock hour the session overlaps is marked free; false otherwise.
 */
export async function isSlotWithinStudentAvailability(
  studentId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<boolean> {
  const free = await getStudentFreeHourSet(studentId)
  if (free === null) return true // no availability configured → don't block

  const day = new Date(`${date}T00:00:00`).getDay()
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const startMin = sh * 60 + (sm || 0)
  const endMin = eh * 60 + (em || 0)
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) return false

  // Every clock hour the session overlaps must be marked free.
  for (let h = Math.floor(startMin / 60); h * 60 < endMin; h++) {
    if (!free.has(`${day}-${pad(h)}:00`)) return false
  }
  return true
}
