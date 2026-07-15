/**
 * GET /api/one-on-one/live-now
 *
 * The current user's most imminent confirmed session — 1-on-1 OR group session,
 * live now or starting soon — for the global Session Launcher. Works for either
 * participant. Returns null when nothing is near, so the launcher stays hidden.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, eq, or, gte, lte, inArray } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  oneOnOneBookingRequest,
  calendarEvent,
  liveSession,
  groupSession,
  groupSessionParticipant,
  profile,
} from '@/lib/db/schema'

const LOOKAHEAD_MS = 30 * 60 * 1000 // 30 min before start
const LINGER_AFTER_END_MS = 15 * 60 * 1000 // 15 min after end
// Must match the join endpoint's early-entry window.
const EARLY_ENTRY_MS = 20 * 60 * 1000

interface Candidate {
  sessionId: string
  scheduledAt: Date | null
  durationMinutes: number | null
  status: string | null
  isGroup: boolean
  tutorId: string
  /** 1-on-1: the other party (for the "1-on-1 with X" label). */
  studentId: string | null
  /** Group: the session title. */
  title: string | null
  /** Student booked but hasn't paid — the launcher nudges "Pay to join". */
  needsPayment?: boolean
  /** 1-on-1 pending payment: the request to pay for. */
  requestId?: string | null
  /** Group pending payment: the reserved seat to resume checkout for. */
  participantId?: string | null
}

