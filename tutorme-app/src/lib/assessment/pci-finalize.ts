/**
 * TASK-5 (Confirmation): does the tutor's message unambiguously ask to FINALIZE
 * the marking policy/rubric?
 *
 * The tutor's explicit "Apply to PCI" click is the real gate; this signal only
 * informs `pciUnconfirmed` and the guardrail validator. It matches ONLY explicit
 * finalize intent and deliberately EXCLUDES generic agreement words ("confirm",
 * "correct", "looks good", "sounds good", "agreed", "go ahead") because those
 * also mean "yes, the SUMMARY is right" in the confirm-summary step and must not
 * be misread as finalizing the rubric.
 */
const FINALIZE_INTENT_RE =
  /\b(finali[sz]e|approve the (rubric|pci|policy|marking policy)|lock it in|activate the (rubric|pci|policy)|apply (it|this|the (rubric|pci|policy|marking policy))|save (it|the (rubric|pci|policy))|use this (rubric|policy) as (the )?final)\b/i

export function signalsPciFinalize(message: string): boolean {
  return FINALIZE_INTENT_RE.test(message || '')
}
