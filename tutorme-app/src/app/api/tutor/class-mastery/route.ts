/**
 * GET /api/tutor/class-mastery
 *
 * Class weak spots. Aggregates the tutor's students' graded submissions by the
 * lesson each task belongs to (the "topic") and reports, weakest-first, the
 * class average, how many students struggled, and the misconceptions that recur
 * across the class (from the persisted AI study hints). The tutor-side mirror of
 * the student's own topic-mastery view. Read-only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, eq, isNotNull } from 'drizzle-orm'
import { getServerSession, authOptions } from '@/lib/auth'
import { handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, courseLesson, taskSubmission } from '@/lib/db/schema'

/** A class average below this counts a student as "struggling" on a topic. */
const STRUGGLING_BELOW = 60

interface TopicWeakSpot {
  topic: string
  averageScore: number
  attempts: number
  students: number
  strugglingStudents: number
  misconceptions: { label: string; count: number }[]
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions, request)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user.role !== 'TUTOR' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const isAdmin = session.user.role === 'ADMIN'

    const rows = await drizzleDb
      .select({
        score: taskSubmission.score,
        studentId: taskSubmission.studentId,
        aiFeedback: taskSubmission.aiFeedback,
        taskTitle: builderTask.title,
        lessonTitle: courseLesson.title,
      })
      .from(taskSubmission)
      .innerJoin(builderTask, eq(taskSubmission.taskId, builderTask.taskId))
      .leftJoin(courseLesson, eq(builderTask.lessonId, courseLesson.lessonId))
      .where(
        isAdmin
          ? isNotNull(taskSubmission.score)
          : and(eq(builderTask.tutorId, session.user.id), isNotNull(taskSubmission.score))
      )
      .limit(2000)

    // topic → per-student scores + recurring misconceptions.
    const groups = new Map<
      string,
      { byStudent: Map<string, number[]>; misconceptions: Map<string, number> }
    >()

    for (const r of rows) {
      const topic = (r.lessonTitle ?? r.taskTitle ?? 'General').trim() || 'General'
      const score = typeof r.score === 'number' ? Math.round(r.score) : null
      if (score === null) continue

      let g = groups.get(topic)
      if (!g) {
        g = { byStudent: new Map(), misconceptions: new Map() }
        groups.set(topic, g)
      }
      const list = g.byStudent.get(r.studentId) ?? []
      list.push(score)
      g.byStudent.set(r.studentId, list)

      const items = (r.aiFeedback as { items?: Array<{ misconception?: string }> } | null)?.items
      if (Array.isArray(items)) {
        for (const it of items) {
          const label = it?.misconception?.trim()
          if (label) g.misconceptions.set(label, (g.misconceptions.get(label) ?? 0) + 1)
        }
      }
    }

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

    const topics: TopicWeakSpot[] = Array.from(groups.entries()).map(([topic, g]) => {
      const allScores: number[] = []
      let strugglingStudents = 0
      for (const scores of g.byStudent.values()) {
        allScores.push(...scores)
        if (mean(scores) < STRUGGLING_BELOW) strugglingStudents++
      }
      return {
        topic,
        averageScore: Math.round(mean(allScores)),
        attempts: allScores.length,
        students: g.byStudent.size,
        strugglingStudents,
        misconceptions: Array.from(g.misconceptions.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([label, count]) => ({ label, count })),
      }
    })

    // Weakest topics first — where the class needs the most attention.
    topics.sort((a, b) => a.averageScore - b.averageScore)

    return NextResponse.json({ topics: topics.slice(0, 20) })
  } catch (error) {
    return handleApiError(error, 'Failed to load class mastery', 'api/tutor/class-mastery/route.ts')
  }
}
