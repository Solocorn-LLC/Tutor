/**
 * Lightweight, code-level signals for "is this a question paper?" — a cheap
 * cross-check on the AI's documentKind classification (ASMT). It does NOT decide
 * the kind on its own; it only measures how strongly the raw text *looks like* a
 * question paper, so the route can flag a likely misclassification and ask the
 * tutor instead of silently defaulting to "question paper".
 *
 * Pure + text-only (works on extracted PDF text; skipped when no text is
 * available, e.g. image-only PDFs).
 */

export interface DocumentSignals {
  /** Printed mark allocations, e.g. "[5]" or "(3 marks)". */
  markAllocations: number
  /** Lines that begin like a numbered question or sub-part (1., (a), (ii)). */
  questionLines: number
  /** Lines that begin like a lettered multiple-choice option (A., b)). */
  mcqOptionLines: number
  /** Blank answer spaces / "Answer:" prompts. */
  answerBlanks: number
  /** Imperative task verbs at a line/sentence start (calculate, explain, …). */
  imperativeCues: number
  /** Characters sitting in paragraph-like (long) lines — a rough prose measure. */
  proseChars: number
  /**
   * Strength of QUESTION-PAPER signals:
   *  - 'strong': hard structural markers of a paper (marks, MCQ options, answer
   *    blanks, or dense numbered questions + task verbs);
   *  - 'none': essentially no paper markers (looks like plain material);
   *  - 'weak': some structure but nothing decisive.
   */
  paperSignal: 'strong' | 'weak' | 'none'
}

const MARK_ALLOCATION_RE = /\[\s*\d{1,3}\s*\]|\(\s*\d{1,3}\s*marks?\s*\)/gi
const QUESTION_LINE_RE = /^\s*(?:Q(?:uestion)?\s*)?\d{1,3}\s*[.)]\s+\S/
const SUBPART_LINE_RE = /^\s*\(?(?:[a-z]|i{1,3}|iv|v|vi{0,3}|ix|x)\)\s+\S/i
const MCQ_OPTION_LINE_RE = /^\s*[A-Ea-e]\s*[.)]\s+\S/
const ANSWER_BLANK_RE = /_{3,}|\bAnswers?\s*[:.]/gi
const IMPERATIVE_RE =
  /(?:^|[.\n])\s*(?:calculate|determine|find|compute|show|prove|explain|justify|describe|state|estimate|sketch|construct|interpret|evaluate|solve|define|outline|discuss|identify|label|complete|derive|list)\b/gi

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re)
  return m ? m.length : 0
}

/**
 * Given the AI's `documentKind` and the code-level signals, does the claim look
 * wrong enough to double-check with the tutor before generating a DMI? Catches
 * the two failure modes:
 *  - a prose document with numbered HEADINGS (e.g. study notes "1. …, 2. …")
 *    mislabelled "question paper" — it has numbered lines but NONE of the hard
 *    paper markers (marks, MCQ options, answer blanks) and reads like prose;
 *  - a marker-rich paper mislabelled "study material".
 * When signals are unavailable (image-only PDF), only an unclassified doc is
 * flagged. Returns true → the route asks the tutor to confirm the kind.
 */
export function documentKindLooksWrong(
  modelKind: 'question_paper' | 'study_material' | null,
  signals: DocumentSignals | null
): boolean {
  if (modelKind === null) return true
  if (!signals) return false
  if (modelKind === 'question_paper') {
    const noHardPaperMarkers =
      signals.markAllocations === 0 && signals.answerBlanks === 0 && signals.mcqOptionLines < 2
    // No hard markers AND reads like prose → probably material, not a paper.
    return noHardPaperMarkers && signals.proseChars > 400
  }
  // study_material but strong paper markers → probably a paper.
  return signals.paperSignal === 'strong'
}

export function analyzeDocumentSignals(content: string): DocumentSignals {
  const text = content ?? ''
  const lines = text.split('\n')

  let questionLines = 0
  let mcqOptionLines = 0
  let proseChars = 0
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (QUESTION_LINE_RE.test(line) || SUBPART_LINE_RE.test(line)) questionLines++
    if (MCQ_OPTION_LINE_RE.test(line)) mcqOptionLines++
    // Paragraph-like lines (long, unstructured) are the hallmark of prose.
    if (line.length > 120) proseChars += line.length
  }

  const markAllocations = countMatches(text, MARK_ALLOCATION_RE)
  const answerBlanks = countMatches(text, ANSWER_BLANK_RE)
  const imperativeCues = countMatches(text, IMPERATIVE_RE)

  // Hard markers of a real question paper.
  const strong =
    markAllocations >= 2 ||
    mcqOptionLines >= 4 ||
    answerBlanks >= 2 ||
    (questionLines >= 4 && imperativeCues >= 2)

  // Essentially nothing that says "answer these questions".
  const none =
    markAllocations === 0 && answerBlanks === 0 && mcqOptionLines < 2 && questionLines < 2

  const paperSignal: DocumentSignals['paperSignal'] = strong ? 'strong' : none ? 'none' : 'weak'

  return {
    markAllocations,
    questionLines,
    mcqOptionLines,
    answerBlanks,
    imperativeCues,
    proseChars,
    paperSignal,
  }
}
