/**
 * Document Confidence Scoring (Assessment guardrail ASMT-2).
 *
 * Before trusting a parsed assessment, score how reliably the document was
 * read, so the tutor is warned when structure is missing (Low → pause and ask
 * for clarification; Medium → proceed but flag). Computed deterministically
 * from the parsed questions + source text — no extra LLM call.
 *
 * Only meaningful for an extracted question PAPER; for tutor-authored study
 * material the tutor defines the structure, so confidence isn't scored.
 */

export type ConfidenceLevel = 'High' | 'Medium' | 'Low'

export interface ConfidenceItem {
  questionText?: string | null
  questionLabel?: string | null
  marks?: number | null
}

export interface ConfidenceResult {
  level: ConfidenceLevel
  /** Short tutor-facing reasons for a non-High score. */
  reasons: string[]
  signals: {
    questionCount: number
    withReference: number
    withMarks: number
    numberingGaps: number
  }
}

/** Score parsing confidence for an extracted question paper. */
export function scoreDocumentConfidence(
  items: ConfidenceItem[],
  sourceContent?: string | null
): ConfidenceResult {
  const questionCount = items.length

  // Nothing parsed → Low (the parse effectively failed).
  if (questionCount === 0) {
    return {
      level: 'Low',
      reasons: ['No questions could be parsed from the document.'],
      signals: { questionCount: 0, withReference: 0, withMarks: 0, numberingGaps: 0 },
    }
  }

  const withReference = items.filter(i => !!(i.questionLabel && i.questionLabel.trim())).length
  const withMarks = items.filter(i => typeof i.marks === 'number' && (i.marks as number) > 0).length

  // Numbering gaps: missing integers within the observed reference range
  // (a strong signal of missing/truncated pages).
  const nums = items
    .map(i => {
      const m = (i.questionLabel || '').match(/\d+/)
      return m ? parseInt(m[0], 10) : null
    })
    .filter((n): n is number => n != null)
  let numberingGaps = 0
  if (nums.length > 1) {
    const uniq = [...new Set(nums)].sort((a, b) => a - b)
    const span = uniq[uniq.length - 1] - uniq[0] + 1
    numberingGaps = Math.max(0, span - uniq.length)
  }

  const refRatio = withReference / questionCount
  const markRatio = withMarks / questionCount

  const reasons: string[] = []
  if (refRatio < 0.8) reasons.push('Many questions have no recognizable reference/number.')
  if (markRatio < 0.8) reasons.push('Mark allocations are missing on many questions.')
  if (numberingGaps > 0) {
    reasons.push(`Question numbering has ${numberingGaps} gap(s) — pages may be missing.`)
  }
  if (sourceContent != null && sourceContent.trim().length < 40) {
    reasons.push('The document text is very short or may not have been read.')
  }

  let level: ConfidenceLevel = 'High'
  if (refRatio < 0.4 || markRatio < 0.4 || numberingGaps >= 2) level = 'Low'
  else if (reasons.length > 0) level = 'Medium'

  return { level, reasons, signals: { questionCount, withReference, withMarks, numberingGaps } }
}
