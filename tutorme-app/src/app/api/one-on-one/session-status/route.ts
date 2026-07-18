/**
 * GET /api/one-on-one/session-status?sessionId=…
 *
 * Lightweight, read-only status for the /call pre-join lobby: when the session
 * opens, whether it's live, and who it's with — without attempting the actual
 * join. Authorized to the session's two participants only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  liveSession,
  calendarEvent,
  oneOnOneBookingRequest,
  groupSession,
  groupSessionParticipant,
  profile,
} from '@/lib/db/schema'

// Match the join endpoint's early-entry window and the launcher's grace.
const EARLY_ENTRY_MS = 20 * 60 * 1000
const LINGER_AFTER_END_MS = 15 * 60 * 1000

export const GET = withAuth(async (req: NextRequest, session) => {
  const sessionId = new URL(req.url).searchParams.get('sessionId')
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  }
  const userId = session.user.id

  const [ls] = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      scheduledAt: liveSession.scheduledAt,
      durationMinutes: liveSession.durationMinutes,
      status: liveSession.status,
      title: liveSession.title,
      tutorId: liveSession.tutorId,
    })
    .from(liveSession)
    .where(eq(liveSession.sessionId, sessionId))
    .limit(1)

  if (!ls) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const now = Date.now()
  const start = ls.scheduledAt ? new Date(ls.scheduledAt).getTime() : NaN
  const end = Number.isFinite(start) ? start + (ls.durationMinutes ?? 60) * 60 * 1000 : NaN
  const opensAt = Number.isFinite(start) ? start - EARLY_ENTRY_MS : NaN
  const live = ls.status === 'active'

  // Resolve who the session is with + authorize the caller. Try 1-on-1 (linked via
  // the calendar event), then a group session (whose liveSessionId is this room).
  let isTutor = false
  let title = ls.title || 'Session'
  let withName = ''
  let authorized = false

  const [booking] = await drizzleDb
    .select({
      studentId: oneOnOneBookingRequest.studentId,
      tutorId: oneOnOneBookingRequest.tutorId,
    })
    .from(oneOnOneBookingRequest)
    .innerJoin(calendarEvent, eq(calendarEvent.eventId, oneOnOneBookingRequest.calendarEventId))
    .where(eq(calendarEvent.externalId, sessionId))
    .limit(1)

  if (booking) {
    isTutor = booking.tutorId === userId
    authorized = booking.studentId === userId || isTutor
    if (authorized) {
      title = ls.title || '1-on-1 Session'
      const otherId = isTutor ? booking.studentId : booking.tutorId
      const [other] = await drizzleDb
        .select({ name: profile.name })
        .from(profile)
        .where(eq(profile.userId, otherId))
        .limit(1)
      withName = other?.name || (isTutor ? 'your student' : 'your tutor')
    }
  } else {
    const [gs] = await drizzleDb
      .select({
        groupSessionId: groupSession.groupSessionId,
        tutorId: groupSession.tutorId,
        title: groupSession.title,
      })
      .from(groupSession)
      .where(eq(groupSession.liveSessionId, sessionId))
      .limit(1)
    if (gs) {
      isTutor = gs.tutorId === userId
      if (isTutor) {
        authorized = true
        title = gs.title || 'Group session'
        withName = 'your group'
      } else {
        const [seat] = await drizzleDb
          .select({ id: groupSessionParticipant.participantId })
          .from(groupSessionParticipant)
          .where(
            and(
              eq(groupSessionParticipant.groupSessionId, gs.groupSessionId),
              eq(groupSessionParticipant.studentId, userId),
              eq(groupSessionParticipant.status, 'PAID')
            )
          )
          .limit(1)
        if (seat) {
          authorized = true
          title = gs.title || 'Group session'
          const [tut] = await drizzleDb
            .select({ name: profile.name })
            .from(profile)
            .where(eq(profile.userId, gs.tutorId))
            .limit(1)
          withName = tut?.name || 'your tutor'
        }
      }
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  return NextResponse.json({
    sessionId: ls.sessionId,
    title,
    withName,
    viewerIsTutor: isTutor,
    scheduledAt: Number.isFinite(start) ? new Date(start).toISOString() : null,
    durationMinutes: ls.durationMinutes ?? 60,
    // The persisted lifecycle status — lets the classroom show its "ended" overlay
    // on reload / late-join after a manual early end (the time-based `ended` below
    // only reflects the scheduled window, not an early end).
    status: ls.status,
    opensAt: Number.isFinite(opensAt) ? new Date(opensAt).toISOString() : null,
    live,
    // The tutor may always enter; a student once the session is live or inside the
    // 20-min entry window.
    joinable: isTutor || live || (Number.isFinite(opensAt) && now >= opensAt),
    ended: Number.isFinite(end) && now > end + LINGER_AFTER_END_MS,
  })
})
