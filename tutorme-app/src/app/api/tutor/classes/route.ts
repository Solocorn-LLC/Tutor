/**
 * GET /api/tutor/classes
 * Returns the current tutor's classes: upcoming (scheduledAt >= now) and active sessions.
 *
 * "Upcoming" definition: all future scheduled sessions plus any currently active session,
 * with no time cap (all future dates). Same definition used for the "Upcoming" stat count.
 */

import { NextResponse } from 'next/server'
import { eq, or, and, gte, asc, ne, desc } from 'drizzle-orm'
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
    const includeDemoClasses = req.nextUrl.searchParams.get('includeDemoClasses') === '1'

    const sessions = await drizzleDb.query.liveSession.findMany({
      where: includeEnded
        ? eq(liveSessionTable.tutorId, tutorId)
        : (() => {
            // Upcoming = future or in-progress, but never an ended/cancelled session
            // (an ended session with a future scheduledAt must not show as "upcoming").
            // Demo classes are schedule-less and live only in the dedicated demos tab
            // unless explicitly requested (e.g. by the live insights/deploy page).
            const filters = [
              eq(liveSessionTable.tutorId, tutorId),
              ne(liveSessionTable.status, 'ended'),
            ]
            if (!includeDemoClasses) {
              filters.push(ne(liveSessionTable.sessionType, 'GO_LIVE_DEMO'))
            }
            return and(
              ...filters,
              or(gte(liveSessionTable.scheduledAt, now), eq(liveSessionTable.status, 'active'))
            )
          })(),
      with: {
        participants: {
          columns: { participantId: true },
        },
      },
      orderBy: includeEnded
        ? [desc(liveSessionTable.createdAt)]
        : [asc(liveSessionTable.scheduledAt)],
    })

    const classes = sessions.map(s => ({
      id: s.sessionId,
      courseId: s.courseId,
      title: s.title,
      subject: s.category,
      scheduledAt: s.scheduledAt?.toISOString() ?? null,
      createdAt: s.createdAt?.toISOString() ?? null,
      startedAt: s.startedAt?.toISOString() ?? null,
      endedAt: s.endedAt?.toISOString() ?? null,
      duration: s.durationMinutes,
      maxStudents: s.maxStudents,
      enrolledStudents: s.participants.length,
      status: s.status,
      sessionType: s.sessionType,
      description: s.description,
      tutorLeftAt: s.tutorLeftAt?.toISOString() ?? null,
    }))

    return NextResponse.json({ classes })
  },
  { role: 'TUTOR' }
)
