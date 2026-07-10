/**
 * "DMI-first" readiness gate for the assessment marking-policy (PCI) chat.
 *
 * The chat unlocks only once the DMI is set up to the "basic" bar: it has
 * questions, a positive total marks, and at least one answer or rubric (the
 * answer key / marking scheme). Per-question gaps are allowed here (surfaced
 * elsewhere), not blocking. Pure + framework-free so it's unit-tested directly.
 */

export interface DmiReadinessItem {
  marks?: number | null
  answer?: string | null
  rubric?: string | null
}

export interface DmiReadiness {
  hasQuestions: boolean
  totalMarks: number
  hasAnswerKey: boolean
  /** True when the marking-policy chat may unlock. */
  ready: boolean
}

const hasText = (v: string | null | undefined): boolean => (v?.trim()?.length ?? 0) > 0

export function assessmentDmiReadiness(items: readonly DmiReadinessItem[]): DmiReadiness {
  const hasQuestions = items.length > 0
  const totalMarks = items.reduce(
    (sum, q) => sum + (typeof q.marks === 'number' && q.marks > 0 ? q.marks : 0),
    0
  )
  const hasAnswerKey = items.some(q => hasText(q.answer) || hasText(q.rubric))
  return {
    hasQuestions,
    totalMarks,
    hasAnswerKey,
    ready: hasQuestions && totalMarks > 0 && hasAnswerKey,
  }
}
