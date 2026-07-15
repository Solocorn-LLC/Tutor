import { describe, it, expect } from 'vitest'
import { slotOverlapsBlockedHours } from './student-availability'

// 2026-06-15 is a Monday → getUTCDay() === 1.
const MON = '2026-06-15'

describe('slotOverlapsBlockedHours — free 24/7 by default', () => {
  it('is bookable when nothing is blocked', () => {
    expect(slotOverlapsBlockedHours(new Set(), MON, '14:00', '15:00')).toBe(false)
    // even at 3am
    expect(slotOverlapsBlockedHours(new Set(), MON, '03:00', '04:00')).toBe(false)
  })
})

describe('slotOverlapsBlockedHours — parent-blocked hours', () => {
  const blocked = new Set(['1-14:00', '1-15:00']) // Mon 2–4pm blocked

  it('blocks a slot that overlaps a blocked hour', () => {
    expect(slotOverlapsBlockedHours(blocked, MON, '14:00', '15:00')).toBe(true)
    expect(slotOverlapsBlockedHours(blocked, MON, '14:30', '15:30')).toBe(true) // partial overlap
    expect(slotOverlapsBlockedHours(blocked, MON, '13:30', '14:30')).toBe(true) // spills into 14:00
  })

  it('allows a slot outside the blocked hours', () => {
    expect(slotOverlapsBlockedHours(blocked, MON, '10:00', '11:00')).toBe(false)
    expect(slotOverlapsBlockedHours(blocked, MON, '16:00', '17:00')).toBe(false)
    expect(slotOverlapsBlockedHours(blocked, MON, '13:00', '14:00')).toBe(false) // ends exactly at 14:00
  })

  it('only blocks on the matching day of week', () => {
    const TUE = '2026-06-16' // Tuesday → day 2
    expect(slotOverlapsBlockedHours(blocked, TUE, '14:00', '15:00')).toBe(false)
  })
})

describe('slotOverlapsBlockedHours — invalid ranges are treated as unbookable', () => {
  it('rejects an end <= start', () => {
    expect(slotOverlapsBlockedHours(new Set(), MON, '15:00', '15:00')).toBe(true)
    expect(slotOverlapsBlockedHours(new Set(), MON, '16:00', '15:00')).toBe(true)
  })
  it('rejects an unparseable time', () => {
    expect(slotOverlapsBlockedHours(new Set(), MON, 'oops', '15:00')).toBe(true)
  })
})
