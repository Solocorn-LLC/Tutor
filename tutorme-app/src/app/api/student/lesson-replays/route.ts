import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { getServerSession, authOptions } from '@/lib/auth'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  liveSession,
  sessionParticipant,
  sessionReplayArtifact,
  profile,
  taskSubmission,
  courseLesson,
} from '@/lib/db/schema'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { expandToCourseFamily } from '@/lib/courses/variant-family'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions, _req)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const studentId = session.user.id

  try {
    const participantRows = await drizzleDb
      .select({ sessionId: sessionParticipant.sessionId })
      .from(sessionParticipant)
      .where(eq(sessionParticipant.studentId, studentId))
    const sessionIds = [...new Set(participantRows.map(p => p.sessionId))]

    if (sessionIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { sessions: [] },
      })
    }

    const sessions = await drizzleDb
      .select()
      .from(liveSession)
      .where(
        and(inArray(liveSession.sessionId, sessionIds), inArray(liveSession.status, ['ended']))
      )
      .orderBy(desc(liveSession.endedAt))
      .limit(30)

    const endedSessions = sessions.filter(s => s.endedAt != null)

    const replayBySession = new Map<string, typeof sessionReplayArtifact.$inferSelect>()
    if (endedSessions.length > 0) {
      const replays = await drizzleDb
        .select()
        .from(sessionReplayArtifact)
        .where(
          inArray(
            sessionReplayArtifact.sessionId,
            endedSessions.map(s => s.sessionId)
          )
        )
      replays.forEach(r => replayBySession.set(r.sessionId, r))
    }

    const tutorIds = [...new Set(endedSessions.map(s => s.tutorId))]
    const profiles =
      tutorIds.length > 0
        ? await drizzleDb
            .select({
              userId: profile.userId,
              name: profile.name,
            })
            .from(profile)
            .where(inArray(profile.userId, tutorIds))
        : []
    const tutorNameByUserId = new Map(profiles.map(p => [p.userId, p.name]))

    const data = await Promise.all(
      endedSessions.map(async liveSessionRow => {
        const taskCount = 0
        let submittedCount = 0

        // Lessons now directly reference courses (no modules)
        if (liveSessionRow.courseId) {
          const lessonFamily = await expandToCourseFamily([liveSessionRow.courseId])
          const lessonIds = (
            await drizzleDb
              .select({ lessonId: courseLesson.lessonId })
              .from(courseLesson)
              .where(inArray(courseLesson.courseId, lessonFamily))
          ).map(l => l.lessonId)

          if (lessonIds.length > 0) {
            const submitted = await drizzleDb
              .select()
              .from(taskSubmission)
              .where(
                and(
                  eq(taskSubmission.studentId, studentId),
                  inArray(taskSubmission.status, ['submitted', 'graded'])
                )
              )
            submittedCount = submitted.length
          }
        }

        const artifact = replayBySession.get(liveSessionRow.sessionId)
        const replaySummary =
          artifact?.summary ||
          (typeof artifact?.summaryJson === 'object' &&
          artifact?.summaryJson &&
          'overview' in (artifact.summaryJson as Record<string, unknown>)
            ? String((artifact.summaryJson as Record<string, unknown>).overview || '')
            : '')
        const summaryPreview = replaySummary.slice(0, 220)
        const tutorName = tutorNameByUserId.get(liveSessionRow.tutorId) ?? 'Tutor'

        return {
          id: liveSessionRow.sessionId,
          title: liveSessionRow.title,
          subject: liveSessionRow.category,
          tutorName,
          scheduledAt: liveSessionRow.scheduledAt,
          endedAt: liveSessionRow.endedAt,
          recordingUrl: liveSessionRow.recordingUrl,
          hasRecording: Boolean(liveSessionRow.recordingUrl),
          taskCount,
          submittedCount,
          summaryPreview,
          transcriptAvailable: Boolean(artifact?.transcript),
          replayStatus: artifact?.status ?? 'pending',
          generatedAt: artifact?.generatedAt ?? null,
        }
      })
    )

    return NextResponse.json({ success: true, data: { sessions: data } })
  } catch (error) {
    console.error('Failed to fetch lesson replays:', error)
    return handleApiError(
      error,
      'Failed to fetch lesson replays',
      'api/student/lesson-replays/route.ts'
    )
  }
}
