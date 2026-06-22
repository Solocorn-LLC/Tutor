import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { calendarEvent, liveSession } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { findConflicts, findAlternativeSlots } from '@/lib/schedule/conflicts'

export const GET = withAuth(async () => {
  return NextResponse.json(
    {
      error: 'Legacy feature removed',
      message: 'Analytics overview has been redesigned. Please use the new dashboard.',
    },
    { status: 410 }
  )
})

const RescheduleSchema = z.object({
  newStartTime: z.string().datetime(),
  durationMinutes: z.number().min(5).max(480).optional(),
})

export const PATCH = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const tutorId = session.user.id
      const params = await context?.params
      const eventId = params?.id

      if (!eventId || typeof eventId !== 'string') {
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
        // The calendar merges standalone LiveSessions that have no CalendarEvent
        // row, surfacing them with id === sessionId. Dragging one sends that id
        // here, so fall back to rescheduling the session directly.
        const [sess] = await drizzleDb
          .select()
          .from(liveSession)
          .where(and(eq(liveSession.sessionId, eventId), eq(liveSession.tutorId, tutorId)))
          .limit(1)

        if (!sess) {
          return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const sessDuration = durationMinutes ?? sess.durationMinutes ?? 60
        const sessEnd = new Date(newStart.getTime() + sessDuration * 60000)

        const sessConflicts = await findConflicts(tutorId, newStart, sessEnd, {
          excludeSessionId: eventId,
        })
        if (sessConflicts.length > 0) {
          const alternativeSlots = await findAlternativeSlots(tutorId, newStart, sessDuration, {
            maxSuggestions: 3,
            excludeSessionId: eventId,
          })
          return NextResponse.json(
            {
              error: 'This time slot conflicts with an existing session.',
              conflicts: sessConflicts.map(c => ({
                type: c.type,
                title: c.title,
                startTime: c.startTime.toISOString(),
                endTime: c.endTime.toISOString(),
              })),
              suggestedTimes: alternativeSlots,
            },
            { status: 409 }
          )
        }

        await drizzleDb
          .update(liveSession)
          .set({ scheduledAt: newStart, durationMinutes: sessDuration })
          .where(and(eq(liveSession.sessionId, eventId), eq(liveSession.tutorId, tutorId)))

        return NextResponse.json({
          success: true,
          eventId,
          newStartTime: newStart.toISOString(),
          newEndTime: sessEnd.toISOString(),
          durationMinutes: sessDuration,
        })
      }

      const actualDuration =
        durationMinutes ??
        (calEvent.endTime && calEvent.startTime
          ? Math.round(
              (new Date(calEvent.endTime).getTime() - new Date(calEvent.startTime).getTime()) /
                60000
            )
          : 60)

      const newEnd = new Date(newStart.getTime() + actualDuration * 60000)

      // CHECK FOR CONFLICTS before updating
      const conflicts = await findConflicts(tutorId, newStart, newEnd, {
        excludeEventId: eventId,
        excludeSessionId: calEvent.externalId ?? undefined,
      })

      if (conflicts.length > 0) {
        const alternativeSlots = await findAlternativeSlots(tutorId, newStart, actualDuration, {
          maxSuggestions: 3,
          excludeEventId: eventId,
          excludeSessionId: calEvent.externalId ?? undefined,
        })
        return NextResponse.json(
          {
            error: 'This time slot conflicts with an existing session.',
            conflicts: conflicts.map(c => ({
              type: c.type,
              title: c.title,
              startTime: c.startTime.toISOString(),
              endTime: c.endTime.toISOString(),
            })),
            suggestedTimes: alternativeSlots,
          },
          { status: 409 }
        )
      }

      await drizzleDb
        .update(calendarEvent)
        .set({
          startTime: newStart,
          endTime: newEnd,
          updatedAt: new Date(),
        })
        .where(eq(calendarEvent.eventId, eventId))

      if (calEvent.externalId) {
        await drizzleDb
          .update(liveSession)
          .set({
            scheduledAt: newStart,
            durationMinutes: actualDuration,
          })
          .where(
            and(eq(liveSession.sessionId, calEvent.externalId), eq(liveSession.tutorId, tutorId))
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
