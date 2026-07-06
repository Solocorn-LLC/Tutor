/**
 * POST /api/student/assignments/[taskId]/ai-feedback
 *
 * Generate (once) grounded per-question AI study hints for the calling student's
 * submission and persist them to TaskSubmission.aiFeedback. Idempotent: if hints
 * were already generated they are returned as-is (no second model call), so cost
 * is bounded to one generation per submission.
 *
 * Hints are formative study help grounded in the tutor's marking basis (model
 * answer + rubric + PCI) — they never carry a score, and the tutor's own written
 * feedback stays authoritative.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { getServerSession, authOptions } from '@/lib/auth'
import { getParamAsync } from '@/lib/api/params'
import { handleApiError, requireCsrf } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, builderTaskDmi, taskSubmission } from '@/lib/db/schema'
import { normalizePciSpec, pciSpecToText, type PciSpec } from '@/lib/assessment/pci-spec'
import {
  generatePerQuestionFeedback,
  type AiFeedbackPayload,
} from '@/lib/feedback/per-question-feedback'

// PciSpec fields that bear on GRADING/marking (mirrors the tutor AI grader). The
// behavioural fields (tone, retry policy, etc.) don't inform written feedback.
const GRADING_SPEC_KEYS: (keyof PciSpec)[] = [
  'evaluationLogic',
  'correctResponseBehavior',
  'incorrectResponseBehavior',
  'partialUnderstandingBehavior',
]

interface QuestionResult {
  questionId: string
  correct?: boolean
  needsReview?: boolean
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> }
) {
  try {
    const session = await getServerSession(authOptions, request)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const studentId = session.user.id

    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const taskId = await getParamAsync(context.params, 'taskId')
    if (!taskId || !/^[a-zA-Z0-9\-_]+$/.test(taskId) || taskId.length > 100) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
    }

    // The student's own submission for this task.
    const [submission] = await drizzleDb
      .select({
        submissionId: taskSubmission.submissionId,
        answers: taskSubmission.answers,
        questionResults: taskSubmission.questionResults,
        aiFeedback: taskSubmission.aiFeedback,
      })
      .from(taskSubmission)
      .where(and(eq(taskSubmission.taskId, taskId), eq(taskSubmission.studentId, studentId)))
      .limit(1)

    if (!submission) {
      return NextResponse.json({ error: 'No submission to explain yet' }, { status: 404 })
    }

    // Idempotent: return the already-generated hints without a second model call.
    if (submission.aiFeedback) {
      return NextResponse.json({ aiFeedback: submission.aiFeedback as AiFeedbackPayload })
    }

    // Questions the auto-grader marked wrong (and could grade — not needsReview,
    // which the tutor still owns). Only these get study hints.
    const results = Array.isArray(submission.questionResults)
      ? (submission.questionResults as QuestionResult[])
      : []
    const wrongIds = new Set(
      results
        .filter(r => r && r.correct === false && r.needsReview !== true)
        .map(r => String(r.questionId))
    )
    if (wrongIds.size === 0) {
      return NextResponse.json({ aiFeedback: null })
    }

    // Task marking policy (PCI + structured spec).
    const [task] = await drizzleDb
      .select({ pci: builderTask.pci, pciSpec: builderTask.pciSpec })
      .from(builderTask)
      .where(eq(builderTask.taskId, taskId))
      .limit(1)

    // Latest answer key (rubric / model answer / question text) for this task.
    const [dmi] = await drizzleDb
      .select({ items: builderTaskDmi.items })
      .from(builderTaskDmi)
      .where(eq(builderTaskDmi.taskId, taskId))
      .orderBy(desc(builderTaskDmi.updatedAt))
      .limit(1)

    const items = Array.isArray(dmi?.items) ? (dmi.items as Array<Record<string, unknown>>) : []
    const answers = (submission.answers ?? {}) as Record<string, unknown>

    const questions = items
      .map(item => {
        const questionId = String(item.id ?? item.questionNumber ?? '')
        return {
          questionId,
          questionText: String(item.questionText ?? item.question ?? ''),
          rubric: typeof item.rubric === 'string' ? item.rubric : null,
          modelAnswer:
            item.answer != null
              ? String(item.answer)
              : item.correctAnswer != null
                ? String(item.correctAnswer)
                : null,
          studentAnswer: String(answers[questionId] ?? '').trim(),
        }
      })
      .filter(q => wrongIds.has(q.questionId))

    if (questions.length === 0) {
      return NextResponse.json({ aiFeedback: null })
    }

    // Structured PCI spec → grading-relevant lines only (mirrors the AI grader).
    const gradingSpec: PciSpec = {}
    const normalizedSpec = normalizePciSpec(task?.pciSpec)
    if (normalizedSpec) {
      for (const k of GRADING_SPEC_KEYS) {
        const v = normalizedSpec[k]
        if (typeof v === 'string' && v.trim()) gradingSpec[k] = v
      }
    }
    const specText = pciSpecToText(gradingSpec).slice(0, 2000)

    const payload = await generatePerQuestionFeedback({
      pci: task?.pci ?? '',
      specText,
      questions,
    })

    if (!payload) {
      // No usable basis or nothing generated — persist nothing, report gracefully.
      return NextResponse.json({ aiFeedback: null })
    }

    await drizzleDb
      .update(taskSubmission)
      .set({ aiFeedback: payload })
      .where(eq(taskSubmission.submissionId, submission.submissionId))

    return NextResponse.json({ aiFeedback: payload })
  } catch (error) {
    return handleApiError(
      error,
      'Failed to generate AI feedback',
      'api/student/assignments/[taskId]/ai-feedback/route.ts'
    )
  }
}
