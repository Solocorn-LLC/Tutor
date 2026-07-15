/**
 * Ensure a PAID 1-on-1 booking has a joinable live session.
 *
 * Normally the tutor's accept (`one-on-one/respond`) creates the LiveSession +
 * linked CalendarEvent. This endpoint is a self-heal for the anomalous case
 * where a PAID booking's event has no linked session (externalId null) — the
 * student would otherwise see "not linked to a session" and be unable to join.
 *
 * It returns the existing session if one is linked, otherwise creates one
 * (idempotently, mirroring respond) and re-points the booking at it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { withCsrf, withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest, calendarEvent, liveSession } from '@/lib/db/schema'
import { createSession } from '@/lib/sessions/create-session'

const BodySchema = z.object({ requestId: z.string().min(1) })

export const POST = withCsrf(
  withAuth(async (req: NextRequest, session) => {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
    }
    const { requestId } = parsed.data
    const userId = session.user.id

    const [booking] = await drizzleDb
      .select({
        tutorId: oneOnOneBookingRequest.tutorId,
        studentId: oneOnOneBookingRequest.studentId,
        status: oneOnOneBookingRequest.status,
        calendarEventId: oneOnOneBookingRequest.calendarEventId,
        durationMinutes: oneOnOneBookingRequest.durationMinutes,
        timezone: oneOnOneBookingRequest.timezone,
        courseId: oneOnOneBookingRequest.courseId,
      })
      .from(oneOnOneBookingRequest)
      .where(eq(oneOnOneBookingRequest.requestId, requestId))
      .limit(1)

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    // Only the two participants may resolve the session.
    if (booking.studentId !== userId && booking.tutorId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    // A session is only joinable once the booking is confirmed/paid.
    if (booking.status !== 'PAID') {
      return NextResponse.json({ error: 'This session is not confirmed yet.' }, { status: 409 })
    }

    // Look up the currently-linked event (if any).
    const [event] = booking.calendarEventId
      ? await drizzleDb
          .select({
            externalId: calendarEvent.externalId,
            startTime: calendarEvent.startTime,
            endTime: calendarEvent.endTime,
          })
          .from(calendarEvent)
          .where(eq(calendarEvent.eventId, booking.calendarEventId))
          .limit(1)
      : []

    // Already linked to a real live session → nothing to heal.
    if (event?.externalId) {
      const [ls] = await drizzleDb
        .select({ sessionId: liveSession.sessionId })
        .from(liveSession)
        .where(eq(liveSession.sessionId, event.externalId))
        .limit(1)
      if (ls) return NextResponse.json({ sessionId: ls.sessionId, healed: false })
    }

    // Derive the schedule from the existing event (authoritative), else now.
    const scheduledAt = event?.startTime ?? new Date()
    const durationMinutes =
      booking.durationMinutes ||
      (event?.startTime && event?.endTime
        ? Math.max(15, Math.round((event.endTime.getTime() - event.startTime.getTime()) / 60000))
        : 60)

    const result = await drizzleDb.transaction(async tx => {
      // Re-check under the transaction so concurrent joins don't double-create.
      if (booking.calendarEventId) {
        const [fresh] = await tx
          .select({ externalId: calendarEvent.externalId })
          .from(calendarEvent)
          .where(eq(calendarEvent.eventId, booking.calendarEventId))
          .limit(1)
        if (fresh?.externalId) {
          const [ls] = await tx
            .select({ sessionId: liveSession.sessionId })
            .from(liveSession)
            .where(eq(liveSession.sessionId, fresh.externalId))
            .limit(1)
          if (ls) return { sessionId: ls.sessionId, healed: false }
        }
      }

      const { liveSession: created, calendarEvent: newEvent } = await createSession(
        {
          tutorId: booking.tutorId,
          title: '1-on-1 Session',
          scheduledAt,
          durationMinutes,
          category: 'Consultation',
          type: 'ONE_ON_ONE',
          studentId: booking.studentId,
          maxStudents: 2,
          description: 'One-on-one tutoring session',
          timezone: booking.timezone,
          courseId: booking.courseId ?? undefined,
        },
        tx
      )

      // Point the booking at the freshly-linked event (mirrors respond).
      await tx
        .update(oneOnOneBookingRequest)
        .set({ calendarEventId: newEvent.eventId, updatedAt: new Date() })
        .where(eq(oneOnOneBookingRequest.requestId, requestId))

      return { sessionId: created.sessionId, healed: true }
    })

    return NextResponse.json(result)
  })
)
