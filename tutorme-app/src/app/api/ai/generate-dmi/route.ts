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
  buildAnswerKeySearchQuery,
  formatSearchResultsForPrompt,
  searchAnswerKey,
} from '@/lib/search/serper'
import {
  DMI_QUESTION_TYPES,
  DMI_QUESTION_TYPE_LABELS,
  normalizeDmiQuestionType,
  isDmiQuestionType,
  type DmiQuestionType,
} from '@/lib/assessment/question-types'
import { extractQuestionRef } from '@/lib/assessment/marking-scheme'
import { scoreDocumentConfidence } from '@/lib/assessment/confidence'
import {
  analyzeDocumentSignals,
  documentKindLooksWrong,
  resolveDocumentKind,
} from '@/lib/assessment/document-signals'
import {
  runAssessmentGuardrails,
  checkCurriculumMatch,
  GUARDRAILED_TEMPERATURE,
  type GuardrailViolation,
} from '@/lib/ai/guardrails'
import { classifyDocumentCurriculum } from '@/lib/assessment/curriculum-classify'
import { z } from 'zod'

export const maxDuration = 60

const GenerateDmiRequestSchema = z.object({
  type: z.enum(['task', 'assessment']),
  title: z.string().max(200).optional(),
  // Board/subject context carried from the course category (e.g. "AP",
  // "Biology"). A hint so generation follows the right exam conventions — it
  // never overrides the source paper's wording, marks, or answers.
  examBody: z.string().max(60).optional(),
  subject: z.string().max(120).optional(),
  // Up to ~80k chars (~20k tokens) so a full multi-section paper's questions fit
  // after front matter is trimmed client-side; still well under the model limit.
  content: z.string().max(80000).optional(),
  pdfPages: z.array(z.string().max(5_000_000)).max(8).optional(),
  /**
   * For study material: the question types + counts the tutor wants generated.
   * Ignored for a question paper (its questions are mirrored as-is).
   */
  questionSpec: z
    .array(z.object({ type: z.enum(DMI_QUESTION_TYPES), count: z.number().int().min(1).max(50) }))
    .max(10)
    .optional(),
  /**
   * Tutor's explicit answer to the "is this a question paper?" prompt. When set,
   * the model is told the kind (so it extracts/authors accordingly) and the
   * re-classification confirmation is skipped.
   */
  documentKindOverride: z.enum(['question_paper', 'study_material']).optional(),
})

