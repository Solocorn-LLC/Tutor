/**
 * Pure helpers for the DMI / marking-scheme flow — question-reference parsing,
 * reference matching, and examining-body derivation. Extracted here so they have
 * ONE definition (used by generate-dmi, parse-marking-scheme, and the course
 * builder) and so the matching logic, which is subtle, is unit-tested in
 * isolation rather than buried in an 11k-line component.
 */

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
