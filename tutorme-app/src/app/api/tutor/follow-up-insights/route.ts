/**
 * GET /api/tutor/follow-up-insights
 *
 * Where students ask for help. Aggregates the persisted follow-up Q&A
 * (TaskSubmission.followUps) across the tutor's own tasks and groups it by
 * (task, question), so the tutor can see which questions generate the most
 * follow-ups — a signal of where the class is struggling. Read-only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getServerSession, authOptions } from '@/lib/auth'
import { handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, taskSubmission } from '@/lib/db/schema'

interface FollowUp {
  questionId?: string
  question?: string
}

interface HotspotItem {
  taskId: string
  taskTitle: string
  questionId: string
  count: number
  /** A few distinct sample questions students asked here. */
  samples: string[]
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
        taskId: taskSubmission.taskId,
        taskTitle: builderTask.title,
        followUps: taskSubmission.followUps,
      })
      .from(taskSubmission)
      .innerJoin(builderTask, eq(taskSubmission.taskId, builderTask.taskId))
      .where(isAdmin ? undefined : and(eq(builderTask.tutorId, session.user.id)))
      .limit(1000)

    // Group by (taskId, questionId).
    const groups = new Map<
      string,
      { taskId: string; taskTitle: string; questionId: string; count: number; samples: Set<string> }
    >()

    let totalFollowUps = 0
    for (const r of rows) {
      const list = Array.isArray(r.followUps) ? (r.followUps as FollowUp[]) : []
      for (const f of list) {
        const questionId = String(f?.questionId ?? '').trim()
        const question = String(f?.question ?? '').trim()
        if (!questionId || !question) continue
        totalFollowUps++
        const key = `${r.taskId}::${questionId}`
        let g = groups.get(key)
        if (!g) {
          g = {
            taskId: r.taskId,
            taskTitle: r.taskTitle ?? 'Untitled',
            questionId,
            count: 0,
            samples: new Set(),
          }
          groups.set(key, g)
        }
        g.count++
        if (g.samples.size < 3) g.samples.add(question.slice(0, 160))
      }
    }

    const items: HotspotItem[] = Array.from(groups.values())
      .map(g => ({
        taskId: g.taskId,
        taskTitle: g.taskTitle,
        questionId: g.questionId,
        count: g.count,
        samples: Array.from(g.samples),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)

    return NextResponse.json({ items, totalFollowUps })
  } catch (error) {
    return handleApiError(
      error,
      'Failed to load follow-up insights',
      'api/tutor/follow-up-insights/route.ts'
    )
  }
}