const SYSTEM_PROMPT = `You build a DMI: a list of ANSWER INPUT FIELDS for a question paper. The student
reads the real questions from the deployed document, so for a question paper you must NOT reproduce
the question wording in the public label — you only output a short reference LABEL per answerable part.
However, you MUST also include a hidden "answer" and "rubric" field on every field for the tutor's
evaluation layer; these are never shown to students.

Return ONLY a JSON object (no prose, no markdown, no code fences) with EXACTLY this shape:
{
  "documentKind": "question_paper" | "study_material" | "uncertain",
  "fields": [
    { "label": "Question 1(a)", "type": "short", "marks": 2, "answer": "7", "rubric": "Award 1 mark for method, 1 mark for correct final answer." },
    { "label": "Question 2", "type": "mcq", "options": ["A", "B", "C", "D", "E"], "answer": "C", "marks": 1 }
  ]
}

Rules:
- documentKind (ALWAYS include it): "question_paper", "study_material", or "uncertain". Decide by the
  document's PURPOSE — is the student meant to ANSWER a set of questions (a paper), or to LEARN from
  it (material)? Judge by real answer-prompts aimed at the student, NOT by mere structure (numbering,
  lists) or by how much prose it contains.
  - "question_paper" — the document is a SET of questions/tasks for the student to answer, shown by a
    CONSISTENT pattern of answerable items: numbered questions that each pose a task; printed mark
    allocations like "[5]"; multiple-choice items with lettered options (A–E); blank answer spaces; or
    task verbs directed at the student to produce an answer (calculate, determine, find, compute,
    show, prove, explain, justify, describe, state, estimate, sketch, construct, interpret). This
    INCLUDES exam / past papers that wrap each question in heavy context — a scenario paragraph, data
    set, table, chart, formula sheet, or stimulus passage is NORMAL in a question paper and does NOT
    make it study material (e.g. an AP Statistics free-response paper is a question_paper even though
    every question has a long scenario).
  - "study_material" — the document is mainly there to be READ and learned from: a textbook section,
    lecture notes, an article, a summary, revision slides, or a worked-examples handout. Incidental
    structure — numbered headings, bulleted or lettered lists, the odd rhetorical or embedded question,
    or worked examples that use verbs like "calculate"/"explain" while TEACHING a method — does NOT
    make it a question paper. If the bulk is explanation and there is no consistent set of
    answer-prompts aimed at the student, it is study_material.
  - "uncertain" — use this when you genuinely cannot tell (a mix with no clear intent). Do NOT fall
    back to "question_paper" when unsure; returning "uncertain" lets the tutor confirm.
- For a question_paper: output ONE field per answerable part — every question AND every sub-part
  (a),(b),(c) and sub-sub-part (i),(ii). "label" is the part's reference EXACTLY as printed, e.g.
  "Question 1(a)", "Question 1(b)(i)", "Question 3(a)(ii)". For a bare multiple-choice section,
  label each item by its number ("Question 12"). The label MUST be only the reference — never the
  question wording, instructions, marks, or answers. Enumerate EVERY part across ALL pages, in
  order, exactly once: do not skip, merge, summarise, repeat, or stop early. A 6-question paper with
  sub-parts typically yields 15-30 fields.
- For study_material: AUTHOR 5-10 questions that TEST the material — never bare numbers, section titles, or headings. Here "label" is the FULL question wording (a complete, answerable question), and each item carries a model "answer" and a "rubric". Choose a sensible mix of types for the content.
- "type" is exactly one of: short, long, mcq, true_false, multiple_response, fill_blank, matching,
  ordering, hotspot, drag_drop. Choose by how EACH part is answered: a multiple-choice item (lettered
  options on the paper) -> "mcq"; a numeric / one-line response -> "short"; an extended written
  response (free-response, essay, "explain"/"justify"/"describe") -> "long"; true/false -> "true_false".
  A paper may MIX types — e.g. a multiple-choice section followed by free-response questions — so type
  each part by its OWN format, not the paper as a whole. Default to "short" if unsure.
- "options" array ONLY for mcq / true_false / multiple_response.
  - For a question_paper MCQ: set "options" to the lettered choices that appear on the paper (usually
    ["A","B","C","D","E"]; use the actual number of choices if different). These become the student's
    clickable letters — do NOT reproduce the option text (the student reads it from the paper).
  - For a study_material MCQ you author: provide EXACTLY 5 plausible, distinct options (a–e).
- "pairs" (array of {"left","right"}) ONLY for matching / drag_drop.
- "marks": an integer number of points for the part. For a question_paper, use the marks PRINTED
  on the paper when visible (e.g. "[5]" -> 5); if none is shown, use 1. For study_material, assign
  sensible marks (1 for an objective item like mcq/true_false/fill_blank; 2-10 for short/long
  answers by depth).
- "section" (OPTIONAL): the section heading this part falls under, EXACTLY as printed on the paper
  (e.g. "Section A", "Section B: Data Response", "Part II"). Include it on EVERY field when the paper
  is divided into sections, using the same string for all parts in one section; OMIT it entirely when
  the paper has no sections. Never invent a section that isn't on the paper.
- "responseType" (OPTIONAL): a SHORT label for the expected ANSWER FORMAT, distinct from the input
  control "type". Examples: "numeric", "algebraic expression", "single word", "short explanation",
  "extended essay", "proof", "diagram/sketch", "graph", "true/false", "single letter", "list". Infer
  it from the question wording ("calculate" -> numeric; "explain/justify" -> explanation; "sketch/draw"
  -> diagram). Omit if genuinely unclear — never guess wildly.
- "sourceDependencies" (OPTIONAL): an ARRAY of the source materials this part depends on, named
  EXACTLY as labelled on the paper (e.g. ["Figure 2"], ["Passage A", "Table 1"], ["the data in
  Question 1"]). Include only materials this specific part references; OMIT entirely when the part is
  self-contained. Never invent a reference that isn't on the paper.
- "answer" and "rubric": EVERY field MUST include an "answer". Add a "rubric" for every open-ended
  (short/long) item and for any item where useful marking guidance exists. These fields are hidden from
  students and are used only by the tutor's evaluation layer; the student sees only the question reference.
  - For a question_paper, do NOT put the answer or rubric in the "label" or "questionText"; those fields
    must remain student-facing references only. The hidden "answer" and "rubric" fields are where the
    correct answer and marking guidance live.
  - If the request includes an "Answer-key research results" block from a web search, use it as the primary
    source for answers and rubrics when it is trustworthy. Match questions by number/reference and fill
    in the corresponding "answer" field.
  - If no answer key is found, use your own analysis and reasoning to produce a best-effort answer and
    concise marking guidance.
  - For study_material, you authored the questions so you know the key.
  - "answer" = the correct answer — for mcq/true_false give the correct option's LETTER (A, B, C, …);
    for short/fill_blank the expected answer; for long a concise model answer.
  - "rubric" = one short sentence of marking guidance for open-ended (short/long) items.

EXAMPLE — Question 1 has parts (a),(b)(i),(b)(ii),(c); Question 2 has (a),(b). Correct JSON:
{"documentKind":"question_paper","fields":[
{"label":"Question 1(a)","type":"short","answer":"3.14","rubric":"Accept 3.14 or 22/7; 1 mark for correct value.","marks":2},
{"label":"Question 1(b)(i)","type":"short","answer":"x = 2","rubric":"1 mark for isolating x; 1 mark for x = 2.","marks":2},
{"label":"Question 1(b)(ii)","type":"short","answer":"y = -1","rubric":"1 mark for correct sign and value.","marks":1},
{"label":"Question 1(c)","type":"long","answer":"Explain using Newton's first law and net force.","rubric":"1 mark for identifying the law; 1 mark for applying it to the scenario; 1 mark for conclusion.","marks":3},
{"label":"Question 2(a)","type":"short","answer":"photosynthesis","rubric":"Accept either word; no credit for definitions.","marks":1},
{"label":"Question 2(b)","type":"long","answer":"Compare cell structure and function in plant and animal cells.","rubric":"1 mark per valid comparison up to 3 marks.","marks":3}
]}

EXAMPLE — a MIXED paper with sections: "Section A" is multiple-choice (Q1-Q2, five options each),
"Section B" is a data-response question (Q3 with parts (a),(b)) that refers to a chart. Correct JSON:
{"documentKind":"question_paper","fields":[
{"label":"Question 1","type":"mcq","options":["A","B","C","D","E"],"answer":"B","section":"Section A","responseType":"single letter"},
{"label":"Question 2","type":"mcq","options":["A","B","C","D","E"],"answer":"D","section":"Section A","responseType":"single letter"},
{"label":"Question 3(a)","type":"short","answer":"1450","section":"Section B","responseType":"numeric","sourceDependencies":["Figure 1"],"rubric":"1 mark for correct value read from chart."},
{"label":"Question 3(b)","type":"long","answer":"The trend increases because...","section":"Section B","responseType":"short explanation","sourceDependencies":["Figure 1"],"rubric":"1 mark for identifying trend; 1 mark for explanation linked to data."}
]}
Output the JSON object and nothing else.`

