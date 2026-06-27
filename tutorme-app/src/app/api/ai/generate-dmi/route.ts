/**
 * Generate DMI (Digital Marking Interface) questions from content or PDF images
 * POST /api/ai/generate-dmi
 * Body: { type: 'task' | 'assessment', title?: string, content?: string, pdfPages?: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, getSessionForRealm, authOptions } from '@/lib/auth'
import { withRateLimitPreset, handleApiError } from '@/lib/api/middleware'
import { AISecurityManager } from '@/lib/security/ai-sanitization'
import { generateWithKimi, generateWithKimiVision } from '@/lib/ai/kimi'
import { stripCodeFences } from '@/lib/ai/llm-response'
import {
  DMI_QUESTION_TYPES,
  DMI_QUESTION_TYPE_LABELS,
  normalizeDmiQuestionType,
  isDmiQuestionType,
  type DmiQuestionType,
} from '@/lib/assessment/question-types'
import {
  runAssessmentGuardrails,
  GUARDRAILED_TEMPERATURE,
  type GuardrailViolation,
} from '@/lib/ai/guardrails'
import { z } from 'zod'

export const maxDuration = 60

const GenerateDmiRequestSchema = z.object({
  type: z.enum(['task', 'assessment']),
  title: z.string().max(200).optional(),
  content: z.string().max(50000).optional(),
  pdfPages: z.array(z.string().max(5_000_000)).max(8).optional(),
  /**
   * For study material: the question types + counts the tutor wants generated.
   * Ignored for a question paper (its questions are mirrored as-is).
   */
  questionSpec: z
    .array(z.object({ type: z.enum(DMI_QUESTION_TYPES), count: z.number().int().min(1).max(50) }))
    .max(10)
    .optional(),
})

const SYSTEM_PROMPT = `You build a DMI: a list of ANSWER INPUT FIELDS for a question paper. The student
reads the real questions from the deployed document, so for a question paper you must NOT reproduce
the question wording or any answers — you only output a short reference LABEL per answerable part.

Return ONLY a JSON object (no prose, no markdown, no code fences) with EXACTLY this shape:
{
  "documentKind": "question_paper" | "study_material",
  "fields": [
    { "label": "Question 1(a)", "type": "short" },
    { "label": "Question 2", "type": "mcq", "options": ["A", "B", "C", "D", "E"] }
  ]
}

Rules:
- documentKind (ALWAYS include it): "question_paper" if the document already contains explicit,
  numbered questions / exam tasks the student is meant to answer; "study_material" if it is a
  textbook, lecture notes, article, summary, or any prose WITHOUT explicit exam questions. When in
  doubt and the document is mostly explanatory prose, choose "study_material".
- For a question_paper: output ONE field per answerable part — every question AND every sub-part
  (a),(b),(c) and sub-sub-part (i),(ii). "label" is the part's reference EXACTLY as printed, e.g.
  "Question 1(a)", "Question 1(b)(i)", "Question 3(a)(ii)". The label MUST be only the reference —
  never the question wording, instructions, marks, or answers. Enumerate EVERY part across ALL
  pages, in order, exactly once: do not skip, merge, summarise, repeat, or stop early. A 6-question
  paper with sub-parts typically yields 15-30 fields.
- For study_material: generate 5-10 questions; here "label" is the full question text.
- "type" is exactly one of: short, long, mcq, true_false, multiple_response, fill_blank, matching,
  ordering, hotspot, drag_drop. Choose by how the part is meant to be answered (multiple-choice
  item -> "mcq" with "options"; short response -> "short"; extended/essay -> "long"). Default to
  "short" if unsure.
- "options" array ONLY for mcq / true_false / multiple_response. For "mcq", ALWAYS provide
  EXACTLY 5 options (these become choices a–e); make them plausible and distinct.
- "pairs" (array of {"left","right"}) ONLY for matching / drag_drop.

EXAMPLE — Question 1 has parts (a),(b)(i),(b)(ii),(c); Question 2 has (a),(b). Correct JSON:
{"documentKind":"question_paper","fields":[
{"label":"Question 1(a)","type":"short"},
{"label":"Question 1(b)(i)","type":"short"},
{"label":"Question 1(b)(ii)","type":"short"},
{"label":"Question 1(c)","type":"long"},
{"label":"Question 2(a)","type":"short"},
{"label":"Question 2(b)","type":"long"}
]}
Output the JSON object and nothing else.`

