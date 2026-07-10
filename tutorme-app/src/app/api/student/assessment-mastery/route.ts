/**
 * GET /api/student/assessment-mastery
 *
 * Per-topic mastery from the student's graded assessments: groups their
 * submissions by the lesson each task belongs to (the "topic"), and reports the
 * average score, a chronological trend, and the misconception tags that recur
 * across attempts (from the persisted AI study hints). Read-only aggregation —
 * no new storage; it reuses builderTask.lessonId + TaskSubmission.aiFeedback.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq, isNotNull } from 'drizzle-orm'
import { getServerSession, authOptions } from '@/lib/auth'
import { handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, courseLesson, taskSubmission } from '@/lib/db/schema'

interface TrendPoint {
  at: string | null
  score: number
}

interface TopicMastery {
  topic: string
  attempts: number
  averageScore: number
  latestScore: number
  /** Positive = improving over the topic's attempts. */
  delta: number
  trend: TrendPoint[]
  misconceptions: { label: string; count: number }[]
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions, request)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const studentId = session.user.id

    const rows = await drizzleDb
      .select({
        score: taskSubmission.score,
        submittedAt: taskSubmission.submittedAt,
        aiFeedback: taskSubmission.aiFeedback,
        taskTitle: builderTask.title,
        lessonTitle: courseLesson.title,
      })
      .from(taskSubmission)
      .innerJoin(builderTask, eq(taskSubmission.taskId, builderTask.taskId))
      .leftJoin(courseLesson, eq(builderTask.lessonId, courseLesson.lessonId))
      .where(and(eq(taskSubmission.studentId, studentId), isNotNull(taskSubmission.score)))
      .orderBy(asc(taskSubmission.submittedAt))
      .limit(500)

    // Group by topic = the task's lesson (fall back to the task title).
    const groups = new Map<string, { scores: TrendPoint[]; misconceptions: Map<string, number> }>()

    for (const r of rows) {
      const topic = (r.lessonTitle ?? r.taskTitle ?? 'General').trim() || 'General'
      const score = typeof r.score === 'number' ? Math.round(r.score) : null
      if (score === null) continue

      let g = groups.get(topic)
      if (!g) {
        g = { scores: [], misconceptions: new Map() }
        groups.set(topic, g)
      }
      g.scores.push({ at: r.submittedAt ? r.submittedAt.toISOString() : null, score })

      const items = (r.aiFeedback as { items?: Array<{ misconception?: string }> } | null)?.items
      if (Array.isArray(items)) {
        for (const it of items) {
          const label = it?.misconception?.trim()
          if (label) g.misconceptions.set(label, (g.misconceptions.get(label) ?? 0) + 1)
        }
      }
    }

    const topics: TopicMastery[] = Array.from(groups.entries()).map(([topic, g]) => {
      const scores = g.scores
      const avg = Math.round(scores.reduce((a, b) => a + b.score, 0) / scores.length)
      const latest = scores[scores.length - 1].score
      const first = scores[0].score
      return {
        topic,
        attempts: scores.length,
        averageScore: avg,
        latestScore: latest,
        delta: latest - first,
        trend: scores.slice(-8),
        misconceptions: Array.from(g.misconceptions.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([label, count]) => ({ label, count })),
      }
    })

    // Weakest topics first — the most useful thing for a student to see.
    topics.sort((a, b) => a.averageScore - b.averageScore)

    return NextResponse.json({ topics })
  } catch (error) {
    return handleApiError(
      error,
      'Failed to load mastery',
      'api/student/assessment-mastery/route.ts'
    )
  }
}