interface ParsedDmiQuestion {
  questionNumber: number
  /** The paper's real question reference (e.g. "1(a)", "3b", "12"), preserved
   *  from the source instead of the re-serialized 1..N index. Absent when the
   *  label carries no leading reference (the UI falls back to questionNumber). */
  questionLabel?: string
  questionText: string
  answer: string
  marks?: number
  rubric?: string
  questionType: DmiQuestionType
  options?: string[]
  pairs?: { left: string; right: string }[]
  /** Section heading this part falls under (ASMT-4), when the paper has sections. */
  section?: string
  /** Expected answer format, distinct from the input `questionType` (ASMT-4). */
  responseType?: string
  /** Source of the answer: 'llm_inferred' when generated by the AI, or
   *  'marking_scheme' / 'tutor_edited' when supplied otherwise. */
  answerProvenance?: string
}

interface ParsedDmiResponse {
  documentKind: 'question_paper' | 'study_material' | null
  questions: ParsedDmiQuestion[]
}

/**
 * Normalize an mcq answer key to a clean option LETTER (A, B, …) — the form the
 * student submits. Handles a bare letter ("c"), a letter-prefixed option
 * ("C) Paris", "C."), or the full option text ("Paris", matched against the
 * options). Falls back to the trimmed input when nothing matches.
 */
