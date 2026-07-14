import { describe, it, expect } from 'vitest'
import { formatCountdown } from './format'

describe('formatCountdown', () => {
  const now = 1_000_000_000_000

  it('formats sub-hour durations as MM:SS', () => {
    expect(formatCountdown(now + 90_000, now)).toBe('01:30')
    expect(formatCountdown(now + 5_000, now)).toBe('00:05')
    expect(formatCountdown(now + 59 * 60_000 + 59_000, now)).toBe('59:59')
  })

  it('formats hour-plus durations as H:MM:SS', () => {
    expect(formatCountdown(now + 60 * 60_000, now)).toBe('1:00:00')
    expect(formatCountdown(now + (2 * 3600 + 3 * 60 + 4) * 1000, now)).toBe('2:03:04')
  })

  it('clamps a past target to zero', () => {
    expect(formatCountdown(now - 5_000, now)).toBe('00:00')
    expect(formatCountdown(now, now)).toBe('00:00')
  })
})
