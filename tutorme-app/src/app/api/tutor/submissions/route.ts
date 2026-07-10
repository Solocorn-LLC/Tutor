/**
 * GET /api/tutor/submissions
 *
 * Flat list of submissions for tasks owned by the logged-in tutor, with the
 * student's answers and current grade — the data source for the grading view.
 * Optional ?status= filter (submitted | graded). Admins see all submissions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { getServerSession, authOptions } from '@/lib/auth'
import { handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, builderTaskDmi, profile, taskSubmission, user } from '@/lib/db/schema'

/** Per-question grading context shown to the tutor (tutor-only — carries the
 *  answer key / rubric). `needsReview` flags items the auto-grader set aside. */
interface QuestionMeta {
  questionText?: string
  rubric?: string
  modelAnswer?: string
  marks?: number
  needsReview?: boolean
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

    const statusParam = new URL(request.url).searchParams.get('status')
    const isAdmin = session.user.role === 'ADMIN'

    const filters = [
      ...(isAdmin ? [] : [eq(builderTask.tutorId, session.user.id)]),
      ...(statusParam === 'submitted' || statusParam === 'graded'
        ? [eq(taskSubmission.status, statusParam)]
        : []),
    ]

    const rows = await drizzleDb
      .select({
        submissionId: taskSubmission.submissionId,
        taskId: taskSubmission.taskId,
        taskTitle: builderTask.title,
        studentId: taskSubmission.studentId,
        studentName: profile.name,
        status: taskSubmission.status,
        score: taskSubmission.score,
        maxScore: taskSubmission.maxScore,
        answers: taskSubmission.answers,
        questionResults: taskSubmission.questionResults,
        tutorFeedback: taskSubmission.tutorFeedback,
        // The AI study hints the student received + any follow-up Q&A they had,
        // so the tutor can see the AI layer and catch drift.
        aiFeedback: taskSubmission.aiFeedback,
        followUps: taskSubmission.followUps,
        timeSpent: taskSubmission.timeSpent,
        submittedAt: taskSubmission.submittedAt,
        gradedAt: taskSubmission.gradedAt,
      })
      .from(taskSubmission)
      .innerJoin(builderTask, eq(taskSubmission.taskId, builderTask.taskId))
      .leftJoin(user, eq(taskSubmission.studentId, user.userId))
      .leftJoin(profile, eq(user.userId, profile.userId))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(taskSubmission.submittedAt))
      .limit(200)

    // Fetch the answer key (rubric / model answer / question text) for the tasks
    // in this batch so the tutor can grade flagged open-ended items with guidance.
    // Tutor-only endpoint, so exposing the key here is safe.
    const taskIds = Array.from(new Set(rows.map(r => r.taskId)))
    const keyByTask = new Map<string, Map<string, Record<string, unknown>>>()
    if (taskIds.length > 0) {
      const dmis = await drizzleDb
        .select({
          taskId: builderTaskDmi.taskId,
          items: builderTaskDmi.items,
          updatedAt: builderTaskDmi.updatedAt,
        })
        .from(builderTaskDmi)
        .where(inArray(builderTaskDmi.taskId, taskIds))
        .orderBy(desc(builderTaskDmi.updatedAt))
      for (const d of dmis) {
        if (keyByTask.has(d.taskId)) continue // keep the latest (first by desc)
        const byId = new Map<string, Record<string, unknown>>()
        if (Array.isArray(d.items)) {
          for (const raw of d.items as Array<Record<string, unknown>>) {
            const id = String(raw.id ?? raw.questionNumber ?? '')
            if (id) byId.set(id, raw)
          }
        }
        keyByTask.set(d.taskId, byId)
      }
    }

    const buildQuestionMeta = (
      taskId: string,
      questionResults: unknown
    ): Record<string, QuestionMeta> => {
      const byId = keyByTask.get(taskId)
      const flagged = new Set<string>()
      if (Array.isArray(questionResults)) {
        for (const qr of questionResults as Array<Record<string, unknown>>) {
          if (qr?.needsReview) flagged.add(String(qr.questionId))
        }
      }
      const meta: Record<string, QuestionMeta> = {}
      const ids = new Set<string>([...(byId?.keys() ?? []), ...flagged])
      for (const id of ids) {
        const item = byId?.get(id)
        meta[id] = {
          questionText: item?.questionText ? String(item.questionText) : undefined,
          rubric: item?.rubric ? String(item.rubric) : undefined,
          modelAnswer: item?.answer ? String(item.answer) : undefined,
          marks: typeof item?.marks === 'number' ? (item.marks as number) : undefined,
          needsReview: flagged.has(id) || undefined,
        }
      }
      return meta
    }

    return NextResponse.json({
      submissions: rows.map(r => ({
        ...r,
        studentName: r.studentName ?? 'Student',
        submittedAt: r.submittedAt?.toISOString() ?? null,
        gradedAt: r.gradedAt?.toISOString() ?? null,
        questionMeta: buildQuestionMeta(r.taskId, r.questionResults),
      })),
    })
  } catch (error) {
    return handleApiError(error, 'Failed to load submissions', 'api/tutor/submissions/route.ts')
  }
}
