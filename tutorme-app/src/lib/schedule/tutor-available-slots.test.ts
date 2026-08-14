import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  findConflicts: vi.fn(),
  responses: {
    profile: [{ timezone: 'UTC', bufferMinutes: 0 }],
    calendarAvailability: [] as any[],
    calendarException: [] as any[],
  },
  dbMock: {
    query: {
      profile: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(),
  },
}))

vi.mock('@/lib/db/drizzle', () => ({
  drizzleDb: mocks.dbMock,
}))

vi.mock('@/lib/schedule/conflicts', () => ({
  findConflicts: mocks.findConflicts,
}))

import {
  generateTutorAvailableSlots,
  isSlotWithinTutorAvailability,
  isSlotAvailableForTutor,
} from './tutor-available-slots'

function tableName(table: any): string {
  // Drizzle table objects expose their name in a few shapes depending on version.
  // NOTE: table.name may be a column named "name", so prefer the Symbol/_.name.
  const fromTable = table?.table ?? table
  return (
    fromTable?.[Symbol.for('drizzle:Name')] || fromTable?._?.name || fromTable?._?.tableName || ''
  )
}

function makeRowsPromise(rows: any[]) {
  const p = Promise.resolve(rows)
  return Object.assign(p, {
    limit: () => Promise.resolve(rows),
  })
}

function buildSelectChain() {
  return {
    from: (fromTable: any) => {
      const name = tableName(fromTable)
      const rows =
        name === 'Profile'
          ? mocks.responses.profile
          : name === 'CalendarAvailability'
            ? mocks.responses.calendarAvailability
            : name === 'CalendarException'
              ? mocks.responses.calendarException
              : []
      return {
        where: () => makeRowsPromise(rows),
      }
    },
  }
}

