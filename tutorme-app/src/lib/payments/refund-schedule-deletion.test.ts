import { describe, it, expect } from 'vitest'
import { computeScheduleDeletionRefund, countScheduleSessions } from './refund-schedule-deletion'

describe('computeScheduleDeletionRefund', () => {
  it('refunds everything when no sessions were taken', () => {
    expect(computeScheduleDeletionRefund(100, 8, 0, 0)).toBe(100)
  })

  it('refunds half when half the sessions ran', () => {
    expect(computeScheduleDeletionRefund(100, 8, 4, 0)).toBe(50)
  })

  it('refunds nothing when every session ran', () => {
    expect(computeScheduleDeletionRefund(100, 8, 8, 0)).toBe(0)
  })

  it('deducts the LLM token cost from the pro-rata amount', () => {
    expect(computeScheduleDeletionRefund(100, 8, 4, 10)).toBe(40)
  })

  it('floors at zero when the token cost exceeds the pro-rata amount', () => {
    expect(computeScheduleDeletionRefund(100, 8, 7, 50)).toBe(0)
  })

  it('rounds to cents', () => {
    // 33.33 * (1 - 1/3) = 22.22 exactly
    expect(computeScheduleDeletionRefund(33.33, 3, 1, 0)).toBe(22.22)
  })

  it('treats an over-completed count as fully used, not negative', () => {
    expect(computeScheduleDeletionRefund(100, 8, 12, 0)).toBe(0)
  })

  it('refunds everything when the schedule never materialized (total = 0)', () => {
    expect(computeScheduleDeletionRefund(80, 0, 0, 0)).toBe(80)
  })
})

describe('countScheduleSessions', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  const past = new Date('2026-10-01T12:00:00Z')
  const future = new Date('2026-10-20T12:00:00Z')

  it('counts scheduled and live sessions as remaining, ended-past as completed', () => {
    const { total, completed } = countScheduleSessions(
      [
        { status: 'scheduled', scheduledAt: future },
        { status: 'live', scheduledAt: past },
        { status: 'ended', scheduledAt: past },
      ],
      now
    )
    expect(total).toBe(3)
    expect(completed).toBe(1)
  })

  it('excludes cancelled sessions', () => {
    const { total, completed } = countScheduleSessions(
      [
        { status: 'cancelled', scheduledAt: future },
        { status: 'ended', scheduledAt: past },
      ],
      now
    )
    expect(total).toBe(1)
    expect(completed).toBe(1)
  })

  it('excludes ended sessions whose scheduledAt is still in the future (cancelled-before-start tombstones)', () => {
    const { total, completed } = countScheduleSessions(
      [
        { status: 'ended', scheduledAt: future },
        { status: 'ended', scheduledAt: past },
      ],
      now
    )
    expect(total).toBe(1)
    expect(completed).toBe(1)
  })

  it('handles rows with no scheduledAt as countable but not completed', () => {
    const { total, completed } = countScheduleSessions(
      [{ status: 'scheduled', scheduledAt: null }],
      now
    )
    expect(total).toBe(1)
    expect(completed).toBe(0)
  })
})
