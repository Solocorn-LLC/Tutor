/**
 * Calendar Availability Check API
 * POST /api/tutor/calendar/check
 *
 * Check if a specific time slot is available for booking
 * Used before creating new events to avoid conflicts
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { calendarEvent, calendarAvailability, calendarException } from '@/lib/db/schema'
import { eq, and, or, gte, lte, lt, gt, isNull, ne, not } from 'drizzle-orm'
import { z } from 'zod'
import { findConflicts, findAlternativeSlots, type ConflictResult } from '@/lib/schedule/conflicts'

const CheckAvailabilitySchema = z.object({
  tutorId: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  excludeEventId: z.string().optional(),
})

export const POST = withAuth(async (req: NextRequest, session) => {
  const userId = session.user.id
  const userRole = session.user.role

  try {
    const body = await req.json()
    const validation = CheckAvailabilitySchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.format() },
        { status: 400 }
      )
    }

    const { tutorId, startTime, endTime, excludeEventId } = validation.data

    if (userRole === 'TUTOR' && tutorId !== userId) {
      return NextResponse.json({ error: 'Can only check your own availability' }, { status: 403 })
    }

    const start = new Date(startTime)
    const end = new Date(endTime)

    if (end <= start) {
      return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
    }

    // Use unified conflict detector (checks liveSession, calendarEvent, oneOnOne)
    const conflicts = await findConflicts(tutorId, start, end, {
      excludeEventId,
    })

    const dayOfWeek = start.getDay()
    const dateStr = start.toISOString().split('T')[0]
    const timeStr = start.toTimeString().slice(0, 5)

    const availability = await drizzleDb
      .select()
      .from(calendarAvailability)
      .where(
        and(
          eq(calendarAvailability.tutorId, tutorId),
          eq(calendarAvailability.dayOfWeek, dayOfWeek),
          eq(calendarAvailability.isAvailable, true),
          or(isNull(calendarAvailability.validUntil), gte(calendarAvailability.validUntil, start))
        )
      )

    const exceptionWhere = and(
      eq(calendarException.tutorId, tutorId),
      eq(calendarException.date, new Date(dateStr)),
      or(
        and(isNull(calendarException.startTime), isNull(calendarException.endTime)),
        and(
          not(isNull(calendarException.startTime)),
          not(isNull(calendarException.endTime)),
          lte(calendarException.startTime, timeStr),
          gte(calendarException.endTime, timeStr)
        )
      )
    )
    const [exception] = await drizzleDb
      .select()
      .from(calendarException)
      .where(exceptionWhere)
      .limit(1)

    const isAvailable = availability.length > 0 && !exception && conflicts.length === 0

    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000)
    const suggestedTimes = isAvailable
      ? []
      : await findAlternativeSlots(tutorId, start, durationMinutes, {
          maxSuggestions: 3,
          excludeEventId,
        })

    return NextResponse.json({
      available: isAvailable,
      conflicts: conflicts.map((c: ConflictResult) => ({
        id: c.id,
        title: c.title,
        startTime: c.startTime,
        endTime: c.endTime,
        type: c.type,
      })),
      exception: exception
        ? {
            isAvailable: exception.isAvailable,
            reason: exception.reason,
          }
        : null,
      suggestedTimes,
      tutorTimezone: availability[0]?.timezone || 'Asia/Shanghai',
    })
  } catch (error) {
    console.error('Check availability error:', error)
    return handleApiError(
      error,
      'Failed to check availability',
      'api/tutor/calendar/check/route.ts'
    )
  }
})
