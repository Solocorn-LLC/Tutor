/**
 * Pure helpers for the DMI / marking-scheme flow — question-reference parsing,
 * reference matching, and examining-body derivation. Extracted here so they have
 * ONE definition (used by generate-dmi, parse-marking-scheme, and the course
 * builder) and so the matching logic, which is subtle, is unit-tested in
 * isolation rather than buried in an 11k-line component.
 */

import type { DMIQuestion } from '@/app/[locale]/tutor/dashboard/components/builder-types'
import type { DmiQuestionType } from '@/lib/assessment/question-types'

/** Examining bodies the marking-scheme badge can show / a tutor can pick from.
 *  "Other" labels a board we don't list yet. Order matters for derivation:
 *  more specific labels (IGCSE before GCSE) come first. */
export const EXAM_BOARDS = [
  'AP',
  'IB',
  'A-Level',
  'AS-Level',
  'IGCSE',
  'GCSE',
  'SAT',
  'ACT',
  'Cambridge',
  'Edexcel',
  'AQA',
  'OCR',
  'WJEC',
  'Other',
] as const

/** Cap on how many brand-new questions one marking scheme can introduce, so a
 *  noisy parse can't flood the DMI. */
export const MAX_EXTRA_QUESTIONS = 60

/** Normalize a question reference so "1(a)", "1a" and "1 (a)" all compare equal. */
export function refKey(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Pull the paper's real question reference (e.g. "1(a)", "3b", "12") out of a
 * label like "Question 1(a)" / "Q3b" / "1." so the DMI keeps the source's own
 * numbering instead of a re-serialized 1..N index. Returns undefined when there
 * is no leading reference (the caller then falls back to the positional number).
 */
export function extractQuestionRef(label: string): string | undefined {
  const m = String(label || '')
    .trim()
    .match(/^(?:Q(?:uestion)?\s*\.?\s*)?(\d+\s*(?:\([a-z0-9ivx]+\)|[a-z](?![a-z]))*)/i)
  if (!m) return undefined
  const ref = m[1].replace(/\s+/g, '')
  return ref || undefined
}

/**
 * A model-supplied extra reference must look like a real question reference
 * (leading digit, short) — guards against the model emitting prose/noise as a
 * "question".
 */
export function isPlausibleRef(s: string): boolean {
  return /^\d/.test(s) && s.length <= 12
}

/**
 * Map a course category label (e.g. "AP Calculus AB", "IB (International
 * Baccalaureate)", "Cambridge AS Mathematics") to a best-effort { examBody,
 * subject }. Used as the badge's default before a per-paper detector exists; the
 * tutor can always override.
 */
export function deriveExamContext(
  category?: string | null,
  fallbackSubject?: string | null
): { examBody?: string; subject?: string } {
  const raw = String(category ?? '').trim()
  // Ordered patterns: longest / most specific first.
  const patterns: Array<[RegExp, string]> = [
    [/international baccalaureate|\bIB\b/i, 'IB'],
    [/advanced placement|\bAP\b/i, 'AP'],
    [/\bIGCSE\b/i, 'IGCSE'],
    [/\bGCSE\b/i, 'GCSE'],
    [/\bAS[\s-]?Level/i, 'AS-Level'],
    [/\bA[\s-]?Level/i, 'A-Level'],
    [/cambridge/i, 'Cambridge'],
    [/edexcel/i, 'Edexcel'],
    [/\bAQA\b/i, 'AQA'],
    [/\bOCR\b/i, 'OCR'],
    [/\bWJEC\b/i, 'WJEC'],
    [/\bSAT\b/i, 'SAT'],
    [/\bACT\b/i, 'ACT'],
  ]
  let examBody: string | undefined
  for (const [re, board] of patterns) {
    if (re.test(raw)) {
      examBody = board
      break
    }
  }
  // Subject = the category with the board name + parenthetical removed.
  let subject = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/advanced placement|international baccalaureate/i, ' ')
    .replace(
      /\b(AP|IB|IGCSE|GCSE|AS[\s-]?Level|A[\s-]?Level|Cambridge|Edexcel|AQA|OCR|WJEC|SAT|ACT)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()
  if (!subject) subject = String(fallbackSubject ?? '').trim()
  return { examBody, subject: subject || undefined }
}

/** A single answer the marking-scheme parser returned for a question reference. */
export interface SchemeMatchInput {
  ref: string
  answer: string
  variants?: string[]
  marks?: number
  rubric?: string
  /** True when the scheme covers a reference the DMI doesn't have yet. */
  extra?: boolean
}

export interface AppliedScheme {
  /** Existing items patched with their answers, then the new rows appended. */
  patchedItems: DMIQuestion[]
  /** Brand-new rows for references the DMI was missing (sorted, deduped). */
  newRows: DMIQuestion[]
  /** How many EXISTING rows actually changed (so a toast can't over-report). */
  filled: number
  /** Apply the same patches+appends to another array (e.g. a saved version). */
  applyToVersionItems: (vsItems: DMIQuestion[]) => DMIQuestion[]
}

/**
 * Pure core of the marking-scheme apply: given the DMI's current questions and the
 * parser's matches, split into patches for existing rows (keyed by normalized
 * reference) and brand-new rows for references the DMI lacks, and report how many
 * existing rows changed. No React, no I/O — unit-tested in isolation.
 *
 * `makeId` is injected so callers control id generation (and tests stay
 * deterministic); it defaults to a time+random id.
 */
export function applySchemeMatches(
  items: DMIQuestion[],
  matches: SchemeMatchInput[],
  makeId: () => string = () => `dmi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
): AppliedScheme {
  const buildPatch = (m: SchemeMatchInput): Partial<DMIQuestion> => ({
    answer: m.answer,
    answerProvenance: 'answer_sheet_extracted',
    ...(Array.isArray(m.variants) && m.variants.length > 0
      ? { acceptableVariants: m.variants }
      : {}),
    ...(typeof m.marks === 'number' && m.marks > 0 ? { marks: m.marks } : {}),
    ...(m.rubric ? { rubric: m.rubric } : {}),
  })

  const validRefs = new Set(items.map(it => refKey(it.questionLabel ?? it.questionNumber)))
  const patchByRef = new Map<string, Partial<DMIQuestion>>()
  for (const m of matches) {
    if (m.extra) continue
    const key = refKey(m.ref)
    if (!key || !validRefs.has(key)) continue
    patchByRef.set(key, buildPatch(m))
  }

  const seenExtra = new Set<string>()
  const newRows: DMIQuestion[] = matches
    .filter(m => m.extra && !validRefs.has(refKey(m.ref)) && m.ref)
    .filter(m => {
      const k = refKey(m.ref)
      if (seenExtra.has(k)) return false
      seenExtra.add(k)
      return true
    })
    .sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }))
    .map(
      (m): DMIQuestion => ({
        id: makeId(),
        questionNumber: 0,
        questionLabel: m.ref,
        questionText: `Question ${m.ref}`,
        questionType: 'short' as DmiQuestionType,
        ...buildPatch(m),
        answer: m.answer,
      })
    )

  const patchOnto = (arr: DMIQuestion[]) =>
    arr.map(q => {
      const patch = patchByRef.get(refKey(q.questionLabel ?? q.questionNumber))
      if (!patch) return q
      // ASMT-5: a tutor-authored answer takes precedence over an uploaded
      // scheme. Preserve the tutor's answer / acceptableVariants / provenance;
      // still let the scheme contribute non-answer fields (marks, rubric).
      if (q.answerProvenance === 'tutor_provided' || q.answerProvenance === 'tutor_edited') {
        const { answer: _a, acceptableVariants: _v, answerProvenance: _p, ...rest } = patch
        return Object.keys(rest).length > 0 ? { ...q, ...rest } : q
      }
      return { ...q, ...patch }
    })

  const patchedExisting = patchOnto(items)
  const filled = patchedExisting.reduce((n, q, i) => (q === items[i] ? n : n + 1), 0)

  return {
    patchedItems: [...patchedExisting, ...newRows],
    newRows,
    filled,
    applyToVersionItems: (vsItems: DMIQuestion[]) => [...patchOnto(vsItems), ...newRows],
  }
}
