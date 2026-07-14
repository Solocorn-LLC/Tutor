import { describe, it, expect } from 'vitest'
import { groupIntoSeries, type OneOnOneRequestSummary } from './one-on-one-request-card'

function req(overrides: Partial<OneOnOneRequestSummary>): OneOnOneRequestSummary {
  return {
    requestId: overrides.requestId ?? 'r1',
    requestedDate: overrides.requestedDate ?? '2026-07-14T00:00:00.000Z',
    startTime: '15:00',
    endTime: '16:00',
    timezone: 'UTC',
    costPerSession: 45,
    status: 'PENDING',
    ...overrides,
  }
}

describe('groupIntoSeries', () => {
  it('passes standalone requests through as individual rows, order preserved', () => {
    const rows = [req({ requestId: 'a' }), req({ requestId: 'b' }), req({ requestId: 'c' })]
    const groups = groupIntoSeries(rows)
    expect(groups).toHaveLength(3)
    expect(groups.map(g => g.head.requestId)).toEqual(['a', 'b', 'c'])
    expect(groups.every(g => g.series === null)).toBe(true)
  })

  it('folds a series into one row headed by seriesIndex 0 with a combined summary', () => {
    const rows = [
      req({
        requestId: 'w1',
        seriesId: 's1',
        seriesIndex: 0,
        requestedDate: '2026-07-14T00:00:00.000Z',
      }),
      req({
        requestId: 'w2',
        seriesId: 's1',
        seriesIndex: 1,
        requestedDate: '2026-07-21T00:00:00.000Z',
      }),
      req({
        requestId: 'w3',
        seriesId: 's1',
        seriesIndex: 2,
        requestedDate: '2026-07-28T00:00:00.000Z',
      }),
    ]
    const groups = groupIntoSeries(rows)
    expect(groups).toHaveLength(1)
    const g = groups[0]
    expect(g.head.requestId).toBe('w1')
    expect(g.members).toHaveLength(3)
    expect(g.series).toEqual({ count: 3, totalCost: 135, lastDate: '2026-07-28T00:00:00.000Z' })
  })

  it('orders series members by seriesIndex even when the input is shuffled', () => {
    const rows = [
      req({
        requestId: 'w3',
        seriesId: 's1',
        seriesIndex: 2,
        requestedDate: '2026-07-28T00:00:00.000Z',
      }),
      req({
        requestId: 'w1',
        seriesId: 's1',
        seriesIndex: 0,
        requestedDate: '2026-07-14T00:00:00.000Z',
      }),
      req({
        requestId: 'w2',
        seriesId: 's1',
        seriesIndex: 1,
        requestedDate: '2026-07-21T00:00:00.000Z',
      }),
    ]
    const [g] = groupIntoSeries(rows)
    expect(g.head.requestId).toBe('w1')
    expect(g.members.map(m => m.requestId)).toEqual(['w1', 'w2', 'w3'])
    expect(g.series?.lastDate).toBe('2026-07-28T00:00:00.000Z')
  })

  it('keeps a series in the position of its first-seen row among standalone requests', () => {
    const rows = [
      req({ requestId: 'single-a' }),
      req({ requestId: 'w1', seriesId: 's1', seriesIndex: 0 }),
      req({ requestId: 'single-b' }),
      req({ requestId: 'w2', seriesId: 's1', seriesIndex: 1 }),
    ]
    const groups = groupIntoSeries(rows)
    expect(groups.map(g => g.head.requestId)).toEqual(['single-a', 'w1', 'single-b'])
    expect(groups[1].series?.count).toBe(2)
  })

  it('treats a one-member series as a plain single row (no series summary)', () => {
    const rows = [req({ requestId: 'w1', seriesId: 's1', seriesIndex: 0 })]
    const [g] = groupIntoSeries(rows)
    expect(g.series).toBeNull()
    expect(g.head.requestId).toBe('w1')
  })
})
