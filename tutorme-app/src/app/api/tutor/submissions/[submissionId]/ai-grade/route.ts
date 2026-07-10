/**
 * POST /api/tutor/submissions/[submissionId]/ai-grade
 *
 * Tutor-triggered AI assist for grading a single open-ended answer. Scores the
 * student's answer against the question's marking rubric + model answer using
 * Kimi and returns a SUGGESTION (score 0-100 + short feedback). It does NOT
 * persist anything — the tutor reviews it and saves via the normal grade route.
 *
 * Verifies the tutor owns the task behind the submission (no cross-tutor IDOR).
 */

import { NextRequest, NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { getServerSession, authOptions } from '@/lib/auth'
import { getParamAsync } from '@/lib/api/params'
import { handleApiError, requireCsrf } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, builderTaskDmi, taskSubmission } from '@/lib/db/schema'
import { gradeAnswerAgainstBasis, renderGradingSpec } from '@/lib/grading/pci-grader'

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

    const body = (await request.json().catch(() => ({}))) as { questionId?: string }
    const questionId = String(body.questionId ?? '').trim()
    if (!questionId) {
      return NextResponse.json({ error: 'questionId is required' }, { status: 400 })
    }

    // Submission must exist and be owned (via its task) by this tutor.
    const [row] = await drizzleDb
      .select({
        taskId: taskSubmission.taskId,
        answers: taskSubmission.answers,
        tutorId: builderTask.tutorId,
        // The tutor's PCI instructions for how this task should be marked.
        pci: builderTask.pci,
        // The finalized structured PCI spec (TASK-6), persisted at deploy. The
        // machine-readable mirror of the marking policy; null for most tasks.
        pciSpec: builderTask.pciSpec,
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

    // Load the answer key (rubric / model answer / question text) for this task.
    const [dmi] = await drizzleDb
      .select({ items: builderTaskDmi.items })
      .from(builderTaskDmi)
      .where(eq(builderTaskDmi.taskId, row.taskId))
      .orderBy(desc(builderTaskDmi.updatedAt))
      .limit(1)

    const items = Array.isArray(dmi?.items) ? (dmi.items as Array<Record<string, unknown>>) : []
    const item = items.find(it => String(it.id ?? it.questionNumber ?? '') === questionId)
    if (!item) {
      return NextResponse.json({ error: 'No answer key for this question' }, { status: 404 })
    }

    const answers = (row.answers ?? {}) as Record<string, unknown>
    const studentAnswer = String(answers[questionId] ?? '').trim()
    if (!studentAnswer) {
      return NextResponse.json({ error: 'No student answer to grade' }, { status: 400 })
    }

    const questionText = String(item.questionText ?? '')

    // Grade via the shared engine (same one the builder's Test preview uses).
    const result = await gradeAnswerAgainstBasis({
      pci: row.pci,
      specText: renderGradingSpec(row.pciSpec),
      rubric: item.rubric as string | null | undefined,
      modelAnswer: item.answer as string | null | undefined,
      questionText,
      // ASMT-4: expected answer format + any referenced source materials.
      responseType: typeof item.responseType === 'string' ? item.responseType : undefined,
      sourceDependencies: Array.isArray(item.sourceDependencies)
        ? (item.sourceDependencies as unknown[]).map(s => String(s))
        : undefined,
      studentAnswer,
    })

    // Safe failure (TASK-10 / TASK-19): no evaluation basis — refuse to guess.
    if (!result.hasBasis) {
      return NextResponse.json(
        {
          error:
            'No marking basis for this question — define the task PCI, a rubric, or a model answer before AI grading.',
          needsManualGrading: true,
        },
        { status: 422 }
      )
    }
    if (result.aiUnavailable) {
      return NextResponse.json(
        { error: 'AI grading is unavailable right now. Please grade manually.' },
        { status: 503 }
      )
    }
    if (result.score === null) {
      return NextResponse.json(
        { error: 'Could not parse an AI grade. Please grade manually.' },
        { status: 502 }
      )
    }

    if (result.guardrailViolations.length > 0) {
      console.warn(
        '[ai-grade] task guardrail warnings:',
        result.guardrailViolations.map(v => `${v.ruleId} ${v.severity}`).join(', ')
      )
    }

    const marks = typeof item.marks === 'number' && item.marks > 0 ? item.marks : undefined
    return NextResponse.json({
      questionId,
      // A suggestion only — the tutor decides the final grade.
      suggestedPercent: result.score,
      suggestedMarks: marks != null ? Math.round((result.score / 100) * marks) : undefined,
      marks,
      feedback: result.feedback,
      // Tutor-only override note (empty unless the PCI changed the outcome).
      pciNote: result.pciNote || undefined,
    })
  } catch (error) {
    return handleApiError(
      error,
      'Failed to AI-grade answer',
      'api/tutor/submissions/[submissionId]/ai-grade/route.ts'
    )
  }
}
