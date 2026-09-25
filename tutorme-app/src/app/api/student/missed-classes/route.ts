/**
 * GET /api/student/missed-classes
 *
 * Returns sessions the student missed (completed sessions they didn't attend
 * or left early), including recording URLs when available.
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { getServerSession, authOptions } from '@/lib/auth'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  sessionParticipant,
  courseEnrollment,
  liveSession,
  profile as profileTable,
} from '@/lib/db/schema'
import { eq, inArray, and, gte, ne } from 'drizzle-orm'
import { desc } from 'drizzle-orm'
import { expandToCourseFamily } from '@/lib/courses/variant-family'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const studentId = session.user.id
  const { searchParams } = new URL(req.url)
  const filter = searchParams.get('filter') || 'all'

  try {
    let dateFilter: Date | undefined
    const now = new Date()
    if (filter === 'week') {
      dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (filter === 'month') {
      dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }

    const participantRows = await drizzleDb
      .select({
        sessionId: sessionParticipant.sessionId,
        joinedAt: sessionParticipant.joinedAt,
        leftAt: sessionParticipant.leftAt,
      })
      .from(sessionParticipant)
      .where(eq(sessionParticipant.studentId, studentId))

    const participatedIds = new Set(
      participantRows
        .filter(p => {
          if (!p.leftAt) return false
          const stayDuration = p.leftAt.getTime() - (p.joinedAt?.getTime() ?? 0)
          return stayDuration < 5 * 60 * 1000
        })
        .map(p => p.sessionId)
    )

    const fullyAttendedIds = new Set(
      participantRows.filter(p => !participatedIds.has(p.sessionId)).map(p => p.sessionId)
    )

    const enrollmentRows = await drizzleDb
      .select({
        courseId: courseEnrollment.courseId,
      })
      .from(courseEnrollment)
      .where(eq(courseEnrollment.studentId, studentId))

    // Scope to the course families the student is actually enrolled in.
    // The previous tutorId-only scope leaked ended sessions from the tutor's
    // OTHER courses, ended demo rooms, and 1-on-1 sessions with other
    // students — including their recording URLs.
    const enrolledIds = [...new Set(enrollmentRows.map(e => e.courseId).filter(Boolean))]
    const familyIds = await expandToCourseFamily(enrolledIds)

    if (familyIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { sessions: [], totalMissed: 0 },
      })
    }

    const missedWhere = dateFilter
      ? and(
          inArray(liveSession.courseId, familyIds),
          ne(liveSession.sessionType, 'GO_LIVE_DEMO'),
          inArray(liveSession.status, ['ended']),
          gte(liveSession.scheduledAt!, dateFilter)
        )
      : and(
          inArray(liveSession.courseId, familyIds),
          ne(liveSession.sessionType, 'GO_LIVE_DEMO'),
          inArray(liveSession.status, ['ended'])
        )

    const missedSessionRows = await drizzleDb
      .select()
      .from(liveSession)
      .where(missedWhere)
      .orderBy(desc(liveSession.scheduledAt!))
      .limit(20)

    const tutorIdsForSessions = [...new Set(missedSessionRows.map(s => s.tutorId))]
    const tutorNames = new Map<string, string>()
    if (tutorIdsForSessions.length > 0) {
      const profiles = await drizzleDb
        .select({
          userId: profileTable.userId,
          name: profileTable.name,
        })
        .from(profileTable)
        .where(inArray(profileTable.userId, tutorIdsForSessions))
      for (const p of profiles) {
        if (p.name) tutorNames.set(p.userId, p.name)
      }
    }

    const missed = missedSessionRows
      .filter(s => s.endedAt != null && !fullyAttendedIds.has(s.sessionId))
      .map(s => ({
        id: s.sessionId,
        title: s.title,
        subject: s.category,
        tutorName: tutorNames.get(s.tutorId) ?? '',
        scheduledAt: s.scheduledAt,
        endedAt: s.endedAt,
        duration:
          s.scheduledAt && s.endedAt
            ? Math.round((s.endedAt.getTime() - s.scheduledAt.getTime()) / 60000)
            : null,
        recordingUrl: s.recordingUrl,
        recordingAvailableAt: s.recordingAvailableAt,
        hasRecording: !!s.recordingUrl,
        leftEarly: participatedIds.has(s.sessionId),
      }))

    return NextResponse.json({
      success: true,
      data: {
        sessions: missed,
        totalMissed: missed.length,
      },
    })
  } catch (error) {
    console.error('Failed to fetch missed classes:', error)
    return handleApiError(
      error,
      'Failed to fetch missed classes',
      'api/student/missed-classes/route.ts'
    )
  }
}
