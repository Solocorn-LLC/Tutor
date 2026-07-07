/**
 * POST /api/ai/pci-interview
 *
 * Drives ONE turn of a conversational PCI (marking policy) interview. Instead of
 * a form, an assistant probes the tutor one plain-language question at a time —
 * covering Board, Subject, and the 10 PciSpec marking fields — interprets each
 * answer into the structured spec, and returns the next question. The client
 * assembles the same { free-text pci + PciSpec } the Guided form produced, so
 * grading is unchanged. Simple language (many tutors aren't native speakers).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, getSessionForRealm, authOptions } from '@/lib/auth'
import { withRateLimitPreset } from '@/lib/api/middleware'
import { AISecurityManager } from '@/lib/security/ai-sanitization'
import { generateWithFallback } from '@/lib/agents'
import { parseLlmJson } from '@/lib/ai/llm-response'
import { PCI_SPEC_FIELDS, type PciSpec } from '@/lib/assessment/pci-spec'
import { z } from 'zod'

const SPEC_KEYS = PCI_SPEC_FIELDS.map(f => f.key)

const RequestSchema = z.object({
  type: z.enum(['task', 'assessment']).default('assessment'),
  title: z.string().max(300).optional(),
  content: z.string().max(20000).optional(),
  markingScheme: z.string().max(16000).optional(),
  history: z
    .array(z.object({ role: z.enum(['assistant', 'user']), content: z.string().max(4000) }))
    .max(40)
    .default([]),
  spec: z.record(z.string(), z.string()).default({}),
  boardKnown: z.boolean().default(false),
  subjectKnown: z.boolean().default(false),
})

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)

/**
 * The interview script — plain-language question + example per point. The model
 * conducts it, but this gives it the order and the tone to mirror.
 */
const FIELD_GUIDE = `Collect these points, in this order. Skip any already in FILLED. Skip "board"/"subject" if already known.
- board — the exam board or curriculum. Ask: "Which exam board or curriculum is this for? For example: IB, Cambridge IGCSE, AP, or a national exam."
- subject (key: "category") — the subject. Ask: "What subject is this assessment for? For example: Maths, Biology, or English."
- instructionalContentReference — which lesson/topic it covers. Ask: "Which topic or material is this assessment about? For example: 'Chapter 3 — quadratic equations'."
- triggerEvent — when marking should happen. Ask: "When should the AI mark an answer? For example: 'when the student sends an answer'."
- evaluationLogic — how answers are marked (THE MOST IMPORTANT one — probe for detail). Ask: "How should answers be marked? For example: 'give marks for the correct method even if the final number is wrong; accept equal fractions'."
- correctResponseBehavior — when a student is right. Ask: "When a student's answer is correct, what should the AI do? For example: 'say well done and move on'."
- incorrectResponseBehavior — when a student is wrong. Ask: "When a student is wrong, what should happen? For example: 'give one small hint; do not show the answer'."
- partialUnderstandingBehavior — when partly right. Ask: "If an answer is only partly right, how should you mark it? For example: 'give marks for each correct step'."
- noResponseBehavior — when blank. Ask: "If a student leaves it blank, what should the AI do? For example: 'give a small hint to help them start'."
- explanationRules — explaining answers. Ask: "Should the AI explain the answer, and when? For example: 'explain step by step, but only after the student tries'."
- retryPolicy — number of tries. Ask: "How many tries does a student get before seeing the answer? For example: 'two tries, then show the correct answer'."
- instructionalTone — the tone. Ask: "What tone should the AI use with students? For example: 'warm and patient'."`

