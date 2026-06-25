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
  pdfPages: z.array(z.string().max(5_000_000)).max(5).optional(),
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
questions from the deployed document — your job is to produce, for each question, a well-numbered
answer field of the RIGHT INPUT TYPE. Do not rewrite or invent questions for a question paper;
mirror its questions one-to-one as typed input fields.

First, classify the source and output it as the very first line:
KIND: question_paper   (the document already contains questions / exam tasks)
KIND: study_material   (notes / material with no explicit questions)

Then, for each question, output exactly in this format:
Q[number] [type]: [question text — copied EXACTLY from the source for a question paper]
OPTIONS[number]: option 1 | option 2 | option 3      (ONLY for mcq / true_false / multiple_response)
PAIRS[number]: left A :: right 1 | left B :: right 2 | left C :: right 3   (ONLY for matching)
A[number]: [suggested answer or key points]

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
Pick the type that best matches how the question expects to be answered.

Rules:
- For a question_paper, preserve question wording EXACTLY — do not paraphrase. If the source has
  no explicit questions (study_material), generate 5-10 questions covering the main concepts.
- The A[number] answers are for tutor verification ONLY and must never be shown to a student.
- For a matching question, the PAIRS line gives the CORRECT left::right correspondences (the
  answer key); the student will see the left items and pick from the shuffled right values.
- Do not invent mark allocations or evaluation criteria. If something is unclear, say so in the A
  line rather than guessing.
- Output ONLY the KIND line and the Q / OPTIONS / PAIRS / A lines — no other text.`

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

function parseDmiResponse(text: string): ParsedDmiResponse {
  const questions: ParsedDmiQuestion[] = []
  const lines = text.split('\n')
  let currentQ: ParsedDmiQuestion | null = null
  let documentKind: ParsedDmiResponse['documentKind'] = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const kindMatch = line.match(/^KIND[:.\)]\s*(question_paper|study_material)/i)
    if (kindMatch && !documentKind) {
      documentKind = kindMatch[1].toLowerCase() as ParsedDmiResponse['documentKind']
      continue
    }

    // Q[n] [type]: text  — the type tag in []/() is optional (back-compat).
    const qMatch = line.match(/^Q\s*(\d+)\s*(?:[[(]\s*([a-z_]+)\s*[\])])?\s*[:.\)]\s*(.+)$/i)
    const optMatch = line.match(/^OPTIONS\s*(\d+)\s*[:.\)]\s*(.+)$/i)
    const pairsMatch = line.match(/^PAIRS\s*(\d+)\s*[:.\)]\s*(.+)$/i)
    const aMatch = line.match(/^A\s*(\d+)\s*[:.\)]\s*(.+)$/i)

    if (qMatch) {
      if (currentQ) questions.push(currentQ)
      currentQ = {
        questionNumber: parseInt(qMatch[1], 10),
        questionText: qMatch[3].trim(),
        answer: '',
        questionType: normalizeDmiQuestionType(qMatch[2]?.toLowerCase()),
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
