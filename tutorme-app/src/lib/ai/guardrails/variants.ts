/**
 * PCI-chat prompt variants — per-assessment-type steering appended to the base
 * ASSESSMENT_SYSTEM_PROMPT.
 *
 * These are PROMPT-LAYER nudges only: they tailor the marking-policy interview
 * to what's actually being marked (objective vs free-response question mix, and
 * whether the questions were extracted from an exam or generated from study
 * material). They never introduce or relax a guardrail — the base prompt (which
 * embeds ASSESSMENT_GUARDRAILS), the validators, and the state machine remain
 * the binding rules. See docs/guardrails/assessments.md → "Prompt variants".
 *
 * Tasks use the source modifier only (a study-material note) — composition does
 * not apply to free-form chat answering. The classifier + addenda live here (not
 * in assessment.ts) so the canonical rule module stays the single source of the
 * rules.
 */

import { OPEN_DMI_TYPES, type DmiQuestionType } from '@/lib/assessment/question-types'

/** How the assessment's question mix skews (drives the interview shape). */
export type PciComposition = 'objective' | 'free_response' | 'mixed'

/** Where the questions came from (modifier on top of composition). */
export type PciDocumentKind = 'question_paper' | 'study_material'

export interface PciVariant {
  composition?: PciComposition
  documentKind?: PciDocumentKind
}

/** ≥80% closed questions → treat as objective (mostly exact right/wrong). */
const OBJECTIVE_THRESHOLD = 0.8
/** ≥60% open (short/long) questions → treat as free-response (rubric-driven). */
const FREE_RESPONSE_THRESHOLD = 0.6

/**
 * Classify an assessment's question mix into a PCI-chat composition variant.
 * Open = short/long (`OPEN_DMI_TYPES`); everything else is closed/auto-graded.
 * Returns `undefined` when there are no typed questions (→ no addendum, base
 * prompt behaves exactly as before).
 */
export function resolvePciComposition(
  questionTypes: ReadonlyArray<string | null | undefined>
): PciComposition | undefined {
  const types = questionTypes.filter((t): t is string => !!t)
  if (types.length === 0) return undefined
  const open = types.filter(t => OPEN_DMI_TYPES.has(t as DmiQuestionType)).length
  const openRatio = open / types.length
  const closedRatio = 1 - openRatio
  if (closedRatio >= OBJECTIVE_THRESHOLD) return 'objective'
  if (openRatio >= FREE_RESPONSE_THRESHOLD) return 'free_response'
  return 'mixed'
}

/**
 * Best-effort backfill of `documentKind` for DMIs generated BEFORE it was
 * persisted, inferred from answer provenance (ASMT-5). Deliberately CONSERVATIVE
 * to avoid mislabelling a real question paper as study material:
 *  - any answer from a real source (answer sheet / tutor) → NOT study material
 *    (returns undefined → base prompt, treated as a question paper);
 *  - only when every known answer is `llm_inferred` (the signature of AI-
 *    generated study-material questions) do we infer `study_material`.
 * It never returns `question_paper` (undefined already means "no note"), so a
 * wrong guess can only ever WITHHOLD the study-material note, never fabricate a
 * question-paper classification. A regenerated DMI persists the real value and
 * supersedes this inference.
 */
export function inferDocumentKindFromProvenance(
  provenances: ReadonlyArray<string | null | undefined>
): 'study_material' | undefined {
  const known = provenances.filter((p): p is string => !!p)
  if (known.length === 0) return undefined
  if (
    known.some(
      p => p === 'answer_sheet_extracted' || p === 'tutor_provided' || p === 'tutor_edited'
    )
  ) {
    return undefined
  }
  return known.every(p => p === 'llm_inferred') ? 'study_material' : undefined
}

const COMPOSITION_ADDENDA: Record<PciComposition, string> = {
  objective: `- OBJECTIVE-HEAVY assessment (mostly closed questions — MCQ, true/false, multiple-response, fill-in, matching). Marking is largely exact right/wrong, so keep the interview SHORT: ask only about (a) partial credit for multiple-response questions, (b) negative marking, (c) numeric/fill-in tolerance (units, rounding, spelling/case leniency), and (d) how to treat blank answers. Do NOT walk through rubrics for closed questions — they auto-grade. Only raise a rubric if a specific question is actually open.`,
  free_response: `- FREE-RESPONSE assessment (mostly open short/long written answers). Marking is rubric-driven, so focus the policy on: awarding by method vs final answer, partial-credit bands, accepting equivalent/alternative reasoning, the key points required for full marks, how to treat blank or off-topic answers, and the depth/tone of written feedback. Confirm every open question has a rubric pathway before finalizing (ASMT-8); rubric criteria must sum to the question's marks (ASMT-9).`,
  mixed: `- MIXED assessment (both closed and open questions). First ask ONE question: does a single marking policy apply to the whole paper, or should the closed (auto-graded) and written (rubric-graded) parts be handled differently? Then branch — keep closed-question rules brief and spend the interview on the written parts' rubrics.`,
}

const STUDY_MATERIAL_NOTE = `- SOURCE: these questions were GENERATED from the tutor's study material, not extracted from an existing exam (answer provenance: llm_inferred). On your FIRST turn, before any marking policy, briefly confirm the generated questions cover what the tutor wants at the right difficulty and invite them to adjust the set; only once they are happy with the questions, move on to the marking policy.`

/**
 * Build the assessment-prompt addendum for a resolved variant. Returns '' when
 * there's nothing to add (so the base prompt is used verbatim). The header makes
 * explicit that this is steering, not a new rule — the guardrails still bind.
 */
export function assessmentVariantAddendum(variant?: PciVariant): string {
  if (!variant) return ''
  const parts: string[] = []
  if (variant.composition) parts.push(COMPOSITION_ADDENDA[variant.composition])
  if (variant.documentKind === 'study_material') parts.push(STUDY_MATERIAL_NOTE)
  if (parts.length === 0) return ''
  return `\n\nAssessment-type guidance (steering only — every guardrail above still binds; never use this to invent, relax, or skip a rule):\n${parts.join(
    '\n'
  )}`
}

const TASK_STUDY_MATERIAL_NOTE = `- SOURCE: this task's prompt(s) were GENERATED from the tutor's study material, not taken from an existing question paper. On your FIRST turn, before building any marking policy, briefly confirm the generated prompt(s) match what the tutor wants to assess and invite them to adjust; only once they are happy with the prompt(s), move on to how answers should be marked.`

/**
 * Build the task-prompt addendum for a resolved variant. Task answering is
 * inherently free-form (the student chats their answer), so composition does
 * NOT apply here — the only task modifier is a study-material source note.
 * Returns '' when there's nothing to add (base prompt used verbatim).
 */
export function taskVariantAddendum(variant?: PciVariant): string {
  if (variant?.documentKind !== 'study_material') return ''
  return `\n\nTask-type guidance (steering only — every guardrail above still binds; never use this to invent, relax, or skip a rule):\n${TASK_STUDY_MATERIAL_NOTE}`
}
