/**
 * POST /api/tutor/test-grade
 *
 * Stateless grading preview for the course builder's "Test" tab. Runs the SAME
 * grading engine as production (ai-grade) against an in-builder marking basis
 * (PCI + structured spec + rubric + model answers) and a sample answer — so what
 * the tutor tests is exactly what students get. Persists nothing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { handleApiError, requireCsrf, withRateLimitPreset } from '@/lib/api/middleware'
import { gradeAnswerAgainstBasis, renderGradingSpec } from '@/lib/grading/pci-grader'

export async function POST(request: NextRequest) {
  try {
    const { response: rateLimitResponse } = await withRateLimitPreset(request, 'aiGenerate')
    if (rateLimitResponse) return rateLimitResponse

    const session = await getServerSession(authOptions, request)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user.role !== 'TUTOR' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const body = (await request.json().catch(() => ({}))) as {
      pci?: unknown
      pciSpec?: unknown
      rubric?: unknown
      modelAnswer?: unknown
      questionText?: unknown
      answer?: unknown
    }

    const answer = String(body.answer ?? '')
      .trim()
      .slice(0, 4000)
    if (!answer) {
      return NextResponse.json({ error: 'An answer is required to test grading' }, { status: 400 })
    }

    const result = await gradeAnswerAgainstBasis({
      pci: typeof body.pci === 'string' ? body.pci : undefined,
      specText: renderGradingSpec(body.pciSpec),
      rubric: typeof body.rubric === 'string' ? body.rubric : undefined,
      modelAnswer: typeof body.modelAnswer === 'string' ? body.modelAnswer : undefined,
      questionText: typeof body.questionText === 'string' ? body.questionText : undefined,
      studentAnswer: answer,
    })

    // Report the outcome faithfully — the client shows "add a marking basis" /
    // "unavailable" / "couldn't grade" rather than any fabricated score.
    return NextResponse.json({
      hasBasis: result.hasBasis,
      aiUnavailable: result.aiUnavailable,
      score: result.score,
      feedback: result.feedback,
      pciNote: result.pciNote || undefined,
      guardrailWarnings: result.guardrailViolations.map(v => ({
        ruleId: v.ruleId,
        severity: v.severity,
        message: v.message,
      })),
    })
  } catch (error) {
    return handleApiError(error, 'Failed to test grade', 'api/tutor/test-grade/route.ts')
  }
}
