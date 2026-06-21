/**
 * GET /api/tutor/live-sessions/[sessionId]/comprehension
 *
 * Per-student comprehension for the live session's course, derived from real
 * task-submission correctness: the average of (score / maxScore) over the
 * student's scored submissions on the course's tasks. Returns null understanding
 * for students with no scored submissions yet (never fabricated).
 *
 * Used by the tutor Monitor tab to show a live "Understanding" indicator.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, builderTask, taskSubmission } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  async (_req: NextRequest, session, context) => {
    const sessionId = await getParamAsync(context.params, 'sessionId')
    if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })

    const [sess] = await drizzleDb
      .select({ courseId: liveSession.courseId, tutorId: liveSession.tutorId })
      .from(liveSession)
      .where(eq(liveSession.sessionId, sessionId))
      .limit(1)
    if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.user.role !== 'ADMIN' && sess.tutorId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!sess.courseId) return NextResponse.json({ comprehension: {} })

    const tasks = await drizzleDb
      .select({ taskId: builderTask.taskId })
      .from(builderTask)
      .where(eq(builderTask.courseId, sess.courseId))
    const taskIds = tasks.map(t => t.taskId)
    if (taskIds.length === 0) return NextResponse.json({ comprehension: {} })

    const subs = await drizzleDb
      .select({
        studentId: taskSubmission.studentId,
        score: taskSubmission.score,
        maxScore: taskSubmission.maxScore,
      })
      .from(taskSubmission)
      .where(and(inArray(taskSubmission.taskId, taskIds)))

    const agg: Record<string, { sum: number; scored: number; total: number }> = {}
    for (const s of subs) {
      const a = (agg[s.studentId] ||= { sum: 0, scored: 0, total: 0 })
      a.total += 1
      if (typeof s.score === 'number') {
        a.scored += 1
        a.sum += (s.score / (s.maxScore || 100)) * 100
      }
    }

    const comprehension = Object.fromEntries(
      Object.entries(agg).map(([id, a]) => [
        id,
        {
          understanding: a.scored > 0 ? Math.round(a.sum / a.scored) : null,
          scored: a.scored,
          total: a.total,
        },
      ])
    )

    return NextResponse.json({ comprehension })
  },
  { role: 'TUTOR' }
)