describe('tutor-available-slots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findConflicts.mockResolvedValue([])
    mocks.responses.profile = [{ timezone: 'UTC', bufferMinutes: 0 }]
    mocks.responses.calendarAvailability = []
    mocks.responses.calendarException = []
    mocks.dbMock.query.profile.findFirst.mockResolvedValue({
      timezone: 'UTC',
      bufferMinutes: 0,
    })
    mocks.dbMock.select.mockImplementation(buildSelectChain)
  })

  describe('generateTutorAvailableSlots', () => {
    it('defaults to 24/7 availability when tutor has no availability rows', async () => {
      const start = new Date('2030-06-03T00:00:00Z') // Monday UTC
      const end = new Date('2030-06-03T23:59:59Z')

      const slots = await generateTutorAvailableSlots({
        tutorId: 't1',
        startDate: start,
        endDate: end,
        slotDurationMinutes: 60,
      })

      expect(slots.length).toBe(24)
      expect(slots[0]).toMatchObject({
        date: '2030-06-03',
        startTime: '00:00',
        endTime: '01:00',
        dayOfWeek: 1,
        timezone: 'UTC',
      })
    })

    it('available rows do not restrict the default 24/7 availability', async () => {
      mocks.responses.calendarAvailability = [
        { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', timezone: 'UTC', isAvailable: true },
      ]

      const start = new Date('2030-06-03T00:00:00Z') // Monday
      const end = new Date('2030-06-03T23:59:59Z')

      const slots = await generateTutorAvailableSlots({
        tutorId: 't1',
        startDate: start,
        endDate: end,
        slotDurationMinutes: 60,
      })

      expect(slots.length).toBe(24)
    })

    it('blocks a declared unavailable window', async () => {
      mocks.responses.calendarAvailability = [
        { dayOfWeek: 1, startTime: '00:00', endTime: '24:00', timezone: 'UTC', isAvailable: true },
        { dayOfWeek: 1, startTime: '12:00', endTime: '13:00', timezone: 'UTC', isAvailable: false },
      ]

      const start = new Date('2030-06-03T00:00:00Z')
      const end = new Date('2030-06-03T23:59:59Z')

      const slots = await generateTutorAvailableSlots({
        tutorId: 't1',
        startDate: start,
        endDate: end,
        slotDurationMinutes: 60,
      })

      expect(slots.some(s => s.startTime === '12:00')).toBe(false)
      expect(slots.length).toBe(23)
    })

    it('skips slots that end in the past by default', async () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const yesterdayMidnight = new Date(
        Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate())
      )
      const yesterdayEnd = new Date(yesterdayMidnight.getTime() + 24 * 60 * 60 * 1000 - 1)

      const slots = await generateTutorAvailableSlots({
        tutorId: 't1',
        startDate: yesterdayMidnight,
        endDate: yesterdayEnd,
        slotDurationMinutes: 60,
      })

      expect(slots.length).toBe(0)
    })

    it('includes past slots when includePast is true', async () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const yesterdayMidnight = new Date(
        Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate())
      )
      const yesterdayEnd = new Date(yesterdayMidnight.getTime() + 24 * 60 * 60 * 1000 - 1)

      const slots = await generateTutorAvailableSlots({
        tutorId: 't1',
        startDate: yesterdayMidnight,
        endDate: yesterdayEnd,
        slotDurationMinutes: 60,
        includePast: true,
      })

      expect(slots.length).toBe(24)
    })

    it('blocks a whole-day exception', async () => {
      mocks.responses.calendarException = [
        {
          date: new Date('2030-06-03T00:00:00Z'),
          isAvailable: false,
          startTime: null,
          endTime: null,
        },
      ]

      const start = new Date('2030-06-03T00:00:00Z')
      const end = new Date('2030-06-03T23:59:59Z')

      const slots = await generateTutorAvailableSlots({
        tutorId: 't1',
        startDate: start,
        endDate: end,
        slotDurationMinutes: 60,
        includePast: true,
      })

      expect(slots.length).toBe(0)
    })

    it('blocks a time-specific exception', async () => {
      mocks.responses.calendarException = [
        {
          date: new Date('2030-06-03T00:00:00Z'),
          isAvailable: false,
          startTime: '10:00',
          endTime: '11:00',
        },
      ]

      const start = new Date('2030-06-03T00:00:00Z')
      const end = new Date('2030-06-03T23:59:59Z')

      const slots = await generateTutorAvailableSlots({
        tutorId: 't1',
        startDate: start,
        endDate: end,
        slotDurationMinutes: 60,
        includePast: true,
      })

      expect(slots.some(s => s.startTime === '10:00')).toBe(false)
      expect(slots.length).toBe(23)
    })

    it('excludes slots with conflicts', async () => {
      mocks.findConflicts.mockImplementation(async (_tutorId, start, _end) => {
        const s = start as Date
        if (s.getUTCHours() === 10) {
          return [{ type: 'calendar_event', title: 'Busy', startTime: s, endTime: s }]
        }
        return []
      })

      const start = new Date('2030-06-03T00:00:00Z')
      const end = new Date('2030-06-03T23:59:59Z')

      const slots = await generateTutorAvailableSlots({
        tutorId: 't1',
        startDate: start,
        endDate: end,
        slotDurationMinutes: 60,
        includePast: true,
      })

      expect(slots.some(s => s.startTime === '10:00')).toBe(false)
      expect(slots.length).toBe(23)
    })

    it('respects bufferMinutes from profile', async () => {
      mocks.responses.profile = [{ timezone: 'UTC', bufferMinutes: 30 }]
      mocks.dbMock.query.profile.findFirst.mockResolvedValue({
        timezone: 'UTC',
        bufferMinutes: 30,
      })

      const start = new Date('2030-06-03T00:00:00Z')
      const end = new Date('2030-06-03T00:59:59Z')

      await generateTutorAvailableSlots({
        tutorId: 't1',
        startDate: start,
        endDate: end,
        slotDurationMinutes: 60,
      })

      expect(mocks.findConflicts).toHaveBeenCalledWith(
        't1',
        expect.any(Date),
        expect.any(Date),
        expect.objectContaining({ bufferMinutes: 30 })
      )
    })

    it('uses the timezone override when provided', async () => {
      mocks.responses.calendarAvailability = [
        {
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '10:00',
          timezone: 'Asia/Shanghai',
          isAvailable: true,
        },
      ]

      const start = new Date('2030-06-03T00:00:00Z')
      const end = new Date('2030-06-03T23:59:59Z')

      const slots = await generateTutorAvailableSlots({
        tutorId: 't1',
        startDate: start,
        endDate: end,
        slotDurationMinutes: 60,
        timezone: 'Asia/Shanghai',
      })

      expect(slots[0].timezone).toBe('Asia/Shanghai')
    })
  })

  describe('isSlotWithinTutorAvailability', () => {
    beforeEach(() => {
      mocks.responses.calendarException = []
    })

    it('returns true for a slot inside an available window', async () => {
      mocks.responses.calendarAvailability = [
        { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', timezone: 'UTC', isAvailable: true },
      ]

      const ok = await isSlotWithinTutorAvailability({
        tutorId: 't1',
        date: '2030-06-03',
        startTime: '10:00',
        endTime: '11:00',
      })

      expect(ok).toBe(true)
    })

    it('returns false when blocked by an unavailable window', async () => {
      mocks.responses.calendarAvailability = [
        { dayOfWeek: 1, startTime: '18:00', endTime: '19:00', timezone: 'UTC', isAvailable: false },
      ]

      const ok = await isSlotWithinTutorAvailability({
        tutorId: 't1',
        date: '2030-06-03',
        startTime: '18:00',
        endTime: '19:00',
      })

      expect(ok).toBe(false)
    })

    it('returns false on a whole-day blocked exception', async () => {
      mocks.responses.calendarAvailability = [
        { dayOfWeek: 1, startTime: '00:00', endTime: '24:00', timezone: 'UTC', isAvailable: true },
      ]
      mocks.responses.calendarException = [
        {
          date: new Date('2030-06-03T00:00:00Z'),
          isAvailable: false,
          startTime: null,
          endTime: null,
        },
      ]

      const ok = await isSlotWithinTutorAvailability({
        tutorId: 't1',
        date: '2030-06-03',
        startTime: '10:00',
        endTime: '11:00',
      })

      expect(ok).toBe(false)
    })

    it('returns false when blocked by a time-specific exception', async () => {
      mocks.responses.calendarAvailability = [
        { dayOfWeek: 1, startTime: '00:00', endTime: '24:00', timezone: 'UTC', isAvailable: true },
      ]
      mocks.responses.calendarException = [
        {
          date: new Date('2030-06-03T00:00:00Z'),
          isAvailable: false,
          startTime: '09:30',
          endTime: '10:30',
        },
      ]

      const ok = await isSlotWithinTutorAvailability({
        tutorId: 't1',
        date: '2030-06-03',
        startTime: '10:00',
        endTime: '11:00',
      })

      expect(ok).toBe(false)
    })
  })

  describe('isSlotAvailableForTutor', () => {
    it('returns true when the slot is generated as available', async () => {
      const ok = await isSlotAvailableForTutor({
        tutorId: 't1',
        date: '2030-06-03',
        startTime: '10:00',
        endTime: '11:00',
        timezone: 'UTC',
      })

      expect(ok).toBe(true)
    })

    it('returns false when the slot conflicts', async () => {
      mocks.findConflicts.mockResolvedValue([
        { type: 'calendar_event', title: 'Busy', startTime: new Date(), endTime: new Date() },
      ])

      const ok = await isSlotAvailableForTutor({
        tutorId: 't1',
        date: '2030-06-03',
        startTime: '10:00',
        endTime: '11:00',
        timezone: 'UTC',
      })

      expect(ok).toBe(false)
    })
  })
})