function normalizeMcqAnswer(answer: string, options: string[] | undefined): string {
  const t = (answer ?? '').trim()
  if (!t) return ''
  const bare = t.match(/^([A-Za-z])$/)
  if (bare) return bare[1].toUpperCase()
  const prefixed = t.match(/^([A-Za-z])\s*[).:\-]/)
  if (prefixed) return prefixed[1].toUpperCase()
  const idx = (options ?? []).findIndex(o => o.toLowerCase() === t.toLowerCase())
  if (idx >= 0) return String.fromCharCode(65 + idx)
  return t
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
      fields?: Array<{
        label?: unknown
        type?: unknown
        options?: unknown
        pairs?: unknown
        answer?: unknown
        marks?: unknown
        section?: unknown
        responseType?: unknown
        sourceDependencies?: unknown
        rubric?: unknown
      }>
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
        const marksNum = Number(f.marks)
        const section = typeof f.section === 'string' ? f.section.trim() : ''
        const responseType = typeof f.responseType === 'string' ? f.responseType.trim() : ''
        const sourceDependencies = Array.isArray(f.sourceDependencies)
          ? f.sourceDependencies.map(s => String(s).trim()).filter(Boolean)
          : undefined
        const qType = normalizeTypeToken(typeof f.type === 'string' ? f.type : undefined)
        const rawAnswer = String(f.answer ?? '').trim()
        // For mcq the student submits an option LETTER (A–E), so store the key as
        // a clean letter even if the model returned "C) Paris" or the option text.
        const answerStr = qType === 'mcq' ? normalizeMcqAnswer(rawAnswer, options) : rawAnswer
        const rubricStr = String(f.rubric ?? '').trim()
        return {
          questionNumber: i + 1,
          questionLabel: extractQuestionRef(label),
          questionText: label,
          answer: answerStr,
          marks: Number.isFinite(marksNum) && marksNum > 0 ? Math.round(marksNum) : undefined,
          rubric: rubricStr || undefined,
          questionType: qType,
          options: options && options.length > 0 ? options : undefined,
          pairs: pairs && pairs.length > 0 ? pairs : undefined,
          section: section || undefined,
          responseType: responseType || undefined,
          sourceDependencies:
            sourceDependencies && sourceDependencies.length > 0 ? sourceDependencies : undefined,
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
      // Preserve the paper's real reference: "Q1(a)" → "1(a)", "Q2" → "2".
      const ref = qMatch[2] ? `${qMatch[1]}(${qMatch[2].trim()})` : qMatch[1]
      currentQ = {
        questionNumber: parseInt(qMatch[1], 10),
        questionLabel: ref,
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
          questionLabel: m[1],
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
    // Tutor-only: this returns generated answers + rubrics for an assessment.
    if (session.user.role !== 'TUTOR' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const parsed = GenerateDmiRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const {
      type,
      title,
      content,
      pdfPages,
      questionSpec,
      documentKindOverride,
      examBody,
      subject,
    } = parsed.data

    if (!content?.trim() && (!pdfPages || pdfPages.length === 0)) {
      return NextResponse.json({ error: 'No content or PDF pages provided' }, { status: 400 })
    }

    // Code-level signals cross-check the model's classification. A STRONG paper
    // signal (mark allocations, MCQ options A–E, answer blanks, or dense numbered
    // questions + task verbs) reliably means a question paper — so we FORCE
    // extraction even if the model would waffle to study_material (e.g. an SAT /
    // exam paper whose reading passages read "prose-heavy"). The tutor's explicit
    // override still wins. Text-only, so it can't help an image-only PDF.
    const signals = content && content.trim() ? analyzeDocumentSignals(content) : null
    const { settled: effectiveKindOverride } = resolveDocumentKind(documentKindOverride, signals)

    // Study-material path. If the tutor specified question types + counts, generate
    // exactly that mix. Otherwise (option A) still AUTHOR a sensible set of questions
    // from the material — do NOT emit bare question numbers. Only a genuine printed
    // question paper is extracted number-by-number (the model classifies, and the
    // question_paper override forces extraction).
    const specInstruction =
      questionSpec && questionSpec.length > 0
        ? `\n\nThis source is study material. Generate exactly: ${questionSpec
            .map(s => `${s.count} ${DMI_QUESTION_TYPE_LABELS[s.type]} (${s.type})`)
            .join(', ')}. Use those exact types and counts.`
        : effectiveKindOverride === 'question_paper'
          ? ''
          : `\n\nIf this source is NOT a printed question paper (i.e. documentKind is study_material or uncertain), do NOT emit bare question numbers. Instead AUTHOR 5-10 NEW questions that assess the key points of this material — each with the FULL question wording as "label", a suitable "type", "marks", a model "answer", and a "rubric" — choosing a sensible mix of types for the content. ONLY when the document genuinely IS a printed question paper should you extract its existing question references instead of authoring.`

    // When the kind is settled (tutor confirmed, or strong code-level paper
    // markers), tell the model so it classifies + extracts accordingly.
    const overrideInstruction =
      effectiveKindOverride === 'question_paper'
        ? `\n\nThis document IS a question paper — treat it as one (it has the clear markers of a paper). Set documentKind to "question_paper" and extract ONE answer-input field per answerable part, labelled by its question number/reference EXACTLY as printed — do NOT author new questions or answers.`
        : effectiveKindOverride === 'study_material'
          ? `\n\nThe tutor has confirmed this document is study material (not a question paper). Set documentKind to "study_material".`
          : ''

    // Board/Subject context from the course category. A hint only — the source
    // paper still governs wording, marks, and answers; never invent policy from
    // this. Mirrors the pattern parse-marking-scheme already uses.
    const examContextInstruction =
      examBody || subject
        ? `\n\nThe tutor indicates this ${type} is ${[examBody, subject]
            .filter(Boolean)
            .join(
              ' '
            )} — follow that board's conventions where relevant, but do NOT change question wording or invent marks/answers that the source doesn't support.`
        : ''

    // Web search: try to find a readily accessible answer key / mark scheme for
    // assessments before asking the model to prepopulate answers. Search is best-
    // effort and fully optional; missing key or empty results just fall back to the
    // model's own reasoning.
    let researchBlock = ''
    if (type === 'assessment' && (title || examBody || subject)) {
      const searchQuery = buildAnswerKeySearchQuery(title ?? '', examBody, subject)
      const searchResults = await searchAnswerKey(searchQuery)
      researchBlock = formatSearchResultsForPrompt(searchResults)
    }

    let aiResponse: string

    if (pdfPages && pdfPages.length > 0) {
      // When the caller sends BOTH the extracted text and page images (a digital
      // PDF that also contains diagrams/figures), the text is authoritative for
      // wording, question count, and marks — it covers every page, whereas the
      // images are capped. The images are supplementary VISUAL context so the
      // model can read any diagram/figure the text can't carry. When only images
      // are sent (a scanned paper with no extractable text), this text item is
      // simply omitted and the model reads the pages directly, as before.
      const hasSourceText = !!content && content.trim().length > 0
      const promptItems: Array<
        { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
      > = [
        {
          type: 'text',
          text: `${researchBlock ? `${researchBlock}\n\n` : ''}Build a DMI (answer input fields) for the following ${type}${title ? ` titled "${title}"` : ''}.${specInstruction}${overrideInstruction}${examContextInstruction}`,
        },
        ...(hasSourceText
          ? [
              {
                type: 'text' as const,
                text: `Authoritative extracted text of the ${type} (use this for exact question wording, the number of questions, and marks — it covers every page). The images that follow show diagrams/figures referenced in this text; read them to understand any figure a question depends on, but do NOT invent questions the text does not contain:\n\n${content}`,
              },
            ]
          : []),
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
      const prompt = `${researchBlock ? `${researchBlock}\n\n` : ''}Build a DMI (answer input fields) for the following ${type}${title ? ` titled "${title}"` : ''}:${specInstruction}${overrideInstruction}${examContextInstruction}\n\n${content}`
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
    const parsedResult = parseDmiJson(aiResponse) ?? parseDmiResponse(stripCodeFences(aiResponse))
    const { documentKind: modelKind, questions } = parsedResult

    // Tag AI-generated answers so the builder can distinguish them from tutor-edited
    // or uploaded-marking-scheme answers.
    const questionsWithProvenance = questions.map(q => ({
      ...q,
      answerProvenance: q.answer ? (q.answerProvenance ?? 'llm_inferred') : q.answerProvenance,
    }))

    // A settled kind (tutor override, or a strong code-level paper signal) wins;
    // otherwise use the model's classification.
    const { documentKind } = resolveDocumentKind(documentKindOverride, signals, modelKind)

    // When the kind isn't already settled, flag a LIKELY misclassification so the
    // tutor confirms rather than silently defaulting an ambiguous document. A
    // strong paper signal already forced question_paper above, so it's excluded.
    const needsKindConfirmation =
      !questionSpec && !effectiveKindOverride && documentKindLooksWrong(modelKind, signals)

    // Warn-only assessment guardrails. Checks wording fidelity against the
    // source (ASMT-4) and other structural rules where data is available.
    // Non-blocking — surfaced as `guardrailWarnings` and logged server-side.
    // ASMT-2: score how reliably the document was parsed (question papers only;
    // study material is tutor-defined). Feeds the Low→pause guardrail and is
    // surfaced to the tutor.
    const confidence =
      type === 'assessment' && documentKind === 'question_paper'
        ? scoreDocumentConfidence(questionsWithProvenance, content)
        : null

    let guardrailWarnings: GuardrailViolation[] = []
    if (type === 'assessment') {
      guardrailWarnings = runAssessmentGuardrails(
        { title, questions: questionsWithProvenance.map(q => ({ questionText: q.questionText })) },
        { sourceContent: content, confidence: confidence?.level }
      ).violations

      // CURRIC-1/2: warn if the document's exam board or subject doesn't match
      // the course (e.g. an A-Level past paper in an AP course). Layer 1 is a
      // deterministic marker scan; layer 2 is a best-effort AI subject check that
      // only runs when a board/subject hint is present, and never blocks.
      if (content && (examBody || subject)) {
        const classification = await classifyDocumentCurriculum(content)
        const curriculumWarnings = checkCurriculumMatch({
          extractedText: content,
          expectedBoard: examBody,
          expectedSubject: subject,
          aiBoard: classification?.board,
          aiSubject: classification?.subject,
          aiConfidence: classification?.confidence,
        })
        guardrailWarnings = [...guardrailWarnings, ...curriculumWarnings]
      }

      if (guardrailWarnings.length > 0) {
        console.warn(
          `[guardrails] generate-dmi assessment violations (${guardrailWarnings.length}):`,
          guardrailWarnings.map(v => `${v.ruleId} ${v.severity}`).join(', ')
        )
      }
    }

    return NextResponse.json({
      response: aiResponse,
      // The resolved kind (tutor override, else the model's classification; null
      // when the model was uncertain). The UI no longer assumes "question paper"
      // for null — see needsKindConfirmation.
      documentKind,
      // True when we can't be confident of the kind (model uncertain, or its call
      // conflicts with the text signals). The builder should ask the tutor to
      // confirm "question paper vs study material" before proceeding, instead of
      // silently treating an ambiguous document as a question paper.
      needsKindConfirmation,
      // The code-level paper-signal strength, for an optional "we think this is …"
      // note on the confirm prompt.
      documentSignal: signals?.paperSignal ?? null,
      // True when the source is study material and the tutor hasn't yet chosen
      // the question types/counts — the builder should prompt before deploying.
      needsQuestionSpec: documentKind === 'study_material' && !questionSpec,
      questions: questionsWithProvenance,
      guardrailWarnings,
      // ASMT-2 document confidence (null for study material). Low → the builder
      // warns the tutor to verify before proceeding.
      confidence,
    })
  } catch (error) {
    console.error('Generate DMI error:', error)
    return handleApiError(error, 'Failed to generate DMI questions', 'api/ai/generate-dmi/route.ts')
  }
}
