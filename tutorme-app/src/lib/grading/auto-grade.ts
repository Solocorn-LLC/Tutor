/**
 * Lightweight deterministic auto-grading for DMI answers.
 *
 * Grades a student's answers (keyed by DMI item id) against the tutor's answer
 * key (the `answer` on each DMI item, stored server-side in BuilderTaskDmi.items
 * and never sent to students). Intentionally CONSERVATIVE — it credits an item
 * only on a normalized exact match or when the student's answer contains the
 * full expected answer as a word sequence. It's a coarse, live signal, not a
 * replacement for grading.
 *
 * Open-ended items (those whose answer key is a long, sentence-style answer) can
 * be CORRECT by paraphrase, which exact-matching can't detect. So a non-matching
 * answer to a long-key item is NOT counted wrong — it's EXCLUDED from the live
 * score and FLAGGED (`needsReview`) for the tutor to grade. Short factual keys
 * (≤ SHORT_ANSWER_MAX_WORDS) are still graded both ways: a non-match counts as
 * wrong. A reproduced key is always credited, regardless of length.
 *
 * `questionResults` uses the same array shape (QuestionResultItem) the REST quiz
 * /assignment submit path writes, so every tutor/student view that reads a
 * submission's results renders consistently. The expected answer is deliberately
 * NOT included — questionResults is readable by the student, so it must never
 * carry the answer key. Needs-review items carry `needsReview: true` and
 * `pointsMax: 0` so any sum(earned)/sum(max) recompute also excludes them.
 */

export interface DmiAnswerItem {
  id: string
  answer?: string
  /** Other accepted answer forms (from the marking scheme) that also earn full
   *  credit — matched in addition to `answer`. Never sent to students. */
  acceptableVariants?: string[]
  questionText?: string
  /** Points this question is worth. Defaults to DEFAULT_MARKS when absent. */
  marks?: number
}

/** Structurally compatible with QuestionResultItem (components/quiz/quiz-modal). */
export interface AutoGradeQuestionResult {
  questionId: string
  correct: boolean
  pointsEarned: number
  pointsMax: number
  selectedAnswer?: string
  /** True when the item couldn't be auto-graded and a tutor should review it. */
  needsReview?: boolean
}

export interface AutoGradeResult {
  /** 0–100 over the auto-gradable subset, or null when nothing was gradable. */
  score: number | null
  questionResults: AutoGradeQuestionResult[] | null
  /** Items with an answer key (the candidates for grading). */
  gradable: number
  correct: number
  /** Items excluded from the score and flagged for tutor review. */
  needsReview: number
  /** Sum of `marks` over the counted (auto-graded) items — the weighted max the
   *  caller should persist as `maxScore`. 0 when nothing was counted. */
  pointsPossible: number
  /** Sum of `marks` earned over the counted items. */
  pointsEarned: number
}

/** Points an item is worth when it carries no explicit `marks`. */
const DEFAULT_MARKS = 1
/** Answer keys with at most this many words are treated as objectively gradable. */
const SHORT_ANSWER_MAX_WORDS = 4

function itemMarks(item: DmiAnswerItem): number {
  const m = Number(item.marks)
  return Number.isFinite(m) && m > 0 ? m : DEFAULT_MARKS
}

/**
 * Try to parse a table answer value into a 2-D string array. Returns null when
 * the value is not a valid table matrix.
 */
function parseTableMatrix(raw: string): string[][] | null {
  try {
    const parsed = JSON.parse(raw)
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(
        (row: unknown) =>
          Array.isArray(row) &&
          row.length > 0 &&
          row.every((cell: unknown) => typeof cell === 'string')
      )
    ) {
      return parsed as string[][]
    }
  } catch {
    // not a table
  }
  return null
}

/**
 * Grade a table answer by comparing each submitted cell to the answer key.
 * Returns the fraction of cells matched (0–1).
 */
function gradeTable(expectedRaw: string, givenRaw: string): number {
  const expected = parseTableMatrix(expectedRaw)
  const given = parseTableMatrix(givenRaw)
  if (!expected) return 0
  if (!given) return 0
  let total = 0
  let correct = 0
  for (let r = 0; r < expected.length; r++) {
    const expectedRow = expected[r]
    const givenRow = given[r]
    if (!givenRow || givenRow.length !== expectedRow.length) {
      total += expectedRow.length
      continue
    }
    for (let c = 0; c < expectedRow.length; c++) {
      total++
      if (normalize(expectedRow[c]) === normalize(givenRow[c])) correct++
    }
  }
  return total > 0 ? correct / total : 0
}

