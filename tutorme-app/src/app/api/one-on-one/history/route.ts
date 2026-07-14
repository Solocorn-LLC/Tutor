/**
 * GET /api/one-on-one/history  (tutor only)
 *
 * The tutor's recent COMPLETED 1-on-1 sessions with, for each, whether the
 * student actually showed up (derived from the session's participant rows) and
 * the student's review if they left one — plus the tutor's overall rating.
 * Powers the "Your 1-on-1 reviews" card.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, eq, desc, sql } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  oneOnOneBookingRequest,
  oneOnOneReview,
  calendarEvent,
  sessionParticipant,
  profile,
} from '@/lib/db/schema'

export const GET = withAuth(
  async (_req: NextRequest, session) => {
    const tutorId = session.user.id

    const rows = await drizzleDb
      .select({
        requestId: oneOnOneBookingRequest.requestId,
        requestedDate: oneOnOneBookingRequest.requestedDate,
        startTime: oneOnOneBookingRequest.startTime,
        studentName: profile.name,
        // Attended if a participant row exists for this student on the session.
        attended: sql<boolean>`${sessionParticipant.participantId} is not null`,
        rating: oneOnOneReview.rating,
        comment: oneOnOneReview.comment,
      })
      .from(oneOnOneBookingRequest)
      .leftJoin(profile, eq(profile.userId, oneOnOneBookingRequest.studentId))
      .leftJoin(calendarEvent, eq(calendarEvent.eventId, oneOnOneBookingRequest.calendarEventId))
      .leftJoin(
        sessionParticipant,
        and(
          eq(sessionParticipant.sessionId, calendarEvent.externalId),
          eq(sessionParticipant.studentId, oneOnOneBookingRequest.studentId)
        )
      )
      .leftJoin(oneOnOneReview, eq(oneOnOneReview.requestId, oneOnOneBookingRequest.requestId))
      .where(
        and(
          eq(oneOnOneBookingRequest.tutorId, tutorId),
          eq(oneOnOneBookingRequest.status, 'COMPLETED')
        )
      )
      .orderBy(desc(oneOnOneBookingRequest.requestedDate))
      .limit(30)

    const [agg] = await drizzleDb
      .select({
        avgRating: sql<number>`coalesce(avg(${oneOnOneReview.rating}), 0)`,
        reviewCount: sql<number>`count(*)::int`,
      })
      .from(oneOnOneReview)
      .where(eq(oneOnOneReview.tutorId, tutorId))

    return NextResponse.json({
      sessions: rows.map(r => ({
        requestId: r.requestId,
        date: r.requestedDate ? new Date(r.requestedDate).toISOString() : null,
        startTime: r.startTime,
        studentName: r.studentName || 'Student',
        attended: !!r.attended,
        rating: r.rating ?? null,
        comment: r.comment ?? null,
      })),
      averageRating: Math.round(Number(agg?.avgRating ?? 0) * 10) / 10,
      reviewCount: Number(agg?.reviewCount ?? 0),
    })
  },
  { role: 'TUTOR' }
)
