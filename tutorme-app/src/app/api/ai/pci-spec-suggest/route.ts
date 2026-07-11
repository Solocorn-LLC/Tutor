/**
 * PCI Spec Suggest API
 * POST /api/ai/pci-spec-suggest
 *
 * Prefills the structured PCI questionnaire (a PciSpec) from the task/assessment
 * context, so a tutor reviews/edits fields instead of authoring from scratch.
 * Returns ONLY fields the model can reasonably infer — undefined fields are left
 * out (never fabricated), matching the PciSpec normalization rules.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, getSessionForRealm, authOptions } from '@/lib/auth'
import { withRateLimitPreset } from '@/lib/api/middleware'
import { AISecurityManager } from '@/lib/security/ai-sanitization'
import { generateWithFallback } from '@/lib/agents'
import { parseLlmJson } from '@/lib/ai/llm-response'
import { normalizePciSpec, PCI_SPEC_FIELDS, type PciSpec } from '@/lib/assessment/pci-spec'
import { guardrailSystemPrompt, GUARDRAILED_TEMPERATURE } from '@/lib/ai/guardrails'
import { z } from 'zod'

const RequestSchema = z.object({
  type: z.enum(['task', 'assessment']),
  title: z.string().max(200).optional(),
  content: z.string().max(50000).optional(),
  pci: z.string().max(50000).optional(),
  // The official marking scheme (DMI), distilled per question. The AI reads the
  // rubrics/marks to infer cross-cutting POLICY — it must not copy per-question
  // answers/rubric text (those live in the marking scheme, not the PCI).
  markingScheme: z
    .array(
      z.object({
        label: z.string().max(40).optional(),
        marks: z.number().optional(),
        rubric: z.string().max(2000).optional(),
        responseType: z.string().max(60).optional(),
        hasVariants: z.boolean().optional(),
      })
    )
    .max(120)
    .optional(),
})

function truncate(value: string | undefined, max: number): string {
  if (!value) return ''
  return value.length <= max ? value : `${value.slice(0, max)}\n...[TRUNCATED]`
}

const SPEC_KEYS = PCI_SPEC_FIELDS.map(f => f.key).join(', ')

export async function POST(request: NextRequest) {
  try {
    const session =
      (await getSessionForRealm(request, 'tutor')) ?? (await getServerSession(authOptions, request))
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Tutor-only course-builder tooling.
    if (session.user.role !== 'TUTOR' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { response: rateLimitResponse } = await withRateLimitPreset(
      request,
      'aiGenerate',
      `user:${session.user.id}`
    )
    if (rateLimitResponse) return rateLimitResponse

    const parsed = RequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const { type, title, content, pci, markingScheme } = parsed.data

    // Distil the marking scheme into a compact, policy-bearing digest: the
    // per-question rubrics + marks + response types are where official marking
    // conventions live (method marks, partial credit, accepted equivalents).
    const schemeRows = (markingScheme ?? [])
      .map(q => {
        const parts = [
          q.label && `Q${q.label}`,
          typeof q.marks === 'number' && `${q.marks} mark(s)`,
          q.responseType && `type: ${q.responseType}`,
          q.hasVariants && 'accepts equivalent variants',
          q.rubric && `rubric: ${truncate(q.rubric, 600)}`,
        ].filter(Boolean)
        return parts.length > 0 ? `- ${parts.join(' | ')}` : ''
      })
      .filter(Boolean)
    const schemeBlock = schemeRows.length > 0 ? schemeRows.slice(0, 120).join('\n') : ''

    // No content to infer from → return an empty draft rather than fabricating.
    const safeContent = AISecurityManager.sanitizeAiInput(content ?? '')
    const safePci = AISecurityManager.sanitizeAiInput(pci ?? '')
    if (!safeContent && !safePci && !title && !schemeBlock) {
      return NextResponse.json({ spec: {} })
    }

    const contextBlock = [
      title && `Title: ${title}`,
      safeContent && `Content:\n${truncate(safeContent, 12000)}`,
      safePci && `Existing marking policy (PCI):\n${truncate(safePci, 6000)}`,
      schemeBlock &&
        `Official marking scheme (per-question rubrics + marks — the tutor's source of truth for HOW marks are awarded):\n${truncate(schemeBlock, 16000)}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    const schemeGuidance = schemeBlock
      ? `\nThe official marking scheme above is your richest source. DISTIL its cross-cutting policy into the PCI: recurring award conventions (e.g. method/working marks, "accept equivalent forms", follow-through, unit or significant-figure handling), partial-credit patterns implied by the mark splits, and how open vs closed items are treated. Do NOT copy per-question answers or verbatim rubric text into the PCI — those already live in the marking scheme; capture only the GENERAL policy a grader should apply across questions.`
      : ''

    const instruction = `Draft a structured marking-policy specification (PCI) for this ${type} for the tutor to REVIEW and edit.
Return ONLY a JSON object whose keys are a subset of: ${SPEC_KEYS}.
Populate a field ONLY when the context clearly implies it; OMIT any field you cannot reasonably infer — never fabricate policy (retries, grading weights, strictness, partial-credit, reveal timing) the context does not support. It is completely fine to return just one or two fields, or {}.
Keep each value a short, plain-text instruction. Do NOT include answers, rubric criteria, or per-question scoring here — those belong in the marking scheme, not the PCI.${schemeGuidance}
Respond with ONLY the JSON object (no prose, no code fences).

Context:
${contextBlock}`

    let raw: string
    try {
      const result = await generateWithFallback(
        `System:\n${guardrailSystemPrompt(type)}\n\n${instruction}`,
        {
          temperature: GUARDRAILED_TEMPERATURE,
          maxTokens: 1500,
          skipCache: true,
          timeoutMs: 45_000,
          retries: 2,
        }
      )
      raw = result.content
    } catch (err) {
      console.error('[pci-spec-suggest] provider error:', err)
      return NextResponse.json(
        { error: 'The AI model is briefly unavailable. Please try again.', retryable: true },
        { status: 503, headers: { 'Retry-After': '5' } }
      )
    }

    // The model may wrap the spec directly or under a `spec` key — accept both.
    const parsedJson = parseLlmJson<Record<string, unknown>>(raw)
    const candidate =
      parsedJson && typeof parsedJson === 'object' && 'spec' in parsedJson
        ? (parsedJson as { spec?: unknown }).spec
        : parsedJson
    const spec: PciSpec = normalizePciSpec(candidate) ?? {}

    return NextResponse.json({ spec })
  } catch (error) {
    console.error('PCI Spec Suggest error:', error)
    return NextResponse.json({ error: 'Failed to suggest a PCI spec' }, { status: 500 })
  }
}
