/**
 * Lightweight deterministic auto-grading for DMI answers.
 *
 * Grades a student's answers (keyed by DMI item id) against the tutor's answer
 * key (the `answer` on each DMI item, stored server-side in BuilderTaskDmi.items
 * and never sent to students). Intentionally CONSERVATIVE — it credits an item
 * only on a normalized exact match or when the student's answer contains the
 * full expected answer as a word sequence. This avoids over-crediting; verbose /
 * open-ended answers that don't reproduce the key are left for graded review.
 * It's a coarse, live signal, not a replacement for grading.
 */

export interface DmiAnswerItem {
  id: string
  answer?: string
  questionText?: string
}

export interface AutoGradeResult {
  /** 0–100, or null when nothing was gradable (no answer key). */
  score: number | null
  questionResults: Record<string, { correct: boolean; expected: string; given: string }> | null
  gradable: number
  correct: number
}

function normalize(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function autoGradeDmi(
  items: DmiAnswerItem[] | null | undefined,
  answers: Record<string, string> | null | undefined
): AutoGradeResult {
  const list = Array.isArray(items) ? items : []
  const given = answers || {}
  const gradable = list.filter(i => i && typeof i.answer === 'string' && i.answer.trim().length > 0)
  if (gradable.length === 0) {
    return { score: null, questionResults: null, gradable: 0, correct: 0 }
  }

  let correct = 0
  const questionResults: Record<string, { correct: boolean; expected: string; given: string }> = {}
  for (const item of gradable) {
    const rawGiven = given[item.id] ?? ''
    const g = normalize(rawGiven)
    const expected = normalize(item.answer)
    const isCorrect = g.length > 0 && (g === expected || ` ${g} `.includes(` ${expected} `))
    if (isCorrect) correct += 1
    questionResults[item.id] = {
      correct: isCorrect,
      expected: String(item.answer ?? ''),
      given: String(rawGiven),
    }
  }

  return {
    score: Math.round((correct / gradable.length) * 100),
    questionResults,
    gradable: gradable.length,
    correct,
  }
}
