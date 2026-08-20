import { describe, it, expect } from 'vitest'
import {
  computeScheduleSessionCount,
  computeCourseSessionCount,
  type ScheduleLike,
} from './session-count'

describe('session-count helpers', () => {
  describe('computeScheduleSessionCount', () => {
    it('returns slots × weeksToSchedule for a weekly schedule', () => {
      const schedule: ScheduleLike = {
        schedule: [
          { dayOfWeek: 'Monday', startTime: '09:00', durationMinutes: 60 },
          { dayOfWeek: 'Wednesday', startTime: '10:00', durationMinutes: 60 },
        ],
        weeksToSchedule: 4,
      }
      expect(computeScheduleSessionCount(schedule)).toBe(8)
    })

    it('defaults to 8 weeks when weeksToSchedule is missing', () => {
      const schedule: ScheduleLike = {
        schedule: [{ dayOfWeek: 'Monday', startTime: '09:00', durationMinutes: 60 }],
      }
      expect(computeScheduleSessionCount(schedule)).toBe(8)
    })

    it('defaults to 1 week when weeksToSchedule is zero or negative', () => {
      expect(
        computeScheduleSessionCount({
          schedule: [{ dayOfWeek: 'Monday', startTime: '09:00' }],
          weeksToSchedule: 0,
        })
      ).toBe(1)
      expect(
        computeScheduleSessionCount({
          schedule: [{ dayOfWeek: 'Monday', startTime: '09:00' }],
          weeksToSchedule: -3,
        })
      ).toBe(1)
    })

    it('returns 0 when the schedule has no slots', () => {
      expect(computeScheduleSessionCount({ schedule: [], weeksToSchedule: 8 })).toBe(0)
      expect(computeScheduleSessionCount({ schedule: undefined, weeksToSchedule: 8 })).toBe(0)
    })

    it('ignores null/undefined slots', () => {
      const schedule: ScheduleLike = {
        schedule: [
          { dayOfWeek: 'Monday', startTime: '09:00' },
          null as any,
          { dayOfWeek: 'Wednesday', startTime: '10:00' },
        ],
        weeksToSchedule: 2,
      }
      expect(computeScheduleSessionCount(schedule)).toBe(4)
    })
  })

  describe('computeCourseSessionCount', () => {
    it('sums sessions across all schedules', () => {
      const schedules: ScheduleLike[] = [
        {
          schedule: [
            { dayOfWeek: 'Monday', startTime: '09:00' },
            { dayOfWeek: 'Wednesday', startTime: '10:00' },
          ],
          weeksToSchedule: 2,
        },
        {
          schedule: [{ dayOfWeek: 'Friday', startTime: '11:00' }],
          weeksToSchedule: 4,
        },
      ]
      expect(computeCourseSessionCount(schedules)).toBe(8)
    })

    it('returns 0 for an empty schedule list', () => {
      expect(computeCourseSessionCount([])).toBe(0)
    })
  })
})
