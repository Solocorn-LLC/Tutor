import { describe, it, expect } from 'vitest'
import { suggestAlternativeSlots, type SuggestAlternativeSlotsCore } from './conflicts'

const SG = 'Asia/Singapore'

function core(overrides: Partial<SuggestAlternativeSlotsCore> = {}): SuggestAlternativeSlotsCore {
  return {
    availability: [],
    exceptions: [],
    start: new Date('2026-10-10T01:00:00.000Z'), // Saturday 09:00 in Singapore
    durationMinutes: 60,
    maxSuggestions: 3,
    searchDays: 14,
    sameDayOfWeek: false,
    timeZone: SG,
    now: new Date('2026-10-09T02:00:00.000Z'), // Friday 10:00 in Singapore
    ...overrides,
  }
}

const noConflicts = () => Promise.resolve(null)

/** Monday 09:00-12:00, Singapore wall clock. */
const mondayMorningSg = {
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '12:00',
  timezone: SG,
}

describe('suggestAlternativeSlots', () => {
  it('suggests the tutor-local wall clock, not server/UTC time (Singapore tutor)', async () => {
    const slots = await suggestAlternativeSlots(
      core({ availability: [mondayMorningSg] }),
      noConflicts
    )
    // Monday 09:00-12:00 SG must come back as '09:00' SG wall clock on the SG
    // Monday — before the fix this returned 09:00 UTC (= 17:00 SG).
    expect(slots[0]).toEqual({ date: '2026-10-12', startTime: '09:00', endTime: '10:00' })
    expect(slots[1]).toEqual({ date: '2026-10-19', startTime: '09:00', endTime: '10:00' })
  })

  it('uses the row timezone when it differs from the fallback timezone', async () => {
    const slots = await suggestAlternativeSlots(
      core({
        timeZone: 'UTC',
        availability: [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00', timezone: SG }],
      }),
      noConflicts
    )
    expect(slots[0]).toEqual({ date: '2026-10-12', startTime: '09:00', endTime: '10:00' })
  })

  it('advances past a time-level exception inside the block', async () => {
    const slots = await suggestAlternativeSlots(
      core({
        availability: [mondayMorningSg],
        exceptions: [
          {
            date: new Date('2026-10-12T00:00:00.000Z'), // stored as UTC midnight
            isAvailable: false,
            startTime: '09:00',
            endTime: '10:30',
          },
        ],
      }),
      noConflicts
    )
    expect(slots[0]).toEqual({ date: '2026-10-12', startTime: '10:30', endTime: '11:30' })
  })

  it('skips a day with a whole-day block exception', async () => {
    const slots = await suggestAlternativeSlots(
      core({
        availability: [mondayMorningSg],
        exceptions: [
          {
            date: new Date('2026-10-12T00:00:00.000Z'),
            isAvailable: false,
            startTime: null,
            endTime: null,
          },
        ],
      }),
      noConflicts
    )
    expect(slots[0]).toEqual({ date: '2026-10-19', startTime: '09:00', endTime: '10:00' })
  })

  it('does not treat positive (isAvailable=true) exceptions as blocks', async () => {
    const slots = await suggestAlternativeSlots(
      core({
        availability: [mondayMorningSg],
        exceptions: [
          {
            date: new Date('2026-10-12T00:00:00.000Z'),
            isAvailable: true,
            startTime: '09:00',
            endTime: '12:00',
          },
        ],
      }),
      noConflicts
    )
    expect(slots[0]).toEqual({ date: '2026-10-12', startTime: '09:00', endTime: '10:00' })
  })

  it('sameDayOfWeek filters by the tutor-zone weekday', async () => {
    const availability = [
      mondayMorningSg,
      { dayOfWeek: 6, startTime: '14:00', endTime: '16:00', timezone: SG }, // Saturday
    ]
    const slots = await suggestAlternativeSlots(
      core({ availability, sameDayOfWeek: true }),
      noConflicts
    )
    // Original slot is a Saturday; only Saturdays may be suggested, starting
    // with the upcoming one (the 14:00 block does not overlap the 09:00
    // original slot, so this Saturday is eligible).
    expect(slots.every(s => s.date === '2026-10-10' || s.date === '2026-10-17')).toBe(true)
    expect(slots[0]).toEqual({ date: '2026-10-10', startTime: '14:00', endTime: '15:00' })
  })

  it('jumps past a conflicting commitment', async () => {
    const slots = await suggestAlternativeSlots(
      core({ availability: [mondayMorningSg] }),
      async s => {
        // Conflict covers 09:00-09:30 SG on 2026-10-12 (01:00-01:30 UTC).
        if (s.getTime() === new Date('2026-10-12T01:00:00.000Z').getTime()) {
          return new Date('2026-10-12T01:30:00.000Z')
        }
        return null
      }
    )
    expect(slots[0]).toEqual({ date: '2026-10-12', startTime: '09:30', endTime: '10:30' })
  })

  it('keeps wall-clock stable across a DST boundary (America/New_York)', async () => {
    // now: Monday 2026-10-26 09:00 EDT (13:00Z). DST ends Nov 1; the next
    // Monday (Nov 2) is EST. A fixed-offset computation would shift the clock.
    // Today itself is blocked by a whole-day exception, forcing the search
    // across the DST boundary.
    const slots = await suggestAlternativeSlots(
      core({
        timeZone: 'America/New_York',
        start: new Date('2026-10-26T13:00:00.000Z'),
        now: new Date('2026-10-26T13:00:00.000Z'),
        availability: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', timezone: 'America/New_York' },
        ],
        exceptions: [
          {
            // NY-midnight of 2026-10-26 in UTC (EDT is UTC-4)
            date: new Date('2026-10-26T04:00:00.000Z'),
            isAvailable: false,
            startTime: null,
            endTime: null,
          },
        ],
      }),
      noConflicts
    )
    expect(slots[0]).toEqual({ date: '2026-11-02', startTime: '09:00', endTime: '10:00' })
  })

  it('never suggests blocks fully in the past', async () => {
    // now is Friday 14:00 SG — this Friday's 09:00-12:00 block is over.
    const slots = await suggestAlternativeSlots(
      core({
        now: new Date('2026-10-09T06:00:00.000Z'),
        availability: [{ dayOfWeek: 5, startTime: '09:00', endTime: '12:00', timezone: SG }],
      }),
      noConflicts
    )
    expect(slots[0]).toEqual({ date: '2026-10-16', startTime: '09:00', endTime: '10:00' })
  })

  it('stops at maxSuggestions', async () => {
    const slots = await suggestAlternativeSlots(
      core({ availability: [mondayMorningSg], maxSuggestions: 1 }),
      noConflicts
    )
    expect(slots).toHaveLength(1)
  })
})
