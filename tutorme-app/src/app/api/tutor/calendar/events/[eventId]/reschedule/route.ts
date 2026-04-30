/**
 * PATCH /api/tutor/calendar/events/[eventId]/reschedule
 * Reschedules a session by updating both CalendarEvent and LiveSession.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { calendarEvent, liveSession } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

const RescheduleSchema = z.object({
  newStartTime: z.string().datetime(),
  durationMinutes: z.number().min(5).max(480).optional(),
})

export const PATCH = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
      const tutorId = session.user.id
      const eventId = req.nextUrl.pathname.split('/').pop()

      if (!eventId) {
        return NextResponse.json({ error: 'Event ID is required' }, { status: 400 })
      }

      const body = await req.json().catch(() => ({}))
      const parsed = RescheduleSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request body', details: parsed.error.issues },
          { status: 400 }
        )
      }

      const { newStartTime, durationMinutes } = parsed.data
      const newStart = new Date(newStartTime)

      // Find the CalendarEvent
      const [calEvent] = await drizzleDb
        .select()
        .from(calendarEvent)
        .where(
          and(
            eq(calendarEvent.eventId, eventId),
            eq(calendarEvent.tutorId, tutorId),
            eq(calendarEvent.isCancelled, false)
          )
        )
        .limit(1)

      if (!calEvent) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      }

      const actualDuration = durationMinutes ??
        (calEvent.endTime && calEvent.startTime
          ? Math.round((new Date(calEvent.endTime).getTime() - new Date(calEvent.startTime).getTime()) / 60000)
          : 60)

      const newEnd = new Date(newStart.getTime() + actualDuration * 60000)

      // Update CalendarEvent
      await drizzleDb
        .update(calendarEvent)
        .set({
          startTime: newStart,
          endTime: newEnd,
          updatedAt: new Date(),
        })
        .where(eq(calendarEvent.eventId, eventId))

      // Update linked LiveSession if externalId exists
      if (calEvent.externalId) {
        await drizzleDb
          .update(liveSession)
          .set({
            scheduledAt: newStart,
            durationMinutes: actualDuration,
          })
          .where(
            and(
              eq(liveSession.sessionId, calEvent.externalId),
              eq(liveSession.tutorId, tutorId)
            )
          )
      }

      return NextResponse.json({
        success: true,
        eventId,
        newStartTime: newStart.toISOString(),
        newEndTime: newEnd.toISOString(),
        durationMinutes: actualDuration,
      })
    },
    { role: 'TUTOR' }
  )
)