export const GET = withAuth(async (_req: NextRequest, session) => {
  const userId = session.user.id
  const now = Date.now()
  const from = new Date(now - 4 * 60 * 60 * 1000)
  const until = new Date(now + LOOKAHEAD_MS)

  // 1-on-1 sessions the user is in (either side).
  const oneOnOnes = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      scheduledAt: liveSession.scheduledAt,
      durationMinutes: liveSession.durationMinutes,
      status: liveSession.status,
      tutorId: oneOnOneBookingRequest.tutorId,
      studentId: oneOnOneBookingRequest.studentId,
    })
    .from(oneOnOneBookingRequest)
    .innerJoin(calendarEvent, eq(calendarEvent.eventId, oneOnOneBookingRequest.calendarEventId))
    .innerJoin(liveSession, eq(liveSession.sessionId, calendarEvent.externalId))
    .where(
      and(
        eq(oneOnOneBookingRequest.status, 'PAID'),
        or(
          eq(oneOnOneBookingRequest.studentId, userId),
          eq(oneOnOneBookingRequest.tutorId, userId)
        ),
        eq(calendarEvent.isCancelled, false),
        gte(liveSession.scheduledAt, from),
        lte(liveSession.scheduledAt, until)
      )
    )

  // Group sessions the user holds a paid seat in.
  const groupAsStudent = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      scheduledAt: liveSession.scheduledAt,
      durationMinutes: liveSession.durationMinutes,
      status: liveSession.status,
      tutorId: groupSession.tutorId,
      title: groupSession.title,
    })
    .from(groupSessionParticipant)
    .innerJoin(
      groupSession,
      eq(groupSession.groupSessionId, groupSessionParticipant.groupSessionId)
    )
    .innerJoin(liveSession, eq(liveSession.sessionId, groupSession.liveSessionId))
    .where(
      and(
        eq(groupSessionParticipant.studentId, userId),
        eq(groupSessionParticipant.status, 'PAID'),
        inArray(groupSession.status, ['OPEN', 'FULL', 'COMPLETED']),
        gte(liveSession.scheduledAt, from),
        lte(liveSession.scheduledAt, until)
      )
    )

  // Group sessions the user hosts.
  const groupAsTutor = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      scheduledAt: liveSession.scheduledAt,
      durationMinutes: liveSession.durationMinutes,
      status: liveSession.status,
      tutorId: groupSession.tutorId,
      title: groupSession.title,
    })
    .from(groupSession)
    .innerJoin(liveSession, eq(liveSession.sessionId, groupSession.liveSessionId))
    .where(
      and(
        eq(groupSession.tutorId, userId),
        inArray(groupSession.status, ['OPEN', 'FULL']),
        gte(liveSession.scheduledAt, from),
        lte(liveSession.scheduledAt, until)
      )
    )

  // Student-only: imminent bookings that are accepted/reserved but NOT yet paid.
  // Surfaced so the launcher can nudge "Pay to join" before start — otherwise an
  // unpaid booking gets no app-wide reminder and the student silently misses the
  // session they booked. (Tutors can't act on an unpaid booking, so tutor-side is
  // intentionally excluded.)
  const unpaidOneOnOnes = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      scheduledAt: liveSession.scheduledAt,
      durationMinutes: liveSession.durationMinutes,
      status: liveSession.status,
      tutorId: oneOnOneBookingRequest.tutorId,
      studentId: oneOnOneBookingRequest.studentId,
      requestId: oneOnOneBookingRequest.requestId,
    })
    .from(oneOnOneBookingRequest)
    .innerJoin(calendarEvent, eq(calendarEvent.eventId, oneOnOneBookingRequest.calendarEventId))
    .innerJoin(liveSession, eq(liveSession.sessionId, calendarEvent.externalId))
    .where(
      and(
        eq(oneOnOneBookingRequest.status, 'ACCEPTED'),
        eq(oneOnOneBookingRequest.studentId, userId),
        eq(calendarEvent.isCancelled, false),
        gte(liveSession.scheduledAt, from),
        lte(liveSession.scheduledAt, until)
      )
    )

  const unpaidGroup = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      scheduledAt: liveSession.scheduledAt,
      durationMinutes: liveSession.durationMinutes,
      status: liveSession.status,
      tutorId: groupSession.tutorId,
      title: groupSession.title,
      participantId: groupSessionParticipant.participantId,
    })
    .from(groupSessionParticipant)
    .innerJoin(
      groupSession,
      eq(groupSession.groupSessionId, groupSessionParticipant.groupSessionId)
    )
    .innerJoin(liveSession, eq(liveSession.sessionId, groupSession.liveSessionId))
    .where(
      and(
        eq(groupSessionParticipant.studentId, userId),
        eq(groupSessionParticipant.status, 'RESERVED'),
        inArray(groupSession.status, ['OPEN', 'FULL']),
        gte(liveSession.scheduledAt, from),
        lte(liveSession.scheduledAt, until)
      )
    )

  const candidates: Candidate[] = [
    ...oneOnOnes.map(r => ({ ...r, isGroup: false, title: null as string | null })),
    ...groupAsStudent.map(r => ({ ...r, isGroup: true, studentId: null as string | null })),
    ...groupAsTutor.map(r => ({ ...r, isGroup: true, studentId: null as string | null })),
    ...unpaidOneOnOnes.map(r => ({
      ...r,
      isGroup: false,
      title: null as string | null,
      needsPayment: true,
    })),
    ...unpaidGroup.map(r => ({
      ...r,
      isGroup: true,
      studentId: null as string | null,
      needsPayment: true,
    })),
  ]
    .filter(c => c.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())

  // Soonest one still within its live window.
  const pick = candidates.find(c => {
    const start = new Date(c.scheduledAt!).getTime()
    const end = start + (c.durationMinutes ?? 60) * 60 * 1000
    return now <= end + LINGER_AFTER_END_MS
  })
  if (!pick || !pick.scheduledAt) {
    return NextResponse.json({ session: null })
  }

  const start = new Date(pick.scheduledAt).getTime()
  const viewerIsTutor = pick.tutorId === userId

  let title: string
  if (pick.isGroup) {
    title = pick.title || 'Group session'
  } else {
    const otherId = viewerIsTutor ? pick.studentId : pick.tutorId
    const [other] = otherId
      ? await drizzleDb
          .select({ name: profile.name })
          .from(profile)
          .where(eq(profile.userId, otherId))
          .limit(1)
      : [null]
    title = `1-on-1 with ${other?.name || (viewerIsTutor ? 'your student' : 'your tutor')}`
  }

  const needsPayment = !!pick.needsPayment

  return NextResponse.json({
    session: {
      sessionId: pick.sessionId,
      scheduledAt: new Date(pick.scheduledAt).toISOString(),
      title,
      viewerIsTutor,
      // An unpaid booking can't be joined until checkout completes — the launcher
      // shows "Pay to join" instead of Join and routes to the pay path below.
      needsPayment,
      joinable: !needsPayment && (pick.status === 'active' || now >= start - EARLY_ENTRY_MS),
      live: !needsPayment && pick.status === 'active',
      payRequestId: needsPayment ? (pick.requestId ?? null) : null,
      payParticipantId: needsPayment ? (pick.participantId ?? null) : null,
    },
  })
})
