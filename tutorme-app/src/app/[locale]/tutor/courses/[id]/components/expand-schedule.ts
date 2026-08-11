import type { ScheduleItem } from '../constants'
import { zonedDateParts, zonedWeekday, zonedWallClockToUtc, formatInZone } from '@/lib/time/tz'
import { DAY_TO_INDEX } from './VariantScheduleEditor'

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

function startOfWeekInZone(date: Date, timeZone: string, weekOffset = 0): Date {
  const { year, month, day } = zonedDateParts(date, timeZone)
  const weekday = zonedWeekday(date, timeZone)
  const daysBack = weekday === 0 ? 6 : weekday - 1
  return zonedWallClockToUtc(year, month, day - daysBack + weekOffset * 7, 0, 0, timeZone)
}

/**
 * Expand template slots into dated slots across N weeks.
 * Week 1 starts from the given base date (defaults to current week's Monday)
 * in the supplied `timeZone`.
 */
export function expandSchedule(
  template: ScheduleItem[],
  weeks: number,
  baseDate?: Date,
  timeZone = 'UTC'
): ScheduleItem[] {
  if (!template.length || weeks < 1) return []

  const anchor = baseDate ? new Date(baseDate) : new Date()
  const start = startOfWeekInZone(anchor, timeZone, 0)
  const { year: startYear, month: startMonth, day: startDay } = zonedDateParts(start, timeZone)

  const expanded: ScheduleItem[] = []
  const maxWeeks = Math.min(weeks, 52)

  for (let w = 0; w < maxWeeks; w++) {
    for (const slot of template) {
      const dayIndex = DAY_TO_INDEX[slot.dayOfWeek]
      if (dayIndex === undefined) continue

      // Validate time format before accepting the slot
      const parts = (slot.startTime ?? '').split(':')
      if (parts.length !== 2) continue
      const h = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10)
      if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59)
        continue

      // DAY_TO_INDEX: Sunday=0, Monday=1, ... Saturday=6. Week starts on Monday.
      const offset = dayIndex === 0 ? 6 : dayIndex - 1
      const slotInstant = zonedWallClockToUtc(
        startYear,
        startMonth,
        startDay + w * 7 + offset,
        h,
        m,
        timeZone
      )

      if (Number.isNaN(slotInstant.getTime())) continue

      const { date } = formatInZone(slotInstant, timeZone)
      expanded.push({
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        durationMinutes: slot.durationMinutes || 60,
        date,
      })
    }
  }

  return expanded
}
