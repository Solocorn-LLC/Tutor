/**
 * POST /api/tutor/submissions/[submissionId]/grade
 *
 * Lets the owning tutor (or an admin) record a manual grade for a student's
 * TaskSubmission: score, optional feedback, and approval. Verifies the tutor owns
 * the task behind the submission to prevent cross-tutor grading (IDOR).
 */

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getServerSession, authOptions } from '@/lib/auth'
import { getParamAsync } from '@/lib/api/params'
import { handleApiError, requireCsrf } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, taskSubmission } from '@/lib/db/schema'

export async function POST(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> }
) {
  try {
    const session = await getServerSession(authOptions, request)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user.role !== 'TUTOR' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const submissionId = await getParamAsync(context.params, 'submissionId')
    if (!submissionId || !/^[a-zA-Z0-9\-_]+$/.test(submissionId) || submissionId.length > 100) {
      return NextResponse.json({ error: 'Invalid submission ID' }, { status: 400 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      score?: number
      maxScore?: number
      feedback?: string
      approved?: boolean
    }

    if (typeof body.score !== 'number' || Number.isNaN(body.score) || body.score < 0) {
      return NextResponse.json({ error: 'A numeric score is required' }, { status: 400 })
    }

    // Submission must exist and be owned (via its task) by this tutor (admins bypass)
    const [row] = await drizzleDb
      .select({
        submissionId: taskSubmission.submissionId,
        maxScore: taskSubmission.maxScore,
        tutorId: builderTask.tutorId,
      })
      .from(taskSubmission)
      .innerJoin(builderTask, eq(taskSubmission.taskId, builderTask.taskId))
      .where(eq(taskSubmission.submissionId, submissionId))
      .limit(1)

    if (!row) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }
    if (session.user.role !== 'ADMIN' && row.tutorId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const maxScore =
      typeof body.maxScore === 'number' && body.maxScore > 0 ? body.maxScore : row.maxScore
    const score = Math.max(0, Math.min(maxScore, body.score))

    await drizzleDb
      .update(taskSubmission)
      .set({
        score,
        maxScore,
        tutorFeedback: body.feedback ?? null,
        tutorApproved: body.approved ?? true,
        status: 'graded',
        gradedAt: new Date(),
      })
      .where(eq(taskSubmission.submissionId, submissionId))

    return NextResponse.json({
      submission: { submissionId, score, maxScore, status: 'graded' },
    })
  } catch (error) {
    return handleApiError(
      error,
      'Failed to grade submission',
      'api/tutor/submissions/[submissionId]/grade/route.ts'
    )
  }
}
