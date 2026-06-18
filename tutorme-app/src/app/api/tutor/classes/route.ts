/**
 * GET /api/tutor/classes
 * Returns the current tutor's classes: upcoming (scheduledAt >= now) and active sessions.
 *
 * "Upcoming" definition: all future scheduled sessions plus any currently active session,
 * with no time cap (all future dates). Same definition used for the "Upcoming" stat count.
 */

import { NextResponse } from 'next/server'
import { eq, or, and, gte, asc, ne } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession as liveSessionTable } from '@/lib/db/schema'

const DEFAULT_DURATION_MINUTES = 60

/** Upcoming = scheduled in the future OR status ACTIVE (no date limit). */
export const GET = withAuth(
  async (req, session) => {
    const tutorId = session.user.id
    const now = new Date()
    const includeEnded = req.nextUrl.searchParams.get('includeEnded') === '1'

    const sessions = await drizzleDb.query.liveSession.findMany({
      where: includeEnded
        ? eq(liveSessionTable.tutorId, tutorId)
        : // Upcoming = future or in-progress, but never an ended/cancelled session
          // (an ended session with a future scheduledAt must not show as "upcoming").
          and(
            eq(liveSessionTable.tutorId, tutorId),
            ne(liveSessionTable.status, 'ended'),
            or(gte(liveSessionTable.scheduledAt, now), eq(liveSessionTable.status, 'active'))
          ),
      with: {
        participants: {
          columns: { participantId: true },
        },
      },
      orderBy: [asc(liveSessionTable.scheduledAt)],
    })

    const classes = sessions.map(s => ({
      id: s.sessionId,
      courseId: s.courseId,
      title: s.title,
      subject: s.category,
      scheduledAt: s.scheduledAt?.toISOString() ?? new Date().toISOString(),
      startedAt: s.startedAt?.toISOString() ?? null,
      endedAt: s.endedAt?.toISOString() ?? null,
      duration: s.durationMinutes,
      maxStudents: s.maxStudents,
      enrolledStudents: s.participants.length,
      status: s.status,
    }))

    return NextResponse.json({ classes })
  },
  { role: 'TUTOR' }
)
