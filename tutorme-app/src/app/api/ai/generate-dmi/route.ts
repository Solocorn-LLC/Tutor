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

const SYSTEM_PROMPT = `You are an expert educational assessment designer building a DMI (Digital Marking Interface).

A DMI is a set of ANSWER INPUT FIELDS that a student fills in. The student reads the actual
questions from the deployed document — so for a question paper you do NOT reproduce the question
text. Instead you produce one numbered input field per answerable part, labelled by its number.

First, classify the source and output it as the very first line:
KIND: question_paper   (the document already contains questions / exam tasks)
KIND: study_material   (notes / material with no explicit questions)

Then output one line per input field in this format:
Q[number] [type]: [field label]
OPTIONS[number]: option 1 | option 2 | option 3      (ONLY for mcq / true_false / multiple_response)
PAIRS[number]: left A :: right 1 | left B :: right 2 | left C :: right 3   (ONLY for matching / drag_drop)
A[number]: [suggested answer or key points]

[number] is a SEQUENTIAL counter (1, 2, 3, …) for the output lines. [field label] is:
- question_paper: the question's reference EXACTLY as printed — every question AND every
  sub-question / sub-part as its own field, e.g. "Question 1(a)", "Question 1(b)", "Question 2",
  "Question 3(a)(i)". Do NOT include the question text — only the reference label.
- study_material: the full generated question text (there is no paper for the student to read).

[type] must be exactly one of:
  short              one-line factual answer
  long               paragraph / essay answer
  mcq                multiple choice, exactly one correct option
  true_false         true / false
  multiple_response  multiple choice, one or more correct options
  fill_blank         fill in the blank / cloze
  matching           match items across two columns
  ordering           order or rank items
  hotspot            click a region of an image
  drag_drop          drag items into targets
Pick the type that best matches how the question expects to be answered. Write the [type] tag
as the exact lowercase token above (e.g. [mcq], [true_false]) — not a human-readable label.

Rules:
- For a question_paper: enumerate EVERY question and EVERY sub-part across ALL pages, in order,
  exactly once each — do not skip, merge, summarise, or repeat any part, and do not stop early.
  A question with parts (a),(b),(c) becomes three separate fields. Use the reference label exactly
  as printed; pick the [type] from how that part is meant to be answered (a multiple-choice item
  -> mcq with OPTIONS, a short response -> short, an extended/essay response -> long, etc.).
- For study_material (no explicit questions): generate 5-10 questions covering the main concepts.
- The A[number] answers are for tutor verification ONLY and must never be shown to a student.
- For a matching question, the PAIRS line gives the CORRECT left::right correspondences (the
  answer key); the student will see the left items and pick from the shuffled right values.
- For a drag_drop question, the PAIRS line gives each draggable item and the target it belongs
  in as item :: target (the answer key); targets may repeat across items.
- Do not invent mark allocations or evaluation criteria. If something is unclear, say so in the A
  line rather than guessing.
- Output ONLY the KIND line and the Q / OPTIONS / PAIRS / A lines — no other text.

EXAMPLE — a question paper whose Question 1 has parts (a), (b)(i), (b)(ii), (c) and Question 2 has
parts (a), (b). The CORRECT output is one field per sub-part, label only, no question text:
KIND: question_paper
Q1 [short]: Question 1(a)
A1: ...
Q2 [short]: Question 1(b)(i)
A2: ...
Q3 [short]: Question 1(b)(ii)
A3: ...
Q4 [long]: Question 1(c)
A4: ...
Q5 [short]: Question 2(a)
A5: ...
Q6 [long]: Question 2(b)
A6: ...
(Every sub-part is its own field; the label is ONLY the reference; the question wording never
appears in a Q line — the student reads it from the document.)`

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
        maxTokens: 6000,
        timeoutMs: 60000,
      })
    } else {
      const prompt = `Build a DMI (answer input fields) for the following ${type}${title ? ` titled "${title}"` : ''}:${specInstruction}\n\n${content}`
      aiResponse = await generateWithKimi(prompt, {
        systemPrompt: SYSTEM_PROMPT,
        temperature: GUARDRAILED_TEMPERATURE,
        maxTokens: 6000,
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

    const { documentKind, questions } = parseDmiResponse(stripCodeFences(aiResponse))

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
