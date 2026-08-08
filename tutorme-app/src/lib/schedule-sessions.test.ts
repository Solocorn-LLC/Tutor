import { describe, it, expect } from 'vitest'
import {
  generateUpcomingSessions,
  mergeSessions,
  type RealSession,
  type ScheduleSlot,
} from './schedule-sessions'
import { formatInZone, zonedWeekday } from './time/tz'

const weekly: ScheduleSlot[] = [{ dayOfWeek: 'monday', startTime: '09:00', durationMinutes: 60 }]

function asReal(v: { scheduledAt: string }, i: number): RealSession {
  return {
    id: `real-${i}`,
    title: 'Course',
    status: 'scheduled',
    scheduledAt: v.scheduledAt,
    startedAt: null,
    endedAt: null,
    durationMinutes: 60,
    isVirtual: false,
    maxStudents: 50,
    category: 'Math',
  }
}

describe('generateUpcomingSessions — timezone-aware', () => {
  it('projects each slot at the tutor wall-clock time in the given timezone', () => {
    const tz = 'Asia/Shanghai' // UTC+8, so 09:00 local = 01:00 UTC
    const sessions = generateUpcomingSessions(weekly, 'Course', 'Math', { timeZone: tz, count: 8 })
    expect(sessions.length).toBe(8)
    for (const s of sessions) {
      const d = new Date(s.scheduledAt)
      // Wall clock in the tutor's zone must be Monday 09:00 — not shifted by the server tz.
      expect(formatInZone(d, tz).time).toBe('09:00')
      expect(zonedWeekday(d, tz)).toBe(1) // Monday
    }
  })
})

describe('mergeSessions — no double-count', () => {
  it('de-dupes virtuals against aligned real sessions (the 8→15 bug)', () => {
    const tz = 'Asia/Shanghai'
    // 12 projected occurrences; the first 8 are "materialized" (same instants publish would use).
    const virtuals = generateUpcomingSessions(weekly, 'Course', 'Math', { timeZone: tz, count: 12 })
    const reals = virtuals.slice(0, 8).map(asReal)

    const merged = mergeSessions(reals, virtuals)

    // Exactly the 8 materialized sessions — not 8 + 8 virtual (=16) and not 8 + 4 phantom (=12).
    expect(merged.length).toBe(8)
    // All kept entries are the real sessions (virtuals were de-duped/capped away).
    expect(merged.every(s => s.isVirtual === false)).toBe(true)
  })

  it('drops phantom virtuals projected beyond the materialized window', () => {
    const tz = 'Asia/Shanghai'
    const virtuals = generateUpcomingSessions(weekly, 'Course', 'Math', { timeZone: tz, count: 12 })
    const reals = virtuals.slice(0, 5).map(asReal) // only 5 materialized
    const merged = mergeSessions(reals, virtuals)
    // 5 real; virtuals beyond the 5th are phantom future projections → dropped.
    expect(merged.length).toBe(5)
  })

  it('keeps all virtuals for a draft with no real sessions (preview)', () => {
    const tz = 'Asia/Shanghai'
    const virtuals = generateUpcomingSessions(weekly, 'Course', 'Math', { timeZone: tz, count: 12 })
    const merged = mergeSessions([], virtuals)
    expect(merged.length).toBe(virtuals.length)
  })

  it('would double-count if virtual times were misaligned (proves tz-awareness matters)', () => {
    const tz = 'Asia/Shanghai'
    const virtuals = generateUpcomingSessions(weekly, 'Course', 'Math', { timeZone: tz, count: 12 })
    // Simulate the OLD bug: real sessions computed 8h off (server-local vs tutor tz),
    // beyond the 30-min de-dup tolerance → they no longer match any virtual.
    const misaligned = virtuals.slice(0, 8).map((v, i) => {
      const shifted = new Date(new Date(v.scheduledAt).getTime() + 8 * 3600_000).toISOString()
      return asReal({ scheduledAt: shifted }, i)
    })
    const merged = mergeSessions(misaligned, virtuals)
    // 8 real + the 12 virtuals up to the last (shifted-later) real → far more than 8.
    expect(merged.length).toBeGreaterThan(8)
  })
})