function normalize(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function wordCount(s: string): number {
  return s ? s.split(' ').filter(Boolean).length : 0
}

/**
 * Extract the typed text from an answer value, and flag whether the answer
 * contains non-text content (drawing, converted handwriting, or pasted attachments)
 * that should be sent to a tutor for review.
 */
function extractAnswerText(raw: string): { text: string; hasRichContent: boolean } {
  if (!raw) return { text: '', hasRichContent: false }
  if (raw.startsWith('data:image')) return { text: '', hasRichContent: true }
  if (!raw.startsWith('{')) return { text: raw, hasRichContent: false }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const text = typeof parsed.text === 'string' ? parsed.text : ''
      const hasDrawing =
        typeof parsed.drawing === 'string' && parsed.drawing.startsWith('data:image')
      const hasConverted = typeof parsed.converted === 'string' && parsed.converted.length > 0
      const hasAttachments = Array.isArray(parsed.attachments) && parsed.attachments.length > 0
      return { text, hasRichContent: hasDrawing || hasConverted || hasAttachments }
    }
  } catch {
    // not JSON — fall through to plain text
  }
  return { text: raw, hasRichContent: false }
}

export function autoGradeDmi(
  items: DmiAnswerItem[] | null | undefined,
  answers: Record<string, string> | null | undefined
): AutoGradeResult {
  const list = Array.isArray(items) ? items : []
  const given = answers || {}
  const gradable = list.filter(i => i && typeof i.answer === 'string' && i.answer.trim().length > 0)
  if (gradable.length === 0) {
    return {
      score: null,
      questionResults: null,
      gradable: 0,
      correct: 0,
      needsReview: 0,
      pointsPossible: 0,
      pointsEarned: 0,
    }
  }

  let correct = 0
  let needsReview = 0
  let pointsEarned = 0 // weighted sum of marks earned over counted items
  let pointsPossible = 0 // weighted sum of marks available over counted items
  const questionResults: AutoGradeQuestionResult[] = []
  for (const item of gradable) {
    const rawGiven = given[item.id] ?? ''
    const tableScore = parseTableMatrix(String(item.answer))
      ? gradeTable(String(item.answer), String(rawGiven))
      : null
    if (tableScore !== null) {
      // Table items: award marks proportionally by correct cells.
      const marks = itemMarks(item)
      const earned = Math.round(tableScore * marks * 100) / 100
      const matched = tableScore === 1
      if (matched) correct += 1
      pointsPossible += marks
      pointsEarned += earned
      questionResults.push({
        questionId: item.id,
        correct: matched,
        pointsEarned: earned,
        pointsMax: marks,
        selectedAnswer: String(rawGiven),
      })
      continue
    }

    const { text: answerText, hasRichContent } = extractAnswerText(String(rawGiven))
    const g = normalize(answerText)
    const expected = normalize(item.answer)
    // Accept the canonical answer plus any marking-scheme variant. A variant
    // matches the same way as the canonical answer (exact normalized match, or
    // the student's answer contains it as a word sequence).
    const accepted = [
      expected,
      ...(Array.isArray(item.acceptableVariants)
        ? item.acceptableVariants.map(normalize).filter(Boolean)
        : []),
    ].filter(Boolean)
    const matched = g.length > 0 && accepted.some(a => g === a || ` ${g} `.includes(` ${a} `))
    // An answer carrying a drawing (a bare PNG data URL or a {drawing} blob),
    // converted handwriting, or pasted attachments can't be reliably auto-matched,
    // so always send it to the tutor for review instead of marking it wrong.
    const isDrawn = hasRichContent
    // Open-ended (long-key) items that weren't reproduced can't be auto-judged —
    // exclude and flag rather than penalize a possible paraphrase.
    const review = !matched && (isDrawn || wordCount(expected) > SHORT_ANSWER_MAX_WORDS)
    const marks = itemMarks(item)

    if (matched) correct += 1
    if (review) {
      needsReview += 1
    } else {
      pointsPossible += marks
      if (matched) pointsEarned += marks
    }

    questionResults.push({
      questionId: item.id,
      correct: matched,
      pointsEarned: matched ? marks : 0,
      pointsMax: review ? 0 : marks,
      selectedAnswer: String(rawGiven),
      ...(review ? { needsReview: true } : {}),
    })
  }

  return {
    // Weighted percentage: marks earned / marks available over the counted items.
    score: pointsPossible > 0 ? Math.round((pointsEarned / pointsPossible) * 100) : null,
    questionResults,
    gradable: gradable.length,
    correct,
    needsReview,
    pointsPossible,
    pointsEarned,
  }
}
