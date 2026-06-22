import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  calendarEvent,
  liveSession,
  courseEnrollment,
  sessionParticipant,
  profile,
} from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { findConflicts, findAlternativeSlots } from '@/lib/schedule/conflicts'
import { notify } from '@/lib/notifications/notify'

/** Format an instant in a specific IANA timezone, with the zone labelled. */
function formatInZone(date: Date, tz: string): string {
  try {
    // NB: timeZoneName can't be combined with dateStyle/timeStyle (throws),
    // so spell out the fields explicitly.
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
      timeZoneName: 'short',
    }).format(date)
  } catch {
    // Invalid/unknown tz → fall back to UTC, still labelled.
    try {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short',
      }).format(date)
    } catch {
      return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`
    }
  }
}

/**
 * Notify every student of a rescheduled session (in-app + SSE + web push +
 * email, via notify.ts). Students come from the course enrollment (the
 * reliable roster) plus anyone already added as a session participant. The new
 * time is formatted in EACH student's own profile timezone so it reads as their
 * local time; the session's timezone (or UTC) is the fallback.
 * Best-effort: never throws into the reschedule request.
 */
async function notifyStudentsOfReschedule(opts: {
  sessionId: string
  courseId: string | null
  title: string | null
  newStart: Date
  timezone?: string | null
}): Promise<void> {
  try {
    const { sessionId, courseId, title, newStart, timezone } = opts
    const ids = new Set<string>()
    if (courseId) {
      const enrolled = await drizzleDb
        .select({ studentId: courseEnrollment.studentId })
        .from(courseEnrollment)
        .where(eq(courseEnrollment.courseId, courseId))
      for (const r of enrolled) if (r.studentId) ids.add(r.studentId)
    }
    const participants = await drizzleDb
      .select({ studentId: sessionParticipant.studentId })
      .from(sessionParticipant)
      .where(eq(sessionParticipant.sessionId, sessionId))
    for (const r of participants) if (r.studentId) ids.add(r.studentId)

    const userIds = Array.from(ids)
    if (userIds.length === 0) return

    // Each student's own timezone (default 'UTC' in schema) → localize per user.
    const tzRows = await drizzleDb
      .select({ userId: profile.userId, timezone: profile.timezone })
      .from(profile)
      .where(inArray(profile.userId, userIds))
    const tzByUser = new Map(tzRows.map(r => [r.userId, r.timezone]))
    const fallbackTz = timezone || 'UTC'

    const name = title || 'Your session'
    const actionUrl = courseId ? `/student/classroom/${courseId}` : '/student/schedule'

    await Promise.allSettled(
      userIds.map(userId => {
        const when = formatInZone(newStart, tzByUser.get(userId) || fallbackTz)
        return notify({
          userId,
          type: 'class',
          title: 'Session rescheduled',
          message: `"${name}" has been moved to ${when}.`,
          data: { sessionId, scheduledAt: newStart.toISOString() },
          actionUrl,
        })
      })
    )
  } catch (err) {
    console.warn('[reschedule] student notification failed (non-critical):', err)
  }
}

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

        // Keep any CalendarEvent projection for this session in sync too, so the
        // student calendar (which prefers CalendarEvent.startTime) never shows a
        // stale time.
        await drizzleDb
          .update(calendarEvent)
          .set({ startTime: newStart, endTime: sessEnd, updatedAt: new Date() })
          .where(eq(calendarEvent.externalId, eventId))

        await notifyStudentsOfReschedule({
          sessionId: eventId,
          courseId: sess.courseId,
          title: sess.title,
          newStart,
        })

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

        // Notify the session's students (only sessions have a roster; pure
        // personal calendar events with no externalId have nobody to notify).
        await notifyStudentsOfReschedule({
          sessionId: calEvent.externalId,
          courseId: calEvent.courseId,
          title: calEvent.title,
          newStart,
          timezone: calEvent.timezone,
        })
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
