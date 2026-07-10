/**
 * POST /api/student/assignments/[taskId]/submit
 *
 * Persists a student's answers to an assignable task as a TaskSubmission, then
 * kicks off (best-effort) AI feedback for the tutor's review queue. Enforces:
 *  - authenticated student
 *  - CSRF (double-submit token)
 *  - task is published
 *  - student is enrolled in the task's course
 *  - one submission per (task, student) — duplicate returns 409
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { getServerSession, authOptions } from '@/lib/auth'
import { getParamAsync } from '@/lib/api/params'
import { handleApiError, requireCsrf } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, builderTaskDmi, courseEnrollment, taskSubmission } from '@/lib/db/schema'
import { autoGradeDmi, type DmiAnswerItem } from '@/lib/grading/auto-grade'

const MAX_SCORE = 100

// (Client-supplied scores are no longer accepted; scoring is server-side.)

/**
 * Build the server-side answer key for a task. Prefers the DMI answer key
 * (BuilderTaskDmi.items — the same source the live grader and GET route use),
 * falling back to questions embedded in the task metadata. The id derivation
 * MUST mirror the GET route's mapQuestions so submitted answers line up.
 */
function buildAnswerKey(dmiItems: unknown, metadata: unknown): DmiAnswerItem[] {
  const fromItems = Array.isArray(dmiItems) ? dmiItems : []
  if (fromItems.length > 0) {
    return fromItems.map((raw, i) => {
      const item = (raw ?? {}) as Record<string, unknown>
      return {
        id: String(item.id ?? item.questionNumber ?? i + 1),
        answer: item.answer != null ? String(item.answer) : undefined,
        acceptableVariants: Array.isArray(item.acceptableVariants)
          ? item.acceptableVariants.map(v => String(v)).filter(Boolean)
          : undefined,
        marks: typeof item.marks === 'number' && item.marks > 0 ? item.marks : undefined,
      }
    })
  }
  const meta = (metadata ?? {}) as Record<string, unknown>
  const metaQuestions = Array.isArray(meta.questions) ? meta.questions : []
  return metaQuestions.map((raw, i) => {
    const item = (raw ?? {}) as Record<string, unknown>
    const answer = item.correctAnswer ?? item.answer
    return {
      id: String(item.id ?? item.questionNumber ?? i + 1),
      answer: answer != null ? String(answer) : undefined,
      marks: typeof item.points === 'number' && item.points > 0 ? item.points : undefined,
    }
  })
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

    // NOTE: client-supplied `score`/`questionResults` are intentionally ignored —
    // the score is computed server-side against the answer key below so a student
    // cannot POST an arbitrary grade.
    const body = (await request.json().catch(() => ({}))) as {
      answers?: Record<string, unknown>
      timeSpent?: number
    }
    const answers = body.answers ?? {}
    const timeSpent = typeof body.timeSpent === 'number' && body.timeSpent >= 0 ? body.timeSpent : 0

    // Task must exist, be published, and not deleted
    const [task] = await drizzleDb
      .select({
        courseId: builderTask.courseId,
        status: builderTask.status,
        metadata: builderTask.metadata,
      })
      .from(builderTask)
      .where(eq(builderTask.taskId, taskId))
      .limit(1)

    if (!task || task.status !== 'published') {
      return NextResponse.json({ error: 'Task not available' }, { status: 404 })
    }

    // Student must be enrolled in the task's course
    const [enrollment] = await drizzleDb
      .select({ enrollmentId: courseEnrollment.enrollmentId })
      .from(courseEnrollment)
      .where(
        and(eq(courseEnrollment.studentId, studentId), eq(courseEnrollment.courseId, task.courseId))
      )
      .limit(1)

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 })
    }

    // One submission per (task, student)
    const [existing] = await drizzleDb
      .select({ submissionId: taskSubmission.submissionId })
      .from(taskSubmission)
      .where(and(eq(taskSubmission.taskId, taskId), eq(taskSubmission.studentId, studentId)))
      .limit(1)

    if (existing) {
      return NextResponse.json({ error: 'Already submitted' }, { status: 409 })
    }

    const submissionId = randomUUID()

    // Grade server-side against the task's answer key (DMI items, else metadata
    // questions). When there's no key the score is null — pending tutor review —
    // never a value the client supplied.
    const [dmi] = await drizzleDb
      .select({ items: builderTaskDmi.items })
      .from(builderTaskDmi)
      .where(eq(builderTaskDmi.taskId, taskId))
      .orderBy(desc(builderTaskDmi.updatedAt))
      .limit(1)
    const answerKey = buildAnswerKey(dmi?.items, task.metadata)
    const graded = autoGradeDmi(answerKey, answers as Record<string, string>)
    const score = graded.score
    const questionResults = graded.questionResults

    await drizzleDb.insert(taskSubmission).values({
      submissionId,
      taskId,
      studentId,
      answers,
      timeSpent,
      attempts: 1,
      questionResults,
      score,
      maxScore: MAX_SCORE,
      status: 'submitted',
      tutorApproved: false,
      // Explicit: prod's submittedAt column has drifted and lacks its DEFAULT,
      // so relying on defaultNow() would insert NULL and violate not-null.
      submittedAt: new Date(),
    })

    // (Removed) The old best-effort call to generateFeedback/submitFeedbackForReview
    // wrote to the orphaned FeedbackWorkflow table — a review panel mounted nowhere
    // and read by no student route — while adding a synchronous Kimi call to every
    // submit. The feedback students actually see is the auto-graded per-question
    // breakdown plus the tutor's own feedback (delivered via the task GET). If a
    // real AI-feedback queue is wired later, it should consume the marking basis
    // (answers + rubric + model answer + PCI), not the generic recent-score prompt.

    // Reveal correct answers in the response when the tutor chose 'after_submit'
    // or 'student_choice' — now that the student has submitted it's safe to show
    // them on the results screen. 'hidden'/'instant' get no post-submit key
    // ('instant' already had them client-side; 'hidden' never reveals).
    const rawReveal = (task.metadata as { answerReveal?: string } | null)?.answerReveal
    const correctAnswers =
      rawReveal === 'after_submit' || rawReveal === 'student_choice'
        ? answerKey.reduce<Record<string, string>>((acc, k) => {
            if (k.answer != null && k.answer !== '') acc[k.id] = k.answer
            return acc
          }, {})
        : undefined

    return NextResponse.json({
      submission: { submissionId, score: score ?? 0, status: 'submitted' },
      questionResults,
      correctAnswers,
    })
  } catch (error) {
    return handleApiError(
      error,
      'Failed to submit task',
      'api/student/assignments/[taskId]/submit/route.ts'
    )
  }
}
