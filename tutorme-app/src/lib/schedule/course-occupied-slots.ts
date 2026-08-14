/**
 * Compute recurring weekly slots that are occupied by the tutor's scheduled
 * courses, expressed in the tutor's wall-clock timezone. Used by the
 * availability UI so tutors can see which of their recurring availability slots
 * are already taken by a course, and cannot block those slots.
 */

import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, course } from '@/lib/db/schema'
import { eq, and, ne, gt, inArray, isNotNull, isNull } from 'drizzle-orm'
import { LIVE_SESSION_OPEN_STATUSES } from '@/lib/sessions/live-session-status'
import { formatInZone, zonedWeekday } from '@/lib/time/tz'

export interface CourseOccupiedSlot {
  dayOfWeek: number // 0=Sun..6=Sat
  startTime: string // HH:MM
  endTime: string // HH:MM
  courseName: string | null
  courseId: string | null
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function parseHhmm(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

function formatHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * The hour slots used by the availability picker. Mirrors InteractiveCalendar's
 * TIME_SLOTS sentinel: the last selectable hour is 23:00, which ends at 23:59.
 */
const HOUR_SLOTS = [
  '00:00',
  '01:00',
  '02:00',
  '03:00',
  '04:00',
  '05:00',
  '06:00',
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
  '23:00',
  '23:59',
]

function getOverlappingHourSlots(
  startTime: string,
  endTime: string,
  dayOfWeek: number
): Array<{ dayOfWeek: number; startTime: string }> {
  const startMin = parseHhmm(startTime)
  const endMin = parseHhmm(endTime)
  const occupied: Array<{ dayOfWeek: number; startTime: string }> = []

  for (let i = 0; i < HOUR_SLOTS.length - 1; i += 1) {
    const slotStart = parseHhmm(HOUR_SLOTS[i])
    const slotEnd = parseHhmm(HOUR_SLOTS[i + 1])
    if (startMin < slotEnd && endMin > slotStart) {
      occupied.push({ dayOfWeek, startTime: HOUR_SLOTS[i] })
    }
  }

  return occupied
}

/**
 * Return the recurring weekly slots that future, non-ended course live sessions
 * occupy for this tutor. Sessions are read in `timeZone` and de-duplicated by
 * (dayOfWeek, startTime) so the availability grid can mark them.
 */
export async function getCourseOccupiedRecurringSlots(
  tutorId: string,
  timeZone: string
): Promise<CourseOccupiedSlot[]> {
  const now = new Date()

  const sessions = await drizzleDb
    .select({
      scheduledAt: liveSession.scheduledAt,
      durationMinutes: liveSession.durationMinutes,
      courseName: course.name,
      courseId: liveSession.courseId,
    })
    .from(liveSession)
    .leftJoin(course, eq(course.courseId, liveSession.courseId))
    .where(
      and(
        eq(liveSession.tutorId, tutorId),
        isNotNull(liveSession.courseId),
        inArray(liveSession.status, LIVE_SESSION_OPEN_STATUSES),
        ne(liveSession.status, 'ended'),
        gt(liveSession.scheduledAt, now)
      )
    )

  const slotMap = new Map<string, CourseOccupiedSlot>()

  for (const s of sessions) {
    if (!s.scheduledAt) continue
    const duration = s.durationMinutes ?? 60
    const parts = formatInZone(s.scheduledAt, timeZone)
    const dayOfWeek = zonedWeekday(s.scheduledAt, timeZone)
    const startMin = parseHhmm(parts.time)
    const endMin = startMin + duration

    const overlapping = getOverlappingHourSlots(parts.time, formatHhmm(endMin), dayOfWeek)

    for (const occ of overlapping) {
      const key = `${occ.dayOfWeek}-${occ.startTime}`
      if (!slotMap.has(key)) {
        slotMap.set(key, {
          dayOfWeek: occ.dayOfWeek,
          startTime: occ.startTime,
          endTime: HOUR_SLOTS[HOUR_SLOTS.indexOf(occ.startTime) + 1] ?? '23:59',
          courseName: s.courseName,
          courseId: s.courseId,
        })
      }
    }
  }

  return Array.from(slotMap.values()).sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek
    return a.startTime.localeCompare(b.startTime)
  })
}

/**
 * Check whether a recurring availability slot (dayOfWeek, startTime) is
 * occupied by a future course session for the tutor.
 */
export async function isCourseOccupiedSlot(
  tutorId: string,
  timeZone: string,
  dayOfWeek: number,
  startTime: string
): Promise<boolean> {
  const occupied = await getCourseOccupiedRecurringSlots(tutorId, timeZone)
  return occupied.some(o => o.dayOfWeek === dayOfWeek && o.startTime === startTime)
}
