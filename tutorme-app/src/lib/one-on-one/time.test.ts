import { describe, it, expect } from 'vitest'
import { slotInstants, bookingInstants, requestedDateFromString } from './time'

describe('slotInstants', () => {
  it('interprets wall-clock in the given zone (not the server)', () => {
    // 14:00 in Shanghai (UTC+8) is 06:00 UTC.
    const { start, end } = slotInstants('2026-06-20', '14:00', '15:00', 'Asia/Shanghai')
    expect(start.toISOString()).toBe('2026-06-20T06:00:00.000Z')
    expect(end.toISOString()).toBe('2026-06-20T07:00:00.000Z')
  })

  it('resolves the same wall-clock to different instants across zones', () => {
    const sh = slotInstants('2026-06-20', '14:00', '15:00', 'Asia/Shanghai').start
    const ny = slotInstants('2026-06-20', '14:00', '15:00', 'America/New_York').start
    // 14:00 SH = 06:00Z; 14:00 NY (EDT, -4) = 18:00Z → 12h apart, NOT equal.
    expect(sh.toISOString()).toBe('2026-06-20T06:00:00.000Z')
    expect(ny.toISOString()).toBe('2026-06-20T18:00:00.000Z')
    expect(sh.getTime()).not.toBe(ny.getTime())
  })

  it('is DST-aware (New York summer offset is -4)', () => {
    const { start } = slotInstants('2026-07-01', '09:00', '10:00', 'America/New_York')
    expect(start.toISOString()).toBe('2026-07-01T13:00:00.000Z')
  })

  it('defaults to UTC when no zone is given', () => {
    const { start } = slotInstants('2026-06-20', '09:00', '10:00', null)
    expect(start.toISOString()).toBe('2026-06-20T09:00:00.000Z')
  })
})

describe('bookingInstants', () => {
  it('rebuilds a stored booking in its own timezone', () => {
    const booking = {
      requestedDate: requestedDateFromString('2026-06-20'),
      startTime: '14:00',
      endTime: '15:00',
      timezone: 'Asia/Shanghai',
    }
    const { start, end } = bookingInstants(booking)
    expect(start.toISOString()).toBe('2026-06-20T06:00:00.000Z')
    expect(end.toISOString()).toBe('2026-06-20T07:00:00.000Z')
  })

  it('two same-wall-clock bookings in different zones do NOT overlap', () => {
    const a = bookingInstants({
      requestedDate: requestedDateFromString('2026-06-20'),
      startTime: '14:00',
      endTime: '15:00',
      timezone: 'Asia/Shanghai',
    })
    const b = bookingInstants({
      requestedDate: requestedDateFromString('2026-06-20'),
      startTime: '14:00',
      endTime: '15:00',
      timezone: 'America/New_York',
    })
    const overlaps = a.start < b.end && a.end > b.start
    expect(overlaps).toBe(false)
  })
})

describe('requestedDateFromString', () => {
  it('stores midnight UTC of the calendar date', () => {
    expect(requestedDateFromString('2026-06-20').toISOString()).toBe('2026-06-20T00:00:00.000Z')
  })
})
