/**
 * Tutor Calendar Availability API
 * GET /api/tutor/calendar/availability - Get tutor's availability
 * POST /api/tutor/calendar/availability - Set availability slot
 *
 * Query params for GET:
 * - start: ISO date string
 * - end: ISO date string
 * - check: boolean - if true, returns available slots for booking
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  calendarAvailability,
  calendarException,
  calendarEvent,
  oneOnOneBookingRequest,
  liveSession,
} from '@/lib/db/schema'
import { eq, and, or, gte, lte, gt, lt, asc, isNull, isNotNull, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { LIVE_SESSION_OPEN_STATUSES } from '@/lib/sessions/live-session-status'

const AvailabilitySchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  timezone: z.string().default('Asia/Shanghai'),
  isAvailable: z.boolean().default(true),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
})

const AvailabilityDeleteSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
})

export const GET = withAuth(
  async (req: NextRequest, session) => {
    const tutorId = session.user.id
    const { searchParams } = new URL(req.url)

    const start = searchParams.get('start')
    const end = searchParams.get('end')
    const check = searchParams.get('check') === 'true'
    const mode = searchParams.get('mode')

    try {
      const now = new Date()
      const availabilityWhere = and(
        eq(calendarAvailability.tutorId, tutorId),
        or(isNull(calendarAvailability.validUntil), gte(calendarAvailability.validUntil, now))
      )
      const availability = await drizzleDb
        .select()
        .from(calendarAvailability)
        .where(availabilityWhere)
        .orderBy(asc(calendarAvailability.dayOfWeek), asc(calendarAvailability.startTime))

      const exceptionConditions = [eq(calendarException.tutorId, tutorId)]
      if (start) exceptionConditions.push(gte(calendarException.date, new Date(start)))
      if (end) exceptionConditions.push(lte(calendarException.date, new Date(end)))
      const exceptions = await drizzleDb
        .select()
        .from(calendarException)
        .where(and(...exceptionConditions))

      if (mode === 'schedule') {
        // Return normalized data for client-side schedule conflict checking
        if (!start || !end) {
          return NextResponse.json(
            { error: 'Start and end dates required for schedule mode' },
            { status: 400 }
          )
        }
        const startDate = new Date(start)
        const endDate = new Date(end)

        // Query calendar events with proper overlap detection (catches spanning events)
        const existingEvents = await drizzleDb
          .select({
            startTime: calendarEvent.startTime,
            endTime: calendarEvent.endTime,
            title: calendarEvent.title,
          })
          .from(calendarEvent)
          .where(
            and(
              eq(calendarEvent.tutorId, tutorId),
              isNull(calendarEvent.deletedAt),
              eq(calendarEvent.isCancelled, false),
              lt(calendarEvent.startTime, endDate),
              gt(calendarEvent.endTime, startDate)
            )
          )

        // Query live sessions directly (source of truth) that overlap the range
        const liveSessions = await drizzleDb
          .select({
            scheduledAt: liveSession.scheduledAt,
            durationMinutes: liveSession.durationMinutes,
            title: liveSession.title,
          })
          .from(liveSession)
          .where(
            and(
              eq(liveSession.tutorId, tutorId),
              inArray(liveSession.status, LIVE_SESSION_OPEN_STATUSES),
              // Ignore orphaned sessions: deleting a course sets liveSession.courseId
              // to null (FK on delete) but leaves the row scheduled, which then
              // blocked scheduler slots forever. Only count sessions still tied to a
              // course here; genuinely course-less sessions (ad-hoc) already surface
              // via their CalendarEvent above, so nothing real is lost.
              isNotNull(liveSession.courseId),
              // A live session overlaps if: scheduledAt < endDate AND (scheduledAt + duration) > startDate
              // We approximate with scheduledAt within a window that could overlap
              gte(liveSession.scheduledAt, new Date(startDate.getTime() - 24 * 60 * 60 * 1000)),
              lte(liveSession.scheduledAt, endDate)
            )
          )

        const oneOnOnes = await drizzleDb
          .select({
            requestedDate: oneOnOneBookingRequest.requestedDate,
            startTime: oneOnOneBookingRequest.startTime,
            endTime: oneOnOneBookingRequest.endTime,
          })
          .from(oneOnOneBookingRequest)
          .where(
            and(
              eq(oneOnOneBookingRequest.tutorId, tutorId),
              inArray(oneOnOneBookingRequest.status, ['ACCEPTED', 'PAID']),
              gte(oneOnOneBookingRequest.requestedDate, startDate),
              lte(oneOnOneBookingRequest.requestedDate, endDate)
            )
          )

        const normalizeDate = (d: Date) => d.toISOString().split('T')[0]
        const normalizeTime = (d: Date) => d.toISOString().split('T')[1].slice(0, 5)

        // Merge calendar events and live sessions into a single events array
        const calendarEventItems = existingEvents.map(ev => ({
          date: normalizeDate(ev.startTime),
          startTime: normalizeTime(ev.startTime),
          endTime: normalizeTime(ev.endTime),
          title: ev.title,
        }))

        const liveSessionItems = liveSessions
          .filter(ls => ls.scheduledAt != null)
          .map(ls => {
            const start = new Date(ls.scheduledAt!)
            const end = new Date(start.getTime() + (ls.durationMinutes ?? 60) * 60 * 1000)
            return {
              date: normalizeDate(start),
              startTime: normalizeTime(start),
              endTime: normalizeTime(end),
              title: ls.title || 'Live Session',
            }
          })

        // Deduplicate: if a live session already has a calendar event on the same slot, prefer the calendar event
        const eventMap = new Map<string, (typeof calendarEventItems)[0]>()
        for (const ev of calendarEventItems) {
          eventMap.set(`${ev.date}_${ev.startTime}_${ev.endTime}`, ev)
        }
        for (const ls of liveSessionItems) {
          const key = `${ls.date}_${ls.startTime}_${ls.endTime}`
          if (!eventMap.has(key)) {
            eventMap.set(key, ls)
          }
        }

        return NextResponse.json({
          availability: availability.map(a => ({
            dayOfWeek: a.dayOfWeek,
            startTime: a.startTime,
            endTime: a.endTime,
          })),
          exceptions: exceptions.map(e => ({
            date: normalizeDate(e.date),
            isAvailable: e.isAvailable,
            startTime: e.startTime,
            endTime: e.endTime,
            reason: e.reason,
          })),
          events: Array.from(eventMap.values()),
          oneOnOnes: oneOnOnes.map(o => ({
            date: normalizeDate(o.requestedDate),
            startTime: o.startTime,
            endTime: o.endTime,
          })),
        })
      }

      if (!check) {
        // Return raw availability data
        return NextResponse.json({
          availability,
          exceptions,
        })
      }

      // Generate available time slots for booking
      if (!start || !end) {
        return NextResponse.json(
          { error: 'Start and end dates required for availability check' },
          { status: 400 }
        )
      }

      const startDate = new Date(start)
      const endDate = new Date(end)
      const availableSlots = await generateAvailableSlots(
        tutorId,
        startDate,
        endDate,
        availability,
        exceptions
      )

      return NextResponse.json({
        availableSlots,
        range: { start, end },
      })
    } catch (error) {
      console.error('Fetch availability error:', error)
      return handleApiError(
        error,
        'Failed to fetch availability',
        'api/tutor/calendar/availability/route.ts'
      )
    }
  },
  { role: 'TUTOR' }
)

export const POST = withAuth(
  async (req: NextRequest, session) => {
    const tutorId = session.user.id

    try {
      const body = await req.json()
      const validation = AvailabilitySchema.safeParse(body)

      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid request', details: validation.error.format() },
          { status: 400 }
        )
      }

      const data = validation.data

      if (data.startTime >= data.endTime) {
        return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
      }

      const existing = await drizzleDb
        .select()
        .from(calendarAvailability)
        .where(
          and(
            eq(calendarAvailability.tutorId, tutorId),
            eq(calendarAvailability.dayOfWeek, data.dayOfWeek),
            eq(calendarAvailability.startTime, data.startTime),
            eq(calendarAvailability.endTime, data.endTime)
          )
        )
        .limit(1)

      let availability
      if (existing.length > 0) {
        const [updated] = await drizzleDb
          .update(calendarAvailability)
          .set({
            isAvailable: data.isAvailable,
            timezone: data.timezone,
            validFrom: data.validFrom ? new Date(data.validFrom) : null,
            validUntil: data.validUntil ? new Date(data.validUntil) : null,
            updatedAt: new Date(),
          })
          .where(eq(calendarAvailability.availabilityId, existing[0].availabilityId))
          .returning()
        availability = updated
      } else {
        const now = new Date()
        const [created] = await drizzleDb
          .insert(calendarAvailability)
          .values({
            availabilityId: nanoid(),
            tutorId,
            dayOfWeek: data.dayOfWeek,
            startTime: data.startTime,
            endTime: data.endTime,
            timezone: data.timezone,
            isAvailable: data.isAvailable,
            validFrom: data.validFrom ? new Date(data.validFrom) : null,
            validUntil: data.validUntil ? new Date(data.validUntil) : null,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
        availability = created
      }

      return NextResponse.json({ availability }, { status: 201 })
    } catch (error: any) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Availability slot already exists for this time' },
          { status: 409 }
        )
      }

      console.error('Save availability error:', error)
      return handleApiError(
        error,
        'Failed to save availability',
        'api/tutor/calendar/availability/route.ts'
      )
    }
  },
  { role: 'TUTOR' }
)

export const DELETE = withAuth(
  async (req: NextRequest, session) => {
    const tutorId = session.user.id

    try {
      const body = await req.json()
      const validation = AvailabilityDeleteSchema.safeParse(body)

      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid request', details: validation.error.format() },
          { status: 400 }
        )
      }

      const data = validation.data

      await drizzleDb
        .delete(calendarAvailability)
        .where(
          and(
            eq(calendarAvailability.tutorId, tutorId),
            eq(calendarAvailability.dayOfWeek, data.dayOfWeek),
            eq(calendarAvailability.startTime, data.startTime),
            eq(calendarAvailability.endTime, data.endTime)
          )
        )

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Delete availability error:', error)
      return handleApiError(
        error,
        'Failed to delete availability',
        'api/tutor/calendar/availability/route.ts'
      )
    }
  },
  { role: 'TUTOR' }
)

// Generate available time slots for booking
async function generateAvailableSlots(
  tutorId: string,
  startDate: Date,
  endDate: Date,
  availability: any[],
  exceptions: any[]
): Promise<any[]> {
  const slots: any[] = []
  const currentDate = new Date(startDate)
  const timeSlots = [
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
  ]
  const baseTimezone = availability?.[0]?.timezone ?? 'Asia/Shanghai'
  const availabilityByKey = new Map<string, any>()
  for (let day = 0; day <= 6; day += 1) {
    for (let i = 0; i < timeSlots.length - 1; i += 1) {
      const startTime = timeSlots[i]
      const endTime = timeSlots[i + 1]
      availabilityByKey.set(`${day}-${startTime}-${endTime}`, {
        dayOfWeek: day,
        startTime,
        endTime,
        timezone: baseTimezone,
        isAvailable: true,
      })
    }
  }
  for (const row of availability) {
    const key = `${row.dayOfWeek}-${row.startTime}-${row.endTime}`
    const base = availabilityByKey.get(key)
    availabilityByKey.set(key, {
      ...(base ?? { dayOfWeek: row.dayOfWeek, startTime: row.startTime, endTime: row.endTime }),
      timezone: row.timezone ?? baseTimezone,
      isAvailable: row.isAvailable ?? true,
    })
  }
  const normalizedAvailability = Array.from(availabilityByKey.values())

  const existingEvents = await drizzleDb
    .select()
    .from(calendarEvent)
    .where(
      and(
        eq(calendarEvent.tutorId, tutorId),
        isNull(calendarEvent.deletedAt),
        eq(calendarEvent.isCancelled, false),
        lt(calendarEvent.startTime, endDate),
        gt(calendarEvent.endTime, startDate)
      )
    )

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay()
    const dateStr = currentDate.toISOString().split('T')[0]

    // Check if there's an exception for this date
    const dayException = exceptions.find(e => e.date.toISOString().split('T')[0] === dateStr)

    if (dayException && !dayException.isAvailable) {
      // Day is blocked
      currentDate.setDate(currentDate.getDate() + 1)
      continue
    }

    // Get availability for this day
    const dayAvailability = normalizedAvailability.filter(a => a.dayOfWeek === dayOfWeek)

    for (const slot of dayAvailability) {
      if (!slot.isAvailable) continue

      const slotStart = new Date(`${dateStr}T${slot.startTime}`)
      const slotEnd = new Date(`${dateStr}T${slot.endTime}`)

      // Check if slot is in the past
      if (slotEnd <= new Date()) continue

      // Check for conflicts with existing events
      const hasConflict = existingEvents.some((event: any) => {
        return slotStart < event.endTime && slotEnd > event.startTime
      })

      if (!hasConflict) {
        // Check exception time ranges
        const timeException = exceptions.find(e => {
          if (e.date.toISOString().split('T')[0] !== dateStr) return false
          if (!e.startTime || !e.endTime) return false
          const exStart = new Date(`${dateStr}T${e.startTime}`)
          const exEnd = new Date(`${dateStr}T${e.endTime}`)
          return slotStart < exEnd && slotEnd > exStart
        })

        if (!timeException) {
          slots.push({
            date: dateStr,
            startTime: slot.startTime,
            endTime: slot.endTime,
            dayOfWeek,
            timezone: slot.timezone,
          })
        }
      }
    }

    currentDate.setDate(currentDate.getDate() + 1)
  }

  return slots
}
