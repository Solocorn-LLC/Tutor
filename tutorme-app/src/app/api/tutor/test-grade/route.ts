/**
 * POST /api/tutor/test-grade
 *
 * Stateless grading preview for the course builder's "Test" tab. Runs the SAME
 * grading engine as production against an in-builder marking basis (PCI +
 * structured spec + rubric + model answers). Persists nothing. Modes:
 *   • single { answer }          — assessment per-question test (one grade).
 *   • { answers: string[] }      — TASK chat "complete": respond to each answer.
 *   • { question, history }      — TASK chat follow-up, grounded in the PCI.
 * so the Test tab mirrors exactly what the student flow (task-chat) produces.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { handleApiError, requireCsrf, withRateLimitPreset } from '@/lib/api/middleware'
import { ASK_SYSTEM_PROMPT } from '@/lib/ai/task-chat-prompts'
import { generateWithKimi } from '@/lib/ai/kimi'
import { runTaskGuardrails } from '@/lib/ai/guardrails'
import { gradeAnswerAgainstBasis, renderGradingSpec } from '@/lib/grading/pci-grader'
import { AISecurityManager } from '@/lib/security/ai-sanitization'

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
      responseType?: unknown
      sourceDependencies?: unknown
      answer?: unknown
      answers?: unknown
      question?: unknown
      history?: Array<{ role: 'user' | 'assistant'; content: string }>
    }

    const pci = typeof body.pci === 'string' ? body.pci : undefined
    const specText = renderGradingSpec(body.pciSpec)
    const questionText = typeof body.questionText === 'string' ? body.questionText : undefined

    // ─── TASK chat "complete": respond to each chatted answer per the PCI ───────
    if (Array.isArray(body.answers) && body.answers.length > 0) {
      const answers = body.answers
        .map(a =>
          String(a ?? '')
            .trim()
            .slice(0, 3000)
        )
        .filter(Boolean)
        .slice(0, 12)
      if (answers.length === 0) {
        return NextResponse.json({ error: 'No answers to respond to' }, { status: 400 })
      }
      const responses: { answer: string; response: string; score: number | null }[] = []
      for (const a of answers) {
        const r = await gradeAnswerAgainstBasis({ pci, specText, questionText, studentAnswer: a })
        const response = !r.hasBasis
          ? "This answer's recorded — there's no marking policy set for this task yet, so it can't be checked here."
          : r.aiUnavailable
            ? 'The assistant is unavailable right now — try again in a moment.'
            : r.feedback || 'Noted.'
        responses.push({ answer: a, response, score: r.score })
      }
      return NextResponse.json({ mode: 'complete', responses })
    }

    // ─── TASK chat follow-up, grounded in the PCI ───────────────────────────────
    if (typeof body.question === 'string' && body.question.trim()) {
      const question = AISecurityManager.sanitizeAiInput(body.question.trim()).slice(0, 800)
      if (!question) {
        return NextResponse.json({ error: 'A non-empty question is required' }, { status: 400 })
      }
      if (!pci?.trim() && !specText) {
        return NextResponse.json({
          mode: 'ask',
          answer:
            "There's no marking policy set for this task, so I can't explain it — add a PCI, then test again.",
        })
      }
      const priorAnswers = Array.isArray(body.answers)
        ? body.answers
            .map(a => AISecurityManager.sanitizeAiInput(String(a)).slice(0, 800))
            .filter(Boolean)
        : []
      const history = Array.isArray(body.history) ? body.history.slice(-6) : []
      const historyBlock = history.length
        ? `Conversation so far:\n${history
            .map(
              t =>
                `${t.role === 'assistant' ? 'Tutor' : 'Student'}: ${AISecurityManager.sanitizeAiInput(String(t.content)).slice(0, 800)}`
            )
            .join('\n')}\n\n`
        : ''
      const answersBlock = priorAnswers.length
        ? `The student's answers to this task:\n${priorAnswers.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n`
        : ''
      const specBlock = specText ? `Structured marking guidance (PCI):\n${specText}\n\n` : ''
      const prompt = `Tutor's marking policy (PCI):\n${(pci ?? '').slice(0, 2000)}\n\n${specBlock}Task:\n${(questionText ?? '(not provided)').slice(0, 4000)}\n\n${answersBlock}${historyBlock}The student's follow-up:\n${question}`
      let answer: string
      try {
        answer = await generateWithKimi(prompt, {
          systemPrompt: ASK_SYSTEM_PROMPT,
          temperature: 0.4,
          maxTokens: 400,
          timeoutMs: 30000,
        })
      } catch (aiErr) {
        console.warn('[test-grade] Kimi call failed:', aiErr)
        return NextResponse.json(
          { error: 'The assistant is unavailable right now. Please try again.' },
          { status: 503 }
        )
      }
      answer = answer.trim().slice(0, 1500)
      if (!answer) {
        return NextResponse.json({ error: 'Could not generate an answer.' }, { status: 502 })
      }

      const validation = await AISecurityManager.validateAiResponse(answer)
      if (
        !validation.isValid &&
        (validation.severity === 'HIGH' || validation.severity === 'CRITICAL')
      ) {
        console.warn(
          '[test-grade] response failed validation:',
          validation.issues,
          validation.severity
        )
        return NextResponse.json(
          { error: 'The generated response failed safety checks.' },
          { status: 502 }
        )
      }

      const guardrail = runTaskGuardrails(answer, {
        sourceContent: [pci, specText].filter(Boolean).join('\n'),
      })
      if (guardrail.violations.length > 0) {
        console.warn(
          '[test-grade] guardrail warnings:',
          guardrail.violations.map(v => `${v.ruleId} ${v.severity}`).join(', ')
        )
      }
      return NextResponse.json({ mode: 'ask', answer })
    }

    // ─── Single-answer grade (assessment per-question test) ─────────────────────
    const answer = String(body.answer ?? '')
      .trim()
      .slice(0, 4000)
    if (!answer) {
      return NextResponse.json({ error: 'An answer is required to test grading' }, { status: 400 })
    }

    const result = await gradeAnswerAgainstBasis({
      pci,
      specText,
      rubric: typeof body.rubric === 'string' ? body.rubric : undefined,
      modelAnswer: typeof body.modelAnswer === 'string' ? body.modelAnswer : undefined,
      questionText,
      responseType: typeof body.responseType === 'string' ? body.responseType : undefined,
      sourceDependencies: Array.isArray(body.sourceDependencies)
        ? body.sourceDependencies.map(s => String(s))
        : undefined,
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
