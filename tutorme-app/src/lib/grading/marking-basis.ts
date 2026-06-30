/**
 * Marking-basis resolution for AI grading (Task PCI guardrails TASK-10 /
 * TASK-19 — No-Hallucinated-Evaluation + Safe Failure).
 *
 * AI grading must have an actual evaluation basis: the tutor's PCI marking
 * instructions, a rubric, or a model answer. With none of these, the grader has
 * nothing to judge against and must refuse rather than fabricate a confident
 * score.
 */

export interface MarkingBasisParts {
  pci?: string | null
  rubric?: string | null
  modelAnswer?: string | null
}

export interface ResolvedMarkingBasis {
  pci: string
  rubric: string
  modelAnswer: string
  /** True when at least one usable evaluation basis is present. */
  hasBasis: boolean
}

/** Trim the marking-basis parts and report whether any usable basis exists. */
export function resolveMarkingBasis(parts: MarkingBasisParts): ResolvedMarkingBasis {
  const pci = (parts.pci ?? '').trim()
  const rubric = (parts.rubric ?? '').trim()
  const modelAnswer = (parts.modelAnswer ?? '').trim()
  return { pci, rubric, modelAnswer, hasBasis: Boolean(pci || rubric || modelAnswer) }
}
