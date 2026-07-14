import { describe, it, expect } from 'vitest'
import { joinableRequestId, latestCompletedRequestId } from './enter-classroom'
import type { OneOnOneRequestSummary } from '@/components/one-on-one/one-on-one-request-card'

const NOW = new Date('2026-07-20T12:00:00.000Z').getTime()

function req(o: Partial<OneOnOneRequestSummary> & { requestId: string }): OneOnOneRequestSummary {
  return {
    requestedDate: '2026-07-20T00:00:00.000Z',
    startTime: '15:00',
    endTime: '16:00',
    timezone: 'UTC',
    costPerSession: 45,
    status: 'PAID',
    ...o,
  }
}

describe('joinableRequestId', () => {
  it('returns null when no member is paid', () => {
    const members = [
      req({ requestId: 'a', status: 'ACCEPTED' }),
      req({ requestId: 'b', status: 'PENDING' }),
    ]
    expect(joinableRequestId(members, NOW)).toBeNull()
  })

  it('picks the upcoming paid session over a past one', () => {
    const members = [
      req({ requestId: 'past', requestedDate: '2026-07-13T00:00:00.000Z' }),
      req({ requestId: 'next', requestedDate: '2026-07-27T00:00:00.000Z' }),
    ]
    expect(joinableRequestId(members, NOW)).toBe('next')
  })

  it('treats today as still joinable (24h grace)', () => {
    const members = [req({ requestId: 'today', requestedDate: '2026-07-20T00:00:00.000Z' })]
    expect(joinableRequestId(members, NOW)).toBe('today')
  })

  it('falls back to the most recent past session when all are past', () => {
    const members = [
      req({ requestId: 'older', requestedDate: '2026-07-10T00:00:00.000Z' }),
      req({ requestId: 'recent', requestedDate: '2026-07-15T00:00:00.000Z' }),
    ]
    expect(joinableRequestId(members, NOW)).toBe('recent')
  })

  it('ignores non-paid members when choosing', () => {
    const members = [
      req({
        requestId: 'unpaid-future',
        status: 'ACCEPTED',
        requestedDate: '2026-07-25T00:00:00.000Z',
      }),
      req({ requestId: 'paid-future', status: 'PAID', requestedDate: '2026-07-27T00:00:00.000Z' }),
    ]
    expect(joinableRequestId(members, NOW)).toBe('paid-future')
  })
})

describe('latestCompletedRequestId', () => {
  it('returns null when nothing is completed', () => {
    expect(latestCompletedRequestId([req({ requestId: 'a', status: 'PAID' })])).toBeNull()
  })

  it('returns the most recent completed session', () => {
    const members = [
      req({ requestId: 'w1', status: 'COMPLETED', requestedDate: '2026-07-06T00:00:00.000Z' }),
      req({ requestId: 'w2', status: 'COMPLETED', requestedDate: '2026-07-13T00:00:00.000Z' }),
      req({ requestId: 'w3-upcoming', status: 'PAID', requestedDate: '2026-07-20T00:00:00.000Z' }),
    ]
    expect(latestCompletedRequestId(members)).toBe('w2')
  })
})
