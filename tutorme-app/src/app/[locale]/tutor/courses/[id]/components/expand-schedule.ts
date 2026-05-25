import type { ScheduleItem } from '../constants'
import { DAY_TO_INDEX } from './VariantScheduleEditor'

function formatDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Extract template slots (unique by dayOfWeek + startTime) from a schedule.
 * Removes dates to create a clean template.
 */
export function extractTemplate(schedule: ScheduleItem[]): ScheduleItem[] {
  const seen = new Set<string>()
  const template: ScheduleItem[] = []
  for (const slot of schedule) {
    if (!slot) continue
    const key = `${slot.dayOfWeek}|${slot.startTime}`
    if (!seen.has(key)) {
      seen.add(key)
      template.push({
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        durationMinutes: slot.durationMinutes || 60,
      })
    }
  }
  return template
}

/**
 * Expand template slots into dated slots across N weeks.
 * Week 1 starts from the given base date (defaults to current week's Monday).
 */
export function expandSchedule(
  template: ScheduleItem[],
  weeks: number,
  baseDate?: Date
): ScheduleItem[] {
  if (!template.length || weeks < 1) return []

  const start = baseDate ? new Date(baseDate) : new Date()
  if (!baseDate) {
    // Default to current week's Monday
    const day = start.getDay()
    const mon = start.getDate() - (day === 0 ? 6 : day - 1)
    start.setDate(mon)
  }
  start.setHours(0, 0, 0, 0)

  const expanded: ScheduleItem[] = []
  const maxWeeks = Math.min(weeks, 52)

  for (let w = 0; w < maxWeeks; w++) {
    const weekStart = new Date(start)
    weekStart.setDate(weekStart.getDate() + w * 7)

    for (const slot of template) {
      const dayIndex = DAY_TO_INDEX[slot.dayOfWeek]
      if (dayIndex === undefined) continue

      const slotDate = new Date(weekStart)
      // DAY_TO_INDEX: Sunday=0, Monday=1, ... Saturday=6
      // weekStart is already Monday, so add (dayIndex - 1), with Sunday being +6
      const offset = dayIndex === 0 ? 6 : dayIndex - 1
      slotDate.setDate(slotDate.getDate() + offset)

      expanded.push({
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        durationMinutes: slot.durationMinutes || 60,
        date: formatDateKey(slotDate),
      })
    }
  }

  return expanded
}
