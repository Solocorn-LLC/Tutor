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
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { getServerSession, authOptions } from '@/lib/auth'
import { getParamAsync } from '@/lib/api/params'
import { handleApiError, requireCsrf } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, courseEnrollment, taskSubmission } from '@/lib/db/schema'
import { generateFeedback, submitFeedbackForReview } from '@/lib/feedback/workflow'

const MAX_SCORE = 100

function clampScore(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  return Math.max(0, Math.min(MAX_SCORE, value))
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

    const body = (await request.json().catch(() => ({}))) as {
      answers?: Record<string, unknown>
      timeSpent?: number
      score?: number
      questionResults?: unknown
    }
    const answers = body.answers ?? {}
    const timeSpent = typeof body.timeSpent === 'number' && body.timeSpent >= 0 ? body.timeSpent : 0
    const score = clampScore(body.score)

    // Task must exist, be published, and not deleted
    const [task] = await drizzleDb
      .select({ courseId: builderTask.courseId, status: builderTask.status })
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
    const questionResults =
      body.questionResults != null && typeof body.questionResults === 'object'
        ? body.questionResults
        : null

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

    // Best-effort: generate AI feedback into the tutor's review queue. Submission
    // already persisted, so any failure here must not fail the request.
    try {
      const request_ = {
        studentId,
        submissionId,
        type: 'task_feedback' as const,
        context: { taskId, recentPerformance: score ?? undefined },
        priority: 'medium' as const,
      }
      const generated = await generateFeedback(request_)
      if (generated.success && generated.feedback) {
        await submitFeedbackForReview(generated.feedback, request_)
      }
    } catch (feedbackError) {
      console.warn('[submit] AI feedback generation failed (non-critical):', feedbackError)
    }

    return NextResponse.json({
      submission: { submissionId, score: score ?? 0, status: 'submitted' },
    })
  } catch (error) {
    return handleApiError(
      error,
      'Failed to submit task',
      'api/student/assignments/[taskId]/submit/route.ts'
    )
  }
}
