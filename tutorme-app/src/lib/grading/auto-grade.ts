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
  let counted = 0 // items that contribute to the score (correct or confidently wrong)
  let needsReview = 0
  let pointsEarned = 0 // weighted sum of marks earned over counted items
  let pointsPossible = 0 // weighted sum of marks available over counted items
  const questionResults: AutoGradeQuestionResult[] = []
  for (const item of gradable) {
    const rawGiven = given[item.id] ?? ''
    const g = normalize(rawGiven)
    const expected = normalize(item.answer)
    const matched = g.length > 0 && (g === expected || ` ${g} `.includes(` ${expected} `))
    // A drawn answer (PNG data URL) is an image, not text — it can never be
    // auto-matched, so always send it to the tutor for review instead of marking
    // it wrong.
    const isDrawn = String(rawGiven).startsWith('data:image')
    // Open-ended (long-key) items that weren't reproduced can't be auto-judged —
    // exclude and flag rather than penalize a possible paraphrase.
    const review = !matched && (isDrawn || wordCount(expected) > SHORT_ANSWER_MAX_WORDS)
    const marks = itemMarks(item)

    if (matched) correct += 1
    if (review) {
      needsReview += 1
    } else {
      counted += 1
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
