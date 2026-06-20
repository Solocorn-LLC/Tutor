/**
 * AI guardrails — enforce the Task PCI and Assessment PCI/DMI guardrail
 * documents at runtime.
 *
 * Layers:
 *  1. System prompts (`TASK_PCI_SYSTEM_PROMPT`, `ASSESSMENT_SYSTEM_PROMPT`)
 *     injected into the relevant LLM calls so the model follows the rules.
 *  2. Warn-only validators (`validateTaskPciOutput`, `validateAssessmentOutput`)
 *     run after generation; they surface `GuardrailViolation[]` without blocking.
 *  3. Deterministic guarantees: `stripEvaluationLayer` (student payloads never
 *     carry answers/rubrics) and `canTransition` (assessment state machine).
 *
 * Source of truth for the rules: docs/guardrails/{tasks-pci,assessments}.md.
 */

export {
  TASK_PCI_GUARDRAILS,
  TASK_PCI_SYSTEM_PROMPT,
  type GuardrailRule,
  type GuardrailEnforcement,
} from './task-pci'

export {
  ASSESSMENT_GUARDRAILS,
  ASSESSMENT_SYSTEM_PROMPT,
  ASSESSMENT_STATES,
  canTransition,
  type AssessmentState,
  type TransitionResult,
} from './assessment'

export {
  validateTaskPciOutput,
  validateAssessmentOutput,
  isAssessmentState,
  type GuardrailViolation,
  type GuardrailSeverity,
  type TaskValidationContext,
  type AssessmentValidationContext,
} from './validate'

export { stripEvaluationLayer, findEvaluationLeaks } from './serialize'

import { TASK_PCI_SYSTEM_PROMPT } from './task-pci'
import { ASSESSMENT_SYSTEM_PROMPT } from './assessment'
import {
  validateTaskPciOutput,
  validateAssessmentOutput,
  type GuardrailViolation,
  type TaskValidationContext,
  type AssessmentValidationContext,
} from './validate'

export type GuardrailDomain = 'task' | 'assessment'

/** Return the canonical guardrail system prompt for a given PCI domain. */
export function guardrailSystemPrompt(domain: GuardrailDomain): string {
  return domain === 'assessment' ? ASSESSMENT_SYSTEM_PROMPT : TASK_PCI_SYSTEM_PROMPT
}

/**
 * Lower sampling temperature recommended for guardrailed PCI generation —
 * the Consistency guardrail (TASK-8) wants materially stable behaviour.
 */
export const GUARDRAILED_TEMPERATURE = 0.2

export interface GuardrailRunResult {
  violations: GuardrailViolation[]
  /** True if any violation is severity 'error' (blocking once enforcement is on). */
  hasBlocking: boolean
}

/** Run the warn-only task validator and summarize. */
export function runTaskGuardrails(
  responseText: string,
  ctx?: TaskValidationContext
): GuardrailRunResult {
  const violations = validateTaskPciOutput(responseText, ctx)
  return { violations, hasBlocking: violations.some(v => v.severity === 'error') }
}

/** Run the warn-only assessment validator and summarize. */
export function runAssessmentGuardrails(
  parsed: Parameters<typeof validateAssessmentOutput>[0],
  ctx?: AssessmentValidationContext
): GuardrailRunResult {
  const violations = validateAssessmentOutput(parsed, ctx)
  return { violations, hasBlocking: violations.some(v => v.severity === 'error') }
}
