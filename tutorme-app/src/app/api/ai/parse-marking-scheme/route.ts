/**
 * POST /api/ai/parse-marking-scheme
 *
 * Parses an uploaded marking scheme and matches each DMI question to its answer.
 * The tutor uploads a marking scheme (text or PDF page images) plus the list of
 * question references already in the DMI; the model cuts through page noise and
 * returns, per question number, the expected answer and a rubric capturing the
 * scheme's nuances (acceptable variations, phrasings, tolerances). Tutor-only;
 * nothing is persisted — the client applies the matches to the DMI for review.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, getSessionForRealm, authOptions } from '@/lib/auth'
import { withRateLimitPreset, handleApiError } from '@/lib/api/middleware'
import { AISecurityManager } from '@/lib/security/ai-sanitization'
import { generateWithKimi, generateWithKimiVision } from '@/lib/ai/kimi'
import { stripCodeFences } from '@/lib/ai/llm-response'
import {
  GUARDRAILED_TEMPERATURE,
  guardrailSystemPrompt,
  runAssessmentGuardrails,
} from '@/lib/ai/guardrails'
import { z } from 'zod'

const RequestSchema = z.object({
  content: z.string().max(80000).optional(),
  pdfPages: z.array(z.string().max(5_000_000)).max(8).optional(),
  questions: z
    // `ref` is the paper's real question reference (e.g. "1(a)", "3b", "12"),
    // preserved from the source rather than a re-serialized 1..N index, so a
    // scheme keyed to sub-parts (1a, 1b) lines up correctly.
    .array(z.object({ ref: z.string().min(1).max(40), label: z.string().max(400) }))
    .min(1)
    .max(200),
})

// Task instructions appended after the assessment guardrail system prompt. The
// scheme style is detected per-document so the same endpoint adapts to every
// marking standard (mark-per-point, MCQ keys, tolerance-based, or holistic
// band schemes like AP's Essentially/Partially/Incorrect).
const TASK_PROMPT = `You are given a MARKING SCHEME and a list of QUESTION REFERENCES from an exam/assessment.
For each reference, extract its answer key from the marking scheme — adapting to whatever marking
standard the scheme uses.

Return ONLY a JSON object (no prose, no markdown, no code fences):
{ "matches": [ {
  "ref": "<the exact reference string you were given>",
  "answer": "<canonical correct answer>",
  "variants": ["<every other accepted answer form>", ...],
  "marks": <total points this question is worth>,
  "rubric": "<how the marks are awarded, faithful to the scheme>"
} ] }

Rules:
- Match by question / part reference (e.g. "1(a)", "Q3", "12"). Cut through page headers, footers,
  mark totals, watermarks, "GO ON TO THE NEXT PAGE", and formatting noise to find the right answer.
- "ref" MUST be copied EXACTLY from the reference you were given (the leading #REF), e.g. "1(a)" → "1(a)".
  Do NOT invent, renumber, or merge references. Each given reference is a separate question to answer.
- "answer": the canonical correct answer. For a multiple-choice item give the correct OPTION LETTER
  (A, B, C, …). For a short item give the key expected answer. For a worked/extended/holistic item give a
  concise model answer or the description of a fully-credited (e.g. "Essentially correct") response.
- "variants": an array of ALL OTHER answer forms the scheme accepts for full credit — alternative phrasings,
  equivalent values, accepted spellings/synonyms, numeric values within the allowed tolerance, answers
  with/without units, and alternative valid methods' final answers. List each distinctly. Empty array if
  the scheme accepts only the one canonical answer.
- "marks": the total points/marks the scheme assigns to this question (the maximum). For a holistic band
  scheme use the maximum band score (e.g. 4). Integer or decimal exactly as the scheme states; omit only if
  the scheme genuinely gives no points value.
- "rubric": faithfully capture HOW the marks are awarded so a grader can score fairly — method/accuracy
  marks (M1/A1), per-criterion points, partial-credit rules, "allow / accept / do not accept / condone"
  notes, OR holistic band descriptors (what makes a response Essentially correct vs Partially correct vs
  Incorrect). Keep it concise but do not drop award rules.
- Only include a reference whose answer you can actually find in the scheme. OMIT the rest. NEVER invent an
  answer, variant, mark value, or award rule that is not in the marking scheme.`

const SYSTEM_PROMPT = `${guardrailSystemPrompt('assessment')}\n\n${TASK_PROMPT}`

interface SchemeMatch {
  ref: string
  answer: string
  variants?: string[]
  marks?: number
  rubric?: string
}

// Normalize a reference so "1(a)" and "1a" compare equal.
function refKey(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function parseMatches(raw: string, validRefs: Map<string, string>): SchemeMatch[] {
  try {
    const text = stripCodeFences(raw).trim()
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) return []
    const obj = JSON.parse(text.slice(start, end + 1)) as {
      matches?: Array<{
        ref?: unknown
        number?: unknown
        answer?: unknown
        variants?: unknown
        marks?: unknown
        rubric?: unknown
      }>
    }
    if (!Array.isArray(obj.matches)) return []
    const out: SchemeMatch[] = []
    const seen = new Set<string>()
    for (const m of obj.matches) {
      // Accept `ref`; tolerate a model that still emits `number`.
      const key = refKey(m?.ref ?? m?.number)
      const canonical = validRefs.get(key)
      const answer = String(m?.answer ?? '').trim()
      if (!canonical || seen.has(key) || !answer) continue
      seen.add(key)
      const rubric = String(m?.rubric ?? '').trim()
      // De-duplicate variants and drop any that just echo the canonical answer.
      const variants = Array.isArray(m?.variants)
        ? Array.from(
            new Set(
              m.variants
                .map(v => String(v ?? '').trim())
                .filter(v => v && v.toLowerCase() !== answer.toLowerCase())
            )
          )
        : []
      const marksNum = Number(m?.marks)
      const marks = Number.isFinite(marksNum) && marksNum > 0 ? marksNum : undefined
      out.push({
        ref: canonical,
        answer,
        variants: variants.length > 0 ? variants : undefined,
        marks,
        rubric: rubric || undefined,
      })
    }
    return out
  } catch {
    return []
  }
}

export async function POST(request: NextRequest) {
  try {
    const { response: rateLimitResponse } = await withRateLimitPreset(request, 'aiGenerate')
    if (rateLimitResponse) return rateLimitResponse

    const session =
      (await getSessionForRealm(request, 'tutor')) ?? (await getServerSession(authOptions, request))
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const { content, pdfPages, questions } = parsed.data

    if (!content?.trim() && (!pdfPages || pdfPages.length === 0)) {
      return NextResponse.json({ error: 'No marking scheme content provided' }, { status: 400 })
    }

    const questionList = questions.map(q => `#${q.ref}: ${q.label}`).join('\n')
    // Normalized reference → the exact reference string to echo back in matches.
    const validRefs = new Map(questions.map(q => [refKey(q.ref), q.ref]))

    let aiResponse: string
    if (pdfPages && pdfPages.length > 0) {
      const promptItems: Array<
        { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
      > = [
        {
          type: 'text',
          text: `Question references to match (copy the leading #REF exactly into "ref"):\n${questionList}\n\nThe marking scheme follows as page images.`,
        },
        ...pdfPages.map(page => ({ type: 'image_url' as const, image_url: { url: page } })),
      ]
      aiResponse = await generateWithKimiVision(promptItems, {
        systemPrompt: SYSTEM_PROMPT,
        temperature: GUARDRAILED_TEMPERATURE,
        maxTokens: 4096,
        // Reading several scanned scheme pages with the vision model is slow; the
        // old 60s cap aborted mid-read on bigger papers. Cloud Run allows 300s.
        timeoutMs: 150000,
      })
    } else {
      const prompt = `Question references to match (copy the leading #REF exactly into "ref"):\n${questionList}\n\nMarking scheme:\n${content}`
      aiResponse = await generateWithKimi(prompt, {
        systemPrompt: SYSTEM_PROMPT,
        temperature: GUARDRAILED_TEMPERATURE,
        maxTokens: 4096,
        timeoutMs: 120000,
      })
    }

    const validation = await AISecurityManager.validateAiResponse(aiResponse)
    if (!validation.isValid && validation.severity === 'CRITICAL') {
      return handleApiError(
        new Error('AI response failed security validation'),
        'AI response failed security validation',
        'api/ai/parse-marking-scheme/route.ts'
      )
    }

    const matches = parseMatches(aiResponse, validRefs)

    // Guardrail rule 2: run the assessment guardrails over the extracted answer
    // key (warn-only). Provenance is answer_sheet_extracted (ASMT-5). Not
    // student-facing — this is the tutor-side evaluation layer.
    const questionByRef = new Map(questions.map(q => [refKey(q.ref), q.label]))
    const guardrail = runAssessmentGuardrails({
      questions: matches.map(m => ({
        questionId: m.ref,
        questionText: questionByRef.get(refKey(m.ref)) ?? '',
        marks: m.marks,
        rubric: m.rubric ? { criteria: [] } : null,
        answerProvenance: 'answer_sheet_extracted' as const,
      })),
    })

    return NextResponse.json({
      matches,
      matched: matches.length,
      total: questions.length,
      guardrailWarnings: guardrail.violations,
    })
  } catch (error) {
    // A timeout aborts the AI fetch with an AbortError — surface a clear,
    // actionable message (the generic "Failed to parse" hid that it timed out).
    const name = (error as { name?: string } | null)?.name
    const isTimeout = name === 'AbortError' || name === 'TimeoutError'
    if (isTimeout) {
      return NextResponse.json(
        {
          error:
            'The marking scheme took too long to read. Try a smaller or clearer file (e.g. fewer pages, or a text/PDF with selectable text).',
        },
        { status: 504 }
      )
    }
    return handleApiError(
      error,
      'Failed to parse marking scheme',
      'api/ai/parse-marking-scheme/route.ts'
    )
  }
}
