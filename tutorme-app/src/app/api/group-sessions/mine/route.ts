/**
 * GET /api/group-sessions/mine  (student)
 *
 * The group sessions the signed-in student holds a PAID seat in and that haven't
 * finished yet — so the student page can show them with a Join button (the
 * browse feed only lists OPEN sessions with seats left, never the ones you've
 * already booked). `joinable` is true once the room opens (20 min before start).
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq, gte } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { groupSession, groupSessionParticipant, liveSession, profile } from '@/lib/db/schema'

const EARLY_ENTRY_MS = 20 * 60 * 1000

export const GET = withAuth(async (_req: NextRequest, session) => {
  const now = new Date()
  // Keep sessions that are within their window or upcoming (grace: started up to
  // 3h ago still count as "now").
  const graceStart = new Date(now.getTime() - 3 * 60 * 60 * 1000)

  const rows = await drizzleDb
    .select({
      groupSessionId: groupSession.groupSessionId,
      title: groupSession.title,
      liveSessionId: groupSession.liveSessionId,
      requestedDate: groupSession.requestedDate,
      startTime: groupSession.startTime,
      endTime: groupSession.endTime,
      timezone: groupSession.timezone,
      status: groupSession.status,
      scheduledAt: liveSession.scheduledAt,
      durationMinutes: liveSession.durationMinutes,
      tutorName: profile.name,
    })
    .from(groupSessionParticipant)
    .innerJoin(
      groupSession,
      eq(groupSession.groupSessionId, groupSessionParticipant.groupSessionId)
    )
    .innerJoin(liveSession, eq(liveSession.sessionId, groupSession.liveSessionId))
    .leftJoin(profile, eq(profile.userId, groupSession.tutorId))
    .where(
      and(
        eq(groupSessionParticipant.studentId, session.user.id),
        eq(groupSessionParticipant.status, 'PAID'),
        gte(liveSession.scheduledAt, graceStart)
      )
    )
    .orderBy(asc(liveSession.scheduledAt))
    .limit(50)

  return NextResponse.json({
    sessions: rows.map(r => ({
      groupSessionId: r.groupSessionId,
      title: r.title,
      liveSessionId: r.liveSessionId,
      requestedDate: r.requestedDate,
      startTime: r.startTime,
      endTime: r.endTime,
      timezone: r.timezone,
      tutorName: r.tutorName,
      scheduledAt: r.scheduledAt,
      // Joinable from 20 min before start UNTIL the session ends (start +
      // duration) — otherwise a finished session kept showing an active "Join".
      joinable: (() => {
        if (!r.scheduledAt) return false
        const startMs = r.scheduledAt.getTime()
        const endMs = startMs + (r.durationMinutes ?? 120) * 60_000
        return startMs - now.getTime() <= EARLY_ENTRY_MS && now.getTime() < endMs
      })(),
    })),
  })
})
