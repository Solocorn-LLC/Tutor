/**
 * Curriculum / exam-board mismatch guardrail (warn-only).
 *
 * Catches the case where a tutor attaches a document whose exam board or subject
 * doesn't match the course — e.g. an A-Level past paper uploaded to an "AP
 * Statistics" course. Two layers, both non-blocking:
 *
 *  1. Deterministic board-marker scan (this file, `detectExamBoards`). Past
 *     papers are self-labeling ("Cambridge International", "Edexcel", "College
 *     Board", syllabus codes …). Cheap, high-precision, no AI. Catches the exact
 *     wrong-board case.
 *  2. AI subject relevance (fed in via `aiBoard`/`aiSubject`, classified
 *     separately in src/lib/assessment/curriculum-classify.ts). Catches a
 *     wrong-subject-entirely upload that shares the course's region/board.
 *
 * Never blocks — returns `GuardrailViolation[]` surfaced as `guardrailWarnings`.
 * The tutor decides; cross-curriculum use (an A-Level paper as extra AP practice)
 * stays possible on purpose.
 */

import type { GuardrailViolation } from './validate'

/** Board families this guardrail can reason about (the detectable ones). */
export type ExamBoardFamily = 'AP' | 'A Level' | 'IGCSE' | 'IB'

const DETECTABLE: readonly ExamBoardFamily[] = ['AP', 'A Level', 'IGCSE', 'IB']

/**
 * High-precision text markers → the board family/families they imply.
 *
 * Some markers are shared: Cambridge/Edexcel/AQA run BOTH A-Level and IGCSE, so
 * those map to both families and only conflict with a non-UK board (AP/IB).
 * Level-specific markers (GCE A Level, "IGCSE", Cambridge syllabus codes — 9xxx
 * for A/AS, 0xxx for IGCSE) pin a single family.
 */
interface BoardMarker {
  re: RegExp
  families: ExamBoardFamily[]
  label: string
}

const BOARD_MARKERS: BoardMarker[] = [
  // AP (US / College Board)
  { re: /\badvanced placement\b/i, families: ['AP'], label: 'Advanced Placement' },
  { re: /\bcollege board\b/i, families: ['AP'], label: 'College Board' },
  // IB
  {
    re: /\binternational baccalaureate\b/i,
    families: ['IB'],
    label: 'International Baccalaureate',
  },
  { re: /\bdiploma programme\b/i, families: ['IB'], label: 'IB Diploma Programme' },
  // UK boards — run both A Level and IGCSE
  {
    re: /\bcambridge\s+(?:assessment\s+)?international\b/i,
    families: ['A Level', 'IGCSE'],
    label: 'Cambridge International',
  },
  {
    re: /\buniversity\s+of\s+cambridge\s+international\s+examinations\b/i,
    families: ['A Level', 'IGCSE'],
    label: 'Cambridge International Examinations',
  },
  { re: /\bCAIE\b/, families: ['A Level', 'IGCSE'], label: 'CAIE' },
  { re: /\b(?:pearson\s+)?edexcel\b/i, families: ['A Level', 'IGCSE'], label: 'Edexcel' },
  { re: /\bAQA\b/, families: ['A Level', 'IGCSE'], label: 'AQA' },
  { re: /\bWJEC\b/, families: ['A Level', 'IGCSE'], label: 'WJEC' },
  // A-Level specific
  {
    re: /\bGCE\b[^.\n]{0,20}\b(?:Advanced|AS)\b/i,
    families: ['A Level'],
    label: 'GCE Advanced Level',
  },
  { re: /\bAS\s*(?:and|\/|&)\s*A\s*Level\b/i, families: ['A Level'], label: 'AS & A Level' },
  { re: /\b9\d{3}\/\d{2}\b/, families: ['A Level'], label: 'Cambridge A-Level syllabus code' },
  // IGCSE specific
  { re: /\bIGCSE\b/i, families: ['IGCSE'], label: 'IGCSE' },
  {
    re: /\binternational\s+general\s+certificate\s+of\s+secondary\s+education\b/i,
    families: ['IGCSE'],
    label: 'IGCSE',
  },
  { re: /\b0\d{3}\/\d{2}\b/, families: ['IGCSE'], label: 'Cambridge IGCSE syllabus code' },
]

export interface DetectedBoard {
  /** The distinct marker labels that matched (e.g. ["Edexcel", "GCE Advanced Level"]). */
  markers: string[]
  /** Union of board families implied by the matched markers. */
  families: ExamBoardFamily[]
}

/**
 * Scan document text for exam-board markers. Returns the matched marker labels
 * and the union of implied board families (empty when nothing distinctive is
 * found — the common, no-signal case).
 */
export function detectExamBoards(text: string | null | undefined): DetectedBoard {
  const markers: string[] = []
  const families = new Set<ExamBoardFamily>()
  if (!text) return { markers, families: [] }
  for (const m of BOARD_MARKERS) {
    if (m.re.test(text)) {
      if (!markers.includes(m.label)) markers.push(m.label)
      m.families.forEach(f => families.add(f))
    }
  }
  return { markers, families: [...families] }
}

/** Normalize a board string from the course/AI to a canonical family, if it is one. */
export function normalizeBoard(board: string | null | undefined): ExamBoardFamily | null {
  if (!board) return null
  const b = board.trim().toLowerCase()
  if (/\bap\b|advanced placement|college board/.test(b)) return 'AP'
  if (/\bib\b|baccalaureate|diploma programme/.test(b)) return 'IB'
  if (/igcse/.test(b)) return 'IGCSE'
  if (/\ba[-\s]?level|gce|as[-\s]?level/.test(b)) return 'A Level'
  return null
}

