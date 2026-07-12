/**
 * Public API to get tutor's availability for booking
 * GET /api/public/tutors/[username]/availability
 */

import { NextRequest, NextResponse } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  user,
  profile,
  calendarAvailability,
  calendarException,
  calendarEvent,
} from '@/lib/db/schema'
import { eq, and, or, gte, lte, asc, isNull } from 'drizzle-orm'
import { formatInZone, zonedWeekday, zonedWallClockToUtc, zonedDateParts } from '@/lib/time/tz'

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  try {
    const { username: usernameParam } = await params
    const username = usernameParam.replace(/^@+/, '').toLowerCase()

    // Find tutor by profile.username first (matches public profile API), then by userId
    let tutorProfile = await drizzleDb
      .select()
      .from(profile)
      .where(eq(profile.username, username))
      .limit(1)
      .then(rows => rows[0] || null)

    if (!tutorProfile) {
      tutorProfile = await drizzleDb
        .select()
        .from(profile)
        .where(eq(profile.userId, username))
        .limit(1)
        .then(rows => rows[0] || null)
    }

    if (!tutorProfile) {
      return NextResponse.json({ error: 'Tutor not found' }, { status: 404 })
    }

    const tutorId = tutorProfile.userId

    // Verify the user is a tutor
    const tutorUser = await drizzleDb
      .select({ userId: user.userId, role: user.role })
      .from(user)
      .where(eq(user.userId, tutorId))
      .limit(1)

    if (tutorUser.length === 0 || tutorUser[0].role !== 'TUTOR') {
      return NextResponse.json({ error: 'Tutor not found' }, { status: 404 })
    }

    // Check if one-on-one is enabled
    if (!tutorProfile.oneOnOneEnabled) {
      return NextResponse.json(
        { error: 'Tutor does not offer one-on-one sessions', available: false, reason: 'disabled' },
        { status: 200 }
      )
    }

    const now = new Date()
    const startDate = start ? new Date(start) : now
    const endDate = end ? new Date(end) : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) // 2 weeks default

    const availabilityRows = await drizzleDb
      .select()
      .from(calendarAvailability)
      .where(
        and(
          eq(calendarAvailability.tutorId, tutorId),
          or(isNull(calendarAvailability.validUntil), gte(calendarAvailability.validUntil, now))
        )
      )
      .orderBy(asc(calendarAvailability.dayOfWeek), asc(calendarAvailability.startTime))

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
    const baseTimezone = availabilityRows?.[0]?.timezone ?? tutorProfile.timezone ?? 'UTC'
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
    for (const row of availabilityRows) {
      const key = `${row.dayOfWeek}-${row.startTime}-${row.endTime}`
      const base = availabilityByKey.get(key)
      availabilityByKey.set(key, {
        ...(base ?? { dayOfWeek: row.dayOfWeek, startTime: row.startTime, endTime: row.endTime }),
        timezone: row.timezone ?? baseTimezone,
        isAvailable: row.isAvailable ?? true,
      })
    }
    const availability = Array.from(availabilityByKey.values())

    // Get exceptions
    const exceptions = await drizzleDb
      .select()
      .from(calendarException)
      .where(
        and(
          eq(calendarException.tutorId, tutorId),
          gte(calendarException.date, startDate),
          lte(calendarException.date, endDate)
        )
      )

    // Get existing events
    const existingEvents = await drizzleDb
      .select()
      .from(calendarEvent)
      .where(
        and(
          eq(calendarEvent.tutorId, tutorId),
          isNull(calendarEvent.deletedAt),
          eq(calendarEvent.isCancelled, false),
          or(
            and(gte(calendarEvent.startTime, startDate), lte(calendarEvent.startTime, endDate)),
            and(gte(calendarEvent.endTime, startDate), lte(calendarEvent.endTime, endDate))
          )
        )
      )

    // Generate available slots — all calculations are done in the tutor's timezone
    // so that a "Monday 9:00" slot means Monday 9:00 in the tutor's zone, not UTC.
    const slots: Array<{
      date: string
      startTime: string
      endTime: string
      dayOfWeek: number
      timezone: string
    }> = []

    const tutorTz = baseTimezone

    // Helpers to convert UTC instants to tutor-local wall-clock for comparison
    const normalizeDate = (d: Date) => formatInZone(d, tutorTz).date
    const normalizeTime = (d: Date) => formatInZone(d, tutorTz).time

    // Pre-normalize existing events to tutor-local date/time for conflict checking
    const normalizedEvents = existingEvents.map((event: any) => ({
      date: normalizeDate(event.startTime),
      startTime: normalizeTime(event.startTime),
      endTime: normalizeTime(event.endTime),
    }))

    // Pre-normalize exceptions to tutor-local date
    const normalizedExceptions = exceptions.map((e: any) => ({
      date: normalizeDate(e.date),
      isAvailable: e.isAvailable,
      startTime: e.startTime,
      endTime: e.endTime,
    }))

    // Iterate through each date in the requested range
    let currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      // Get the day-of-week and date string as seen in the tutor's timezone
      const dayOfWeek = zonedWeekday(currentDate, tutorTz)
      const { year, month, day } = zonedDateParts(currentDate, tutorTz)
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

      // Check if there's an exception for this date
      const dayException = normalizedExceptions.find(e => e.date === dateStr && !e.isAvailable)

      if (dayException) {
        currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000)
        continue
      }

      // Get availability for this day
      const dayAvailability = availability.filter(a => a.dayOfWeek === dayOfWeek)

      for (const slot of dayAvailability) {
        if (!slot.isAvailable) continue

        // Build UTC instants for the slot's wall-clock time in the tutor's timezone
        const slotStart = zonedWallClockToUtc(
          year,
          month,
          day,
          parseInt(slot.startTime.slice(0, 2), 10),
          parseInt(slot.startTime.slice(3, 5), 10),
          tutorTz
        )
        const slotEnd = zonedWallClockToUtc(
          year,
          month,
          day,
          parseInt(slot.endTime.slice(0, 2), 10),
          parseInt(slot.endTime.slice(3, 5), 10),
          tutorTz
        )

        // Check if slot is in the past (compare UTC instants)
        if (slotEnd <= now) continue

        // Check for conflicts with existing events (compare normalized local times)
        const hasConflict = normalizedEvents.some((event: any) => {
          if (event.date !== dateStr) return false
          return slot.startTime < event.endTime && slot.endTime > event.startTime
        })

        if (!hasConflict) {
          // Check exception time ranges
          const timeException = normalizedExceptions.find(e => {
            if (e.date !== dateStr) return false
            if (!e.startTime || !e.endTime) return false
            return slot.startTime < e.endTime && slot.endTime > e.startTime
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

      currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000)
    }

    const hasHourlyRate = typeof tutorProfile.hourlyRate === 'number' && tutorProfile.hourlyRate > 0

    return NextResponse.json({
      available: true,
      hourlyRate: hasHourlyRate ? tutorProfile.hourlyRate : 0,
      pricingIncomplete: !hasHourlyRate,
      currency: tutorProfile.currency || 'USD',
      timezone: tutorProfile.timezone || 'UTC',
      slots,
    })
  } catch (error: any) {
    console.error('Fetch availability error:', error)
    const message = error?.message || String(error) || 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to fetch availability', details: message },
      { status: 500 }
    )
  }
}
