/**
 * Display name for a course schedule. Uses the tutor-given name when set,
 * otherwise falls back to "Schedule {index}" (e.g. "Schedule 1"). Matches the
 * label shown in the schedule view modal.
 */
export function formatScheduleName(name?: string | null, scheduleIndex?: number | null): string {
  if (name && name.trim()) return name.trim()
  if (typeof scheduleIndex === 'number') return `Schedule ${scheduleIndex}`
  return 'Schedule'
}
