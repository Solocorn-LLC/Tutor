/**
 * Task PCI context injection (Task PCI guardrail TASK-6, application).
 *
 * When a student is working on a specific deployed task, the live AI tutor
 * should apply the tutor-authored PCI for that task — the free-text notes plus
 * the finalized structured spec. This module turns those into a system-prompt
 * directive, mirroring `withAssessmentIntegrity` (ASMT-15).
 *
 * The directive shapes the tutor's INSTRUCTIONAL behaviour (how to respond to
 * correct/incorrect/partial answers, tone, whether to reveal reasoning, retry
 * policy). It deliberately does NOT override the academic-integrity rule: while
 * an assessment is in progress the tutor still must not solve it.
 */

import { pciSpecToText, type PciSpec } from './pci-spec'

/**
 * Build the task-PCI directive block from the free-text `pci` and/or structured
 * spec. Returns '' when neither is present so callers can skip injection.
 */
export function buildTaskPciDirective(pci?: string | null, spec?: PciSpec | null): string {
  const specText = pciSpecToText(spec)
  const freeText = typeof pci === 'string' ? pci.trim() : ''
  if (!specText && !freeText) return ''

  const parts: string[] = [
    'TASK GUIDANCE — HOW TO HELP ON THE CURRENT TASK',
    'The tutor who set this task defined how a student should be guided on it. Apply this instructional approach when helping with THIS task — it governs your teaching behaviour (how to respond to correct, incorrect, partial, or no answer; tone; whether to explain reasoning; retry policy). It does NOT override the academic-integrity rule above: never solve an in-progress assessment.',
  ]
  if (specText) parts.push(`Structured guidance:\n${specText}`)
  if (freeText) parts.push(`Tutor's notes:\n${freeText.slice(0, 4000)}`)
  return parts.join('\n\n')
}

/**
 * Prepend the task-PCI directive to a system prompt when task PCI is present.
 * A no-op when neither the free-text `pci` nor the structured spec is defined.
 *
 * Ordering note: apply this to the BASE prompt, then wrap the result with
 * `withAssessmentIntegrity` so the integrity directive stays first/highest.
 */
export function withTaskPci(
  systemPrompt: string,
  pci?: string | null,
  spec?: PciSpec | null
): string {
  const directive = buildTaskPciDirective(pci, spec)
  return directive ? `${directive}\n\n${systemPrompt}` : systemPrompt
}
