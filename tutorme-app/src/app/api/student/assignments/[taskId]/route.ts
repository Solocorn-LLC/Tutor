/**
 * GET /api/student/assignments/[taskId]
 *
 * Returns a single assignable task for the logged-in student so they can start it:
 * task metadata, the question set (mapped from the task's DMI items), and whether
 * the student has already submitted (with their existing score).
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { getServerSession, authOptions } from '@/lib/auth'
import { getParamAsync } from '@/lib/api/params'
import { handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, builderTaskDmi, taskSubmission } from '@/lib/db/schema'

interface AssignmentQuestion {
  id: string
  type: 'multiple_choice' | 'short_answer'
  question: string
  options?: string[]
  correctAnswer?: string
  points: number
}

/** Map a task's stored DMI items / metadata questions into the quiz question shape. */
function mapQuestions(dmiItems: unknown, metadata: unknown): AssignmentQuestion[] {
  const fromItems = Array.isArray(dmiItems) ? dmiItems : []
  if (fromItems.length > 0) {
    return fromItems.map((raw, i) => {
      const item = (raw ?? {}) as Record<string, unknown>
      const options = Array.isArray(item.options) ? (item.options as string[]) : undefined
      return {
        id: String(item.id ?? item.questionNumber ?? i + 1),
        type: options && options.length > 0 ? 'multiple_choice' : 'short_answer',
        question: String(item.questionText ?? item.question ?? ''),
        options,
        correctAnswer:
          item.answer != null
            ? String(item.answer)
            : item.correctAnswer != null
              ? String(item.correctAnswer)
              : undefined,
        points:
          typeof item.marks === 'number' && item.marks > 0
            ? item.marks
            : typeof item.points === 'number'
              ? item.points
              : 10,
      }
    })
  }

  // Fallback: questions embedded in builderTask.metadata
  const meta = (metadata ?? {}) as Record<string, unknown>
  const metaQuestions = Array.isArray(meta.questions) ? meta.questions : []
  return metaQuestions.map((raw, i) => {
    const item = (raw ?? {}) as Record<string, unknown>
    const options = Array.isArray(item.options) ? (item.options as string[]) : undefined
    return {
      id: String(item.id ?? i + 1),
      type: options && options.length > 0 ? 'multiple_choice' : 'short_answer',
      question: String(item.question ?? item.questionText ?? ''),
      options,
      correctAnswer: item.correctAnswer != null ? String(item.correctAnswer) : undefined,
      points: typeof item.points === 'number' ? item.points : 10,
    }
  })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> }
) {
  try {
    const session = await getServerSession(authOptions, request)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const studentId = session.user.id

    const taskId = await getParamAsync(context.params, 'taskId')
    if (!taskId || !/^[a-zA-Z0-9\-_]+$/.test(taskId) || taskId.length > 100) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
    }

    const [task] = await drizzleDb
      .select({
        taskId: builderTask.taskId,
        title: builderTask.title,
        type: builderTask.type,
        status: builderTask.status,
        metadata: builderTask.metadata,
      })
      .from(builderTask)
      .where(and(eq(builderTask.taskId, taskId), isNull(builderTask.deletedAt)))
      .limit(1)

    if (!task || task.status !== 'published') {
      return NextResponse.json({ error: 'Task not available' }, { status: 404 })
    }

    // Existing submission (if any) for this student
    const [existing] = await drizzleDb
      .select({
        score: taskSubmission.score,
        status: taskSubmission.status,
        tutorApproved: taskSubmission.tutorApproved,
        tutorFeedback: taskSubmission.tutorFeedback,
        answers: taskSubmission.answers,
        questionResults: taskSubmission.questionResults,
        maxScore: taskSubmission.maxScore,
        submittedAt: taskSubmission.submittedAt,
        gradedAt: taskSubmission.gradedAt,
        aiFeedback: taskSubmission.aiFeedback,
      })
      .from(taskSubmission)
      .where(and(eq(taskSubmission.taskId, taskId), eq(taskSubmission.studentId, studentId)))
      .limit(1)

    // Latest DMI question set for this task
    const [dmi] = await drizzleDb
      .select({ items: builderTaskDmi.items })
      .from(builderTaskDmi)
      .where(eq(builderTaskDmi.taskId, taskId))
      .orderBy(desc(builderTaskDmi.updatedAt))
      .limit(1)

    const questions = mapQuestions(dmi?.items, task.metadata)

    // Honor the tutor's answer-reveal policy. Only 'instant' may expose correct
    // answers to the browser before submitting; otherwise strip them so students
    // can't peek (the score is computed server-side on submit).
    const rawReveal = (task.metadata as { answerReveal?: string } | null)?.answerReveal
    const answerReveal =
      rawReveal === 'after_submit'
        ? 'after_submit'
        : rawReveal === 'hidden'
          ? 'hidden'
          : rawReveal === 'student_choice'
            ? 'student_choice'
            : 'instant'
    // correctAnswer is exposed for 'instant' and 'student_choice' (the student
    // may opt into practice mode); stripped for after_submit/hidden so it can't
    // be peeked before submitting. BUT once the student has submitted, reveal the
    // key for every mode except 'hidden' so they can review what they got wrong.
    const alreadySubmitted = existing != null
    const exposeAnswers =
      answerReveal === 'instant' ||
      answerReveal === 'student_choice' ||
      (alreadySubmitted && answerReveal !== 'hidden')
    const safeQuestions = exposeAnswers
      ? questions
      : questions.map(({ correctAnswer: _c, ...q }) => q)

    return NextResponse.json({
      alreadySubmitted,
      existingScore: existing?.score ?? null,
      // Whether the tutor has finalized the grade (vs the automatic provisional
      // score). Lets the student see "graded by your tutor" + any feedback.
      existingGraded: existing?.status === 'graded' || existing?.tutorApproved === true,
      existingFeedback: existing?.tutorFeedback ?? null,
      // Full graded review so a student can re-open a completed assessment and see
      // their per-question breakdown + the tutor's feedback (not just a score).
      existingAnswers: existing?.answers ?? null,
      existingQuestionResults: existing?.questionResults ?? null,
      existingMaxScore: existing?.maxScore ?? null,
      existingSubmittedAt: existing?.submittedAt ?? null,
      existingGradedAt: existing?.gradedAt ?? null,
      // Grounded per-question AI study hints, if already generated (see the
      // ai-feedback endpoint — generated on demand and cached here).
      existingAiFeedback: existing?.aiFeedback ?? null,
      task: {
        id: task.taskId,
        title: task.title,
        type: task.type,
        answerReveal,
        questions: safeQuestions,
      },
    })
  } catch (error) {
    return handleApiError(error, 'Failed to load task', 'api/student/assignments/[taskId]/route.ts')
  }
}
