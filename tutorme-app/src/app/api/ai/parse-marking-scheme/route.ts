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
import { refKey } from '@/lib/assessment/marking-scheme'
import { parseMatches, parseDetection } from '@/lib/assessment/scheme-response'
import {
  GUARDRAILED_TEMPERATURE,
  guardrailSystemPrompt,
  runAssessmentGuardrails,
} from '@/lib/ai/guardrails'
import { z } from 'zod'

const RequestSchema = z.object({
  content: z.string().max(80000).optional(),
  pdfPages: z.array(z.string().max(5_000_000)).max(8).optional(),
  // Optional hint from the tutor's badge: which board / subject this paper is, so
  // the model leans on that board's conventions (it still verifies against the
  // actual scheme). Purely advisory.
  examBody: z.string().max(60).optional(),
  subject: z.string().max(120).optional(),
  // The tutor's PCI instructions for this task — how they want it marked. Steers
  // which answers/variants/award rules to favour when the scheme is ambiguous.
  pci: z.string().max(4000).optional(),
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

Marking schemes come from MANY examination boards and you must handle ANY of them — do not assume a
single house style. FIRST infer the board / standard from the scheme's layout, notation and language,
THEN apply that board's conventions:
- Objective items (MCQ / multiple response / true-false): the answer is the option LETTER(s) / value
  given in the key (e.g. "C", "B and D", "True").
- UK / Cambridge / Edexcel / AQA / OCR / WJEC (A-Level, AS, IGCSE, GCSE): mark codes M (method), A
  (accuracy), B (independent), and notations "allow / accept / condone / oe (or equivalent) / ft or
  ecf (error carried forward) / cao / awrt / ignore / do not accept / SC (special case)". Put every
  accepted form in "variants" and capture the M/A/B award rules in "rubric".
- IB: per-part M (method) and A (answer) marks and/or holistic markbands — capture the band
  descriptors and what earns each mark in "rubric".
- AP (College Board): scoring guidelines with points per part / holistic bands ("Essentially /
  Partially / Incorrect") — capture the point criteria in "rubric".
- Maths / sciences generally: accept values within the stated TOLERANCE and any equivalent form
  (units optional, equivalent fractions/decimals, alternative valid methods) — list representative
  accepted values in "variants".
- Languages / essays / long-form: capture the band/level descriptors and assessment objectives in
  "rubric"; give a concise model answer or fully-credited exemplar as "answer".
Treat this list as guidance, not a whitelist: if the scheme is from a board not named here, detect its
own scheme and apply it faithfully. Never force one board's rules onto another's scheme.

Return ONLY a JSON object (no prose, no markdown, no code fences):
{ "examBody": "<the examining board you detect, e.g. AP, IB, A-Level, IGCSE, Edexcel, Cambridge, AQA, OCR, SAT — or \"\" if unsure>",
  "subject": "<the subject you detect, e.g. Calculus AB, Physics — or \"\">",
  "matches": [ {
  "ref": "<the exact reference string you were given>",
  "answer": "<canonical correct answer>",
  "variants": ["<every other accepted answer form>", ...],
  "marks": <total points this question is worth>,
  "rubric": "<how the marks are awarded, faithful to the scheme>"
} ] }

Detect "examBody" and "subject" from the scheme's own header / branding / style. Leave them "" if genuinely unclear — do not guess wildly.

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
- Include EVERY question / part whose answer you can actually find in the scheme: the references listed
  above AND any ADDITIONAL numbered questions or sub-parts present in the scheme that are NOT in that list
  (e.g. the list has 3(a),3(b) but the scheme also marks 3(c)). For each, use its OWN reference as "ref".
  This lets the tutor add the missing questions. NEVER invent an answer, variant, mark value, award rule,
  or a question that is not actually in the marking scheme.`

const SYSTEM_PROMPT = `${guardrailSystemPrompt('assessment')}\n\n${TASK_PROMPT}`

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
    const { content, pdfPages, questions, examBody, subject, pci } = parsed.data

    if (!content?.trim() && (!pdfPages || pdfPages.length === 0)) {
      return NextResponse.json({ error: 'No marking scheme content provided' }, { status: 400 })
    }

    // Advisory board/subject hint from the tutor's badge (the model still verifies
    // against the actual scheme).
    const boardHint =
      examBody || subject
        ? `The tutor indicates this is a ${[examBody, subject].filter(Boolean).join(' ')} paper — ` +
          `prefer that board's marking conventions, but trust the scheme itself if it clearly differs.\n\n`
        : ''
    // The tutor's own marking instructions (PCI) — favour answer forms / award
    // rules consistent with them, but never invent anything not in the scheme.
    const pciText = String(pci ?? '').trim()
    const pciHint = pciText
      ? `The tutor's marking instructions for this task: ${pciText}\n` +
        `Honour these when choosing which accepted forms and award rules to capture, but never add an ` +
        `answer, variant or rule that is not actually in the marking scheme.\n\n`
      : ''
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
          text: `${boardHint}${pciHint}Question references to match (copy the leading #REF exactly into "ref"):\n${questionList}\n\nThe marking scheme follows as page images.`,
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
      const prompt = `${boardHint}${pciHint}Question references to match (copy the leading #REF exactly into "ref"):\n${questionList}\n\nMarking scheme:\n${content}`
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
    const detected = parseDetection(aiResponse)

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
      // Board/subject detected from the scheme — the client uses these to fill
      // the badge when the tutor hasn't set it.
      detectedExamBody: detected.examBody,
      detectedSubject: detected.subject,
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