interface ParsedDmiQuestion {
  questionNumber: number
  questionText: string
  answer: string
  questionType: DmiQuestionType
  options?: string[]
  pairs?: { left: string; right: string }[]
}

interface ParsedDmiResponse {
  documentKind: 'question_paper' | 'study_material' | null
  questions: ParsedDmiQuestion[]
}

/**
 * Primary parser: the model returns a strict JSON object of {label, type} fields.
 * Because the schema has no slot for question wording or answers, the model
 * cannot leak them into the student-visible label. Returns null if the response
 * isn't usable JSON so the caller can fall back to the legacy line parser.
 */
function parseDmiJson(raw: string): ParsedDmiResponse | null {
  try {
    const text = stripCodeFences(raw).trim()
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) return null
    const obj = JSON.parse(text.slice(start, end + 1)) as {
      documentKind?: unknown
      fields?: Array<{ label?: unknown; type?: unknown; options?: unknown; pairs?: unknown }>
    }
    if (!Array.isArray(obj.fields) || obj.fields.length === 0) return null

    const documentKind =
      obj.documentKind === 'study_material'
        ? 'study_material'
        : obj.documentKind === 'question_paper'
          ? 'question_paper'
          : null

    const questions: ParsedDmiQuestion[] = obj.fields
      .map((f, i) => {
        const label = String(f.label ?? '').trim()
        const options = Array.isArray(f.options)
          ? f.options.map(o => String(o).trim()).filter(Boolean)
          : undefined
        const pairs = Array.isArray(f.pairs)
          ? f.pairs
              .map((p: { left?: unknown; right?: unknown }) => ({
                left: String(p?.left ?? '').trim(),
                right: String(p?.right ?? '').trim(),
              }))
              .filter(p => p.left && p.right)
          : undefined
        return {
          questionNumber: i + 1,
          questionText: label,
          answer: '',
          questionType: normalizeTypeToken(typeof f.type === 'string' ? f.type : undefined),
          options: options && options.length > 0 ? options : undefined,
          pairs: pairs && pairs.length > 0 ? pairs : undefined,
        }
      })
      .filter(q => q.questionText)

    if (questions.length === 0) return null
    return { documentKind, questions }
  } catch {
    return null
  }
}

// Map a free-form type tag — a snake_case token OR a human label like
// "Multiple Choice" / "short answer" — to a known type, defaulting to long.
const TYPE_SYNONYMS: Record<string, DmiQuestionType> = {
  multiple_choice: 'mcq',
  mc: 'mcq',
  choice: 'mcq',
  single_choice: 'mcq',
  single_select: 'mcq',
  truefalse: 'true_false',
  tf: 'true_false',
  true_or_false: 'true_false',
  multi_select: 'multiple_response',
  multiselect: 'multiple_response',
  multiple_select: 'multiple_response',
  select_all: 'multiple_response',
  short_answer: 'short',
  shortanswer: 'short',
  long_answer: 'long',
  essay: 'long',
  paragraph: 'long',
  extended_response: 'long',
  fill_in_the_blank: 'fill_blank',
  fill_in_blank: 'fill_blank',
  fillblank: 'fill_blank',
  cloze: 'fill_blank',
  blank: 'fill_blank',
  rank: 'ordering',
  ranking: 'ordering',
  order: 'ordering',
  sequence: 'ordering',
  sequencing: 'ordering',
  match: 'matching',
  drag_and_drop: 'drag_drop',
  draganddrop: 'drag_drop',
  dragdrop: 'drag_drop',
}