export async function POST(request: NextRequest) {
  try {
    const session =
      (await getSessionForRealm(request, 'tutor')) ?? (await getServerSession(authOptions, request))
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user.role !== 'TUTOR' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { response: rateLimitResponse } = await withRateLimitPreset(request, 'aiGenerate')
    if (rateLimitResponse) return rateLimitResponse

    const body = await request.json().catch(() => null)
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const { type, title, content, markingScheme, history, spec, boardKnown, subjectKnown } =
      parsed.data

    const filled: string[] = SPEC_KEYS.filter(k => (spec as Record<string, string>)[k]?.trim())
    if (boardKnown) filled.push('board')
    if (subjectKnown) filled.push('subject')

    const contextBlock = [
      title && `Assessment title: ${title}`,
      content && `Assessment content:\n${truncate(content, 8000)}`,
      markingScheme &&
        `Official marking scheme (per-question — use it to suggest sensible defaults, but the tutor decides):\n${truncate(markingScheme, 10000)}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    const conversation = history.length
      ? history
          .map(h => `${h.role === 'assistant' ? 'Assistant' : 'Tutor'}: ${h.content}`)
          .join('\n')
      : '(no messages yet — greet the tutor warmly in one short line, then ask the first needed question.)'

    const instruction = `You are a warm, patient assistant helping a tutor set up their marking policy (the "PCI") for an ${type}, by TALKING with them — not with a form. Many tutors are not native English speakers, so:
- Use short, simple sentences. Avoid difficult words and jargon.
- Ask only ONE question at a time, and include a small example.
- If the tutor's answer is unclear or very short, ask ONE gentle follow-up for detail; otherwise briefly confirm what you understood and move on.
- Be encouraging.

${FIELD_GUIDE}

Return ONLY a JSON object (no prose, no code fences), shaped exactly:
{
  "updates": { <only the point(s) the tutor's LATEST message answers — use these exact keys: ${SPEC_KEYS.join(', ')}, and/or "board", "category". Each value a short, plain marking instruction rephrasing what the tutor said.> },
  "message": "<your next message to the tutor: one short line confirming what you understood, then the next question with an example — simple language. If everything needed is collected, instead give a short, plain-language summary of the whole policy and say you are ready to save.>",
  "done": <true ONLY when every needed point is collected>
}
Rules:
- Put into "updates" ONLY what the tutor's latest message clearly states. If they say "skip" / "not needed", leave that field out — never invent policy they did not say.
- Ask about the FIRST point in the list that is not already in FILLED.
- Keep "message" short and friendly.

FILLED (already collected — do NOT ask about these): ${filled.length ? filled.join(', ') : '(none yet)'}
${contextBlock ? `\n${contextBlock}\n` : ''}
Conversation so far:
${conversation}`

    let raw: string
    try {
      const result = await generateWithFallback(instruction, {
        temperature: 0.4,
        maxTokens: 800,
        skipCache: true,
        timeoutMs: 45_000,
        retries: 1,
      })
      raw = result.content
    } catch (err) {
      console.error('[pci-interview] provider error:', err)
      return NextResponse.json(
        { error: 'The assistant is briefly unavailable. Please try again.', retryable: true },
        { status: 503, headers: { 'Retry-After': '5' } }
      )
    }

    const json = parseLlmJson<{
      updates?: Record<string, unknown>
      message?: unknown
      done?: unknown
    }>(raw)

    // Keep only recognised, non-empty string updates (never fabricate structure).
    const rawUpdates = (json?.updates ?? {}) as Record<string, unknown>
    const specUpdates: Partial<PciSpec> = {}
    for (const k of SPEC_KEYS) {
      const v = rawUpdates[k]
      if (typeof v === 'string' && v.trim()) specUpdates[k] = v.trim().slice(0, 1000)
    }
    const examContext: { board?: string; category?: string } = {}
    if (typeof rawUpdates.board === 'string' && rawUpdates.board.trim()) {
      examContext.board = rawUpdates.board.trim().slice(0, 120)
    }
    if (typeof rawUpdates.category === 'string' && rawUpdates.category.trim()) {
      examContext.category = rawUpdates.category.trim().slice(0, 120)
    }

    const message =
      typeof json?.message === 'string' && json.message.trim()
        ? json.message.trim().slice(0, 1200)
        : 'Could you tell me a bit more about how you want answers marked?'

    // Warn-only safety scan of the assistant's message (it's tutor-facing).
    const scan = await AISecurityManager.validateAiResponse(message)
    if (!scan.isValid && scan.severity === 'CRITICAL') {
      return NextResponse.json({
        message: 'Let’s continue — how would you like answers to be marked?',
        updates: {},
        examContext: {},
        done: false,
      })
    }

    return NextResponse.json({
      message,
      updates: specUpdates,
      examContext,
      done: json?.done === true,
    })
  } catch (error) {
    console.error('PCI interview error:', error)
    return NextResponse.json({ error: 'Failed to run the PCI interview' }, { status: 500 })
  }
}
