import { describe, it, expect } from 'vitest'
import { zonedWallClockToUtc, formatInZone, zonedWeekday, zonedDateParts } from './tz'

describe('tz helpers', () => {
  it('builds the UTC instant for a wall-clock time in a fixed-offset zone', () => {
    // 09:00 on 2026-03-10 in Shanghai (UTC+8, no DST) = 01:00 UTC.
    const utc = zonedWallClockToUtc(2026, 3, 10, 9, 0, 'Asia/Shanghai')
    expect(utc.toISOString()).toBe('2026-03-10T01:00:00.000Z')
  })

  it('round-trips wall clock → UTC → wall clock', () => {
    const utc = zonedWallClockToUtc(2026, 6, 15, 23, 0, 'America/New_York') // 11 PM EDT
    const back = formatInZone(utc, 'America/New_York')
    expect(back).toEqual({ date: '2026-06-15', time: '23:00' })
  })

  it('formats a UTC instant in the target zone', () => {
    // 01:00 UTC = 09:00 Shanghai the same day.
    expect(formatInZone(new Date('2026-03-10T01:00:00Z'), 'Asia/Shanghai')).toEqual({
      date: '2026-03-10',
      time: '09:00',
    })
    // 23:00 UTC = 07:00 next day in Shanghai — date rolls over.
    expect(formatInZone(new Date('2026-03-10T23:00:00Z'), 'Asia/Shanghai')).toEqual({
      date: '2026-03-11',
      time: '07:00',
    })
  })

  it('reports the weekday/date in the target zone (handles day rollover)', () => {
    // 2026-03-10 is a Tuesday. At 23:00 UTC it's already Wednesday in Shanghai.
    const d = new Date('2026-03-10T23:00:00Z')
    expect(zonedWeekday(d, 'UTC')).toBe(2) // Tue
    expect(zonedWeekday(d, 'Asia/Shanghai')).toBe(3) // Wed
    expect(zonedDateParts(d, 'Asia/Shanghai')).toEqual({ year: 2026, month: 3, day: 11 })
  })

  it('handles a US DST spring-forward boundary', () => {
    // 2026-03-08 02:30 America/New_York does not exist (spring forward). The
    // helper must still return a sane instant, not NaN.
    const utc = zonedWallClockToUtc(2026, 3, 8, 2, 30, 'America/New_York')
    expect(Number.isNaN(utc.getTime())).toBe(false)
  })
})
