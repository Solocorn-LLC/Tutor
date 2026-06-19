/**
 * Resolve the recurring schedule slots used to generate a course's upcoming
 * ("virtual") sessions.
 *
 * Prefers the CourseSchedule table — the SAME source `publish` materializes real
 * LiveSession rows from — and falls back to the legacy `course.schedule` JSON only
 * when no schedule rows exist yet (e.g. an unpublished draft). This keeps the
 * sessions shown to tutors/students consistent with what actually gets
 * materialized, instead of reading a separate, drift-prone store.
 */

import { drizzleDb } from '@/lib/db/drizzle'
import { courseSchedule } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export interface ScheduleSlot {
  dayOfWeek: string
  startTime: string
  durationMinutes: number
}

export async function resolveCourseScheduleSlots(
  courseId: string,
  fallbackJson: unknown,
  // When set, resolve slots for just this schedule (the one a student enrolled
  // in) rather than aggregating every schedule of the course.
  scheduleId?: string | null
): Promise<ScheduleSlot[]> {
  const rows = await drizzleDb
    .select({ schedule: courseSchedule.schedule })
    .from(courseSchedule)
    .where(
      scheduleId ? eq(courseSchedule.scheduleId, scheduleId) : eq(courseSchedule.courseId, courseId)
    )

  const fromTable = rows.flatMap(r => (Array.isArray(r.schedule) ? r.schedule : []))
  if (fromTable.length > 0) {
    return fromTable as ScheduleSlot[]
  }

  return (Array.isArray(fallbackJson) ? fallbackJson : []) as ScheduleSlot[]
}
