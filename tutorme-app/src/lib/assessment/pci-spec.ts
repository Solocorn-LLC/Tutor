/**
 * Structured PCI Specification (Task PCI guardrail TASK-6, Specification).
 *
 * The finalized PCI is also expressed as a structured record with a fixed set
 * of fields, so it's parseable/auditable and execution is consistent. Fields the
 * tutor did not define are LEFT OUT (unspecified) — never fabricated for
 * completeness. This lives alongside the free-text `pci` rubric (which stays for
 * display and back-compat); the spec is the machine-readable form.
 */

export interface PciSpec {
  /** Which lesson content / material the behavior refers to. */
  instructionalContentReference?: string
  /** What event triggers the PCI (e.g. "student submits an answer"). */
  triggerEvent?: string
  /** How a response is evaluated (the marking logic). */
  evaluationLogic?: string
  /** What to do on a correct response. */
  correctResponseBehavior?: string
  /** What to do on an incorrect response. */
  incorrectResponseBehavior?: string
  /** What to do on a partially-correct response (if the tutor defined it). */
  partialUnderstandingBehavior?: string
  /** What to do when the student gives no response (if defined). */
  noResponseBehavior?: string
  /** How/whether to explain reasoning. */
  explanationRules?: string
  /** Retry policy (if defined). */
  retryPolicy?: string
  /** When/whether the correct answer is revealed to the student (if defined). */
  answerRevealPolicy?: string
  /** Instructional tone. */
  instructionalTone?: string
  /** How follow-up questions should be answered after task completion. */
  followUpBehavior?: string
}

/** The canonical field order + human labels for prompts and UI. */
export const PCI_SPEC_FIELDS: { key: keyof PciSpec; label: string }[] = [
  { key: 'instructionalContentReference', label: 'Instructional content reference' },
  { key: 'triggerEvent', label: 'Trigger event' },
  { key: 'evaluationLogic', label: 'Evaluation logic' },
  { key: 'correctResponseBehavior', label: 'Correct-response behaviour' },
  { key: 'incorrectResponseBehavior', label: 'Incorrect-response behaviour' },
  { key: 'partialUnderstandingBehavior', label: 'Partial-understanding behaviour' },
  { key: 'noResponseBehavior', label: 'No-response behaviour' },
  { key: 'explanationRules', label: 'Explanation rules' },
  { key: 'retryPolicy', label: 'Retry policy' },
  { key: 'answerRevealPolicy', label: 'Answer-reveal policy' },
  { key: 'instructionalTone', label: 'Instructional tone' },
  { key: 'followUpBehavior', label: 'Follow-up behaviour' },
]

/** Values that mean "the tutor didn't define this" — dropped, not fabricated. */
const UNSPECIFIED_RE = /^(unspecified|n\/?a|none|not (defined|specified|provided|applicable))$/i

/**
 * Normalize a raw spec object into a clean `PciSpec` — keeping only recognized
 * fields the tutor actually defined. Empty / "unspecified" / "N/A" values are
 * dropped (TASK-6: undefined fields stay unspecified, never fabricated).
 * Returns null when nothing is defined.
 */
export function normalizePciSpec(raw: unknown): PciSpec | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const src = raw as Record<string, unknown>
  const out: PciSpec = {}
  for (const { key } of PCI_SPEC_FIELDS) {
    const v = src[key]
    if (typeof v !== 'string') continue
    const t = v.trim()
    if (t && !UNSPECIFIED_RE.test(t)) out[key] = t
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * Render a `PciSpec` as human-/model-readable `Label: value` lines in the
 * canonical field order, including only fields the tutor actually defined.
 * Returns '' for a null/empty spec so callers can cheaply skip injection.
 */
export function pciSpecToText(spec: PciSpec | null | undefined): string {
  if (!spec) return ''
  const lines: string[] = []
  for (const { key, label } of PCI_SPEC_FIELDS) {
    const v = spec[key]
    if (typeof v === 'string' && v.trim()) lines.push(`${label}: ${v.trim()}`)
  }
  return lines.join('\n')
}