/** Words to strip before comparing subjects, so "AP Statistics" ≈ "Statistics". */
const SUBJECT_STOPWORDS = new Set([
  'ap',
  'ib',
  'igcse',
  'gcse',
  'a',
  'as',
  'level',
  'gce',
  'hl',
  'sl',
  'higher',
  'standard',
  'ordinary',
  'advanced',
  'placement',
  'paper',
  'past',
  'exam',
  'examination',
  'international',
  'course',
  'the',
  'and',
  'of',
  'in',
])

/** Content-bearing subject tokens (board words / filler removed). */
function subjectTokens(subject: string | null | undefined): Set<string> {
  const out = new Set<string>()
  if (!subject) return out
  for (const tok of subject.toLowerCase().split(/[^a-z]+/)) {
    if (tok.length > 1 && !SUBJECT_STOPWORDS.has(tok)) out.add(tok)
  }
  return out
}

/**
 * Subject families — related fields that should NOT be flagged as a mismatch.
 * Statistics is part of Mathematics, so "AP Statistics" vs a "Mathematics" paper
 * is not a wrong-subject upload. Kept intentionally tight: only genuine
 * parent/child/synonym relationships, so distinct subjects (Biology vs
 * Chemistry, Spanish vs French) still warn.
 */
const SUBJECT_FAMILY_GROUPS: string[][] = [
  [
    'mathematics',
    'math',
    'maths',
    'statistics',
    'stats',
    'statistical',
    'calculus',
    'algebra',
    'geometry',
    'trigonometry',
    'mechanics',
    'probability',
  ],
  ['english', 'literature', 'composition', 'rhetoric'],
  ['computer', 'computing', 'programming', 'informatics'],
]

const TOKEN_TO_FAMILY = new Map<string, string>()
SUBJECT_FAMILY_GROUPS.forEach((group, i) =>
  group.forEach(tok => TOKEN_TO_FAMILY.set(tok, `fam${i}`))
)

/** The subject families spanned by a token set (empty when none are known). */
function subjectFamilies(tokens: Set<string>): Set<string> {
  const fams = new Set<string>()
  for (const tok of tokens) {
    const fam = TOKEN_TO_FAMILY.get(tok)
    if (fam) fams.add(fam)
  }
  return fams
}

/**
 * Whether two subjects are related — a shared content token OR a shared subject
 * family (so Statistics ≈ Mathematics). Related subjects are not a mismatch.
 */
function subjectsRelated(want: Set<string>, got: Set<string>): boolean {
  if ([...got].some(t => want.has(t))) return true
  const wantFams = subjectFamilies(want)
  if (wantFams.size === 0) return false
  return [...subjectFamilies(got)].some(f => wantFams.has(f))
}

export interface CurriculumCheckInput {
  /** Extracted document text (drives the deterministic board scan). */
  extractedText?: string | null
  /** Course's expected board, from the course category (examBody / getCategoryBoard). */
  expectedBoard?: string | null
  /** Course's expected subject (the category/subject, e.g. "AP Statistics"). */
  expectedSubject?: string | null
  /** AI-classified board for the document (layer 2), if available. */
  aiBoard?: string | null
  /** AI-classified subject for the document (layer 2), if available. */
  aiSubject?: string | null
  /** AI classification confidence — only 'high' triggers a subject warning. */
  aiConfidence?: 'high' | 'medium' | 'low' | null
}

const RULE_BOARD = 'CURRIC-1'
const RULE_SUBJECT = 'CURRIC-2'

/**
 * Warn-only curriculum/subject mismatch check.
 *
 *  - CURRIC-1 (deterministic): the document carries markers of a board the course
 *    is not. High precision — only fires when the expected board is a detectable
 *    one and appears in NONE of the matched markers' families.
 *  - CURRIC-2 (AI, high-confidence only): the document's subject is disjoint from
 *    the course subject (a wrong-subject upload the board scan can't catch).
 */
export function checkCurriculumMatch(input: CurriculumCheckInput): GuardrailViolation[] {
  const violations: GuardrailViolation[] = []
  const expectedFamily = normalizeBoard(input.expectedBoard)

  // ── Layer 1: deterministic board markers ──────────────────────────────────
  if (expectedFamily && DETECTABLE.includes(expectedFamily)) {
    const detected = detectExamBoards(input.extractedText)
    if (detected.families.length > 0 && !detected.families.includes(expectedFamily)) {
      const detectedList = detected.families.join(' / ')
      const markerList = detected.markers.slice(0, 3).join(', ')
      violations.push({
        ruleId: RULE_BOARD,
        severity: 'warning',
        message:
          `This document carries ${detectedList} markers (found: ${markerList}), but the course ` +
          `is ${expectedFamily}. Verify it belongs in this course before deploying — attach ` +
          `anyway if this cross-curriculum material is intentional.`,
      })
    }
  }

  // ── Layer 2: AI subject relevance (high confidence only) ───────────────────
  if (input.aiConfidence === 'high') {
    const want = subjectTokens(input.expectedSubject)
    const got = subjectTokens(input.aiSubject)
    if (want.size > 0 && got.size > 0) {
      // Related subjects (shared token or subject family, e.g. Statistics ⊂
      // Mathematics) are not a mismatch — only warn when they're truly disjoint.
      if (!subjectsRelated(want, got)) {
        violations.push({
          ruleId: RULE_SUBJECT,
          severity: 'warning',
          message:
            `This document appears to be about ${input.aiSubject}, but the course subject is ` +
            `${input.expectedSubject}. Confirm the document matches the course topic.`,
        })
      }
    }
  }

  return violations
}