function normalizeTypeToken(raw?: string): DmiQuestionType {
  if (!raw) return normalizeDmiQuestionType(undefined)
  const t = raw
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, '_')
    .replace(/_+/g, '_')
  if (isDmiQuestionType(t)) return t
  return TYPE_SYNONYMS[t] ?? normalizeDmiQuestionType(t)
}

// Strip markdown emphasis / bullets / headings / code ticks so lines like
// "**Q1**", "- Q1", "### Q1" still parse.
function cleanLine(s: string): string {
  return s
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/^#+\s*/, '')
    .replace(/^[-•*]\s+/, '')
    .trim()
}

function parseDmiResponse(text: string): ParsedDmiResponse {
  const questions: ParsedDmiQuestion[] = []
  let currentQ: ParsedDmiQuestion | null = null
  let documentKind: ParsedDmiResponse['documentKind'] = null

  for (const rawLine of text.split('\n')) {
    const line = cleanLine(rawLine)
    if (!line) continue

    const kindMatch = line.match(/KIND[:.\)]\s*(question_paper|study_material)/i)
    if (kindMatch && !documentKind) {
      documentKind = kindMatch[1].toLowerCase() as ParsedDmiResponse['documentKind']
      continue
    }

    // Q[n] [type]: text — accept "Q" or "Question"; the [type]/(type) tag is
    // optional and may be ANY text (human labels included) so it never breaks
    // the match; the delimiter may be : . or ).
    const qMatch = line.match(
      /^(?:Q|Question)\s*\.?\s*(\d+)\s*(?:[[(]\s*([^\])]*?)\s*[\])])?\s*[:.)]\s*(.+)$/i
    )
    const optMatch = line.match(/^OPTIONS\s*(\d+)?\s*[:.)]\s*(.+)$/i)
    const pairsMatch = line.match(/^PAIRS\s*(\d+)?\s*[:.)]\s*(.+)$/i)
    // Accept "A1:", "A:", "Answer:", "Ans:" — so a model answer is captured as
    // the (tutor-only) answer and never leaks into the student-visible label.
    const aMatch = line.match(/^(?:Answer|Ans|A)\s*(\d+)?\s*[:.)]\s*(.+)$/i)

    if (qMatch) {
      if (currentQ) questions.push(currentQ)
      currentQ = {
        questionNumber: parseInt(qMatch[1], 10),
        questionText: qMatch[3].trim(),
        answer: '',
        questionType: normalizeTypeToken(qMatch[2]),
      }
    } else if (optMatch && currentQ) {
      currentQ.options = optMatch[2]
        .split('|')
        .map(o => o.trim())
        .filter(Boolean)
    } else if (pairsMatch && currentQ) {
      currentQ.pairs = pairsMatch[2]
        .split('|')
        .map(seg => {
          const [left, right] = seg.split('::').map(s => s.trim())
          return { left: left ?? '', right: right ?? '' }
        })
        .filter(p => p.left && p.right)
    } else if (aMatch && currentQ) {
      currentQ.answer = aMatch[2].trim()
    } else if (currentQ) {
      // Continuation line — append to the answer if started, else the question.
      if (currentQ.answer) currentQ.answer += ' ' + line
      else currentQ.questionText += ' ' + line
    }
  }

  if (currentQ) questions.push(currentQ)

  // For a question paper the label must be ONLY the reference (e.g. "Question
  // 1(a)"). Defensively strip any leaked answer/explanation the model crammed
  // onto the Q line so question text or model answers never reach the student.
  if (documentKind === 'question_paper') {
    for (const q of questions) {
      q.questionText = q.questionText
        .replace(/\s*(?:answer|ans|explanation|solution)\s*[:.)].*$/i, '')
        .trim()
    }
  }

  // Fallback: the model ignored the Q[n] format entirely (e.g. a plain numbered
  // list of questions). Extract numbered lines so we never return an empty DMI
  // when the model clearly produced question-like content.
  if (questions.length === 0) {
    for (const rawLine of text.split('\n')) {
      const line = cleanLine(rawLine)
      const m = line.match(/^(\d+)\s*[.)]\s+(.{6,})$/)
      if (m && !/^(answer|key|note|kind|options|pairs)\b/i.test(m[2])) {
        questions.push({
          questionNumber: parseInt(m[1], 10),
          questionText: m[2].trim(),
          answer: '',
          questionType: normalizeDmiQuestionType(undefined),
        })
      }
    }
  }

  return { documentKind, questions }
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
    const parsed = GenerateDmiRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { type, title, content, pdfPages, questionSpec } = parsed.data

    if (!content?.trim() && (!pdfPages || pdfPages.length === 0)) {
      return NextResponse.json({ error: 'No content or PDF pages provided' }, { status: 400 })
    }

    // When the tutor has specified question types + counts (study material path),
    // tell the model to generate exactly that mix.
    const specInstruction =
      questionSpec && questionSpec.length > 0
        ? `\n\nThis source is study material. Generate exactly: ${questionSpec
            .map(s => `${s.count} ${DMI_QUESTION_TYPE_LABELS[s.type]} (${s.type})`)
            .join(', ')}. Use those exact types and counts.`
        : ''

    let aiResponse: string

    if (pdfPages && pdfPages.length > 0) {
      const promptItems: Array<
        { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
      > = [
        {
          type: 'text',
          text: `Build a DMI (answer input fields) for the following ${type}${title ? ` titled "${title}"` : ''}.${specInstruction}`,
        },
        ...pdfPages.map(page => ({
          type: 'image_url' as const,
          image_url: { url: page },
        })),
      ]

      aiResponse = await generateWithKimiVision(promptItems, {
        systemPrompt: SYSTEM_PROMPT,
        temperature: GUARDRAILED_TEMPERATURE,
        maxTokens: 4096,
        timeoutMs: 60000,
      })
    } else {
      const prompt = `Build a DMI (answer input fields) for the following ${type}${title ? ` titled "${title}"` : ''}:${specInstruction}\n\n${content}`
      aiResponse = await generateWithKimi(prompt, {
        systemPrompt: SYSTEM_PROMPT,
        temperature: GUARDRAILED_TEMPERATURE,
        maxTokens: 4096,
        timeoutMs: 60000,
      })
    }

    const validation = await AISecurityManager.validateAiResponse(aiResponse)
    if (!validation.isValid && validation.severity === 'CRITICAL') {
      return handleApiError(
        new Error('AI response failed security validation'),
        'AI response failed security validation',
        'api/ai/generate-dmi/route.ts'
      )
    }

    // Prefer the strict-JSON output; fall back to the legacy line parser if the
    // model didn't return usable JSON.
    const { documentKind, questions } =
      parseDmiJson(aiResponse) ?? parseDmiResponse(stripCodeFences(aiResponse))

    // Warn-only assessment guardrails. Checks wording fidelity against the
    // source (ASMT-4) and other structural rules where data is available.
    // Non-blocking — surfaced as `guardrailWarnings` and logged server-side.
    let guardrailWarnings: GuardrailViolation[] = []
    if (type === 'assessment') {
      guardrailWarnings = runAssessmentGuardrails(
        { title, questions: questions.map(q => ({ questionText: q.questionText })) },
        { sourceContent: content }
      ).violations
      if (guardrailWarnings.length > 0) {
        console.warn(
          `[guardrails] generate-dmi assessment violations (${guardrailWarnings.length}):`,
          guardrailWarnings.map(v => `${v.ruleId} ${v.severity}`).join(', ')
        )
      }
    }

    return NextResponse.json({
      response: aiResponse,
      // null when the model didn't classify; the tutor UI treats null as
      // "question paper" (the common case) and only prompts for types/counts
      // when it's explicitly study_material with no questionSpec supplied.
      documentKind,
      // True when the source is study material and the tutor hasn't yet chosen
      // the question types/counts — the builder should prompt before deploying.
      needsQuestionSpec: documentKind === 'study_material' && !questionSpec,
      questions,
      guardrailWarnings,
    })
  } catch (error) {
    console.error('Generate DMI error:', error)
    return handleApiError(error, 'Failed to generate DMI questions', 'api/ai/generate-dmi/route.ts')
  }
}
