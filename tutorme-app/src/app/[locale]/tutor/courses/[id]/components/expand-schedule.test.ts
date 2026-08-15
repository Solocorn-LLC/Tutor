import { describe, it, expect } from 'vitest'
import { expandSchedule } from './expand-schedule'
import { zonedWallClockToUtc, formatInZone } from '@/lib/time/tz'

describe('expandSchedule', () => {
  it('starts the first session in the displayed week when the timezone is passed', () => {
    // Asia/Shanghai is UTC+8, which previously exposed the "phantom Week 1" bug
    // when expandSchedule was called without the timezone argument.
    const tz = 'Asia/Shanghai'
    const monday = zonedWallClockToUtc(2026, 8, 10, 0, 0, tz)
    const template = [{ dayOfWeek: 'Tuesday', startTime: '02:00', durationMinutes: 60 }]

    const expanded = expandSchedule(template, 8, monday, tz)

    expect(expanded.length).toBe(8)
    // First slot should be Tuesday 02:00 of the displayed week (Aug 11), not Aug 4.
    expect(expanded[0].date).toBe('2026-08-11')
    expect(expanded[0].startTime).toBe('02:00')
    expect(formatInZone(new Date(expanded[0].date + 'T00:00:00'), tz).date).toBe('2026-08-11')

    // Each subsequent week should advance by exactly 7 days.
    for (let i = 1; i < expanded.length; i++) {
      const prev = new Date(expanded[i - 1].date + 'T00:00:00')
      const curr = new Date(expanded[i].date + 'T00:00:00')
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
      expect(diffDays).toBe(7)
    }
  })
})
