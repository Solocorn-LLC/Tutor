/**
 * Compute the configured number of sessions for a course schedule.
 *
 * A schedule is a weekly pattern (slots) repeated for a number of weeks.
 * The canonical session count is `slots.length * weeksToSchedule`.
 *
 * This intentionally does NOT look at materialized LiveSession rows — those
 * should match this number after a successful publish. Use this helper when
 * you need the *configured* or *advertised* session count.
 */

export interface ScheduleSlotLike {
  dayOfWeek?: string
  startTime?: string
  durationMinutes?: number
  date?: string
}

export interface ScheduleLike {
  schedule?: ScheduleSlotLike[] | unknown
  weeksToSchedule?: number | null
}

export function computeScheduleSessionCount(schedule: ScheduleLike): number {
  const slots = Array.isArray(schedule?.schedule)
    ? (schedule.schedule as ScheduleSlotLike[]).filter(Boolean)
    : []
  if (slots.length === 0) return 0
  const weeks = Math.max(1, schedule.weeksToSchedule ?? 8)
  return slots.length * weeks
}

export function computeCourseSessionCount(schedules: ScheduleLike[]): number {
  return schedules.reduce((sum, s) => sum + computeScheduleSessionCount(s), 0)
}
