/**
 * Pre-network dialog routing for auto-generating a DMI.
 *
 * A DMI now generates automatically the moment a document is loaded (and via the
 * manual Generate / Regenerate control). The former "response format" step —
 * which asked MCQ vs free-response up front — was removed: the model reads the
 * paper and detects the question mix itself. So the ONLY remaining pre-network
 * dialog is the content-source chooser, shown when an attached PDF and the typed
 * text genuinely disagree and no pick has been made yet:
 *
 *   proceed  (default — run generation)
 *     └─ source  (only when PDF ≠ typed text; then proceed → server may still
 *                 ask kind → question-spec for study material)
 *
 * This helper decides ONLY the next pre-network step. It is deliberately pure and
 * framework-free so the routing is unit-tested away from the giant CourseBuilder.
 */

export type DmiGate = 'source' | 'proceed'

export interface DmiGateInput {
  type: 'task' | 'assessment'
  /** A question spec is already chosen (study-material path). */
  hasQuestionSpec: boolean
  /** A document-kind override is already chosen (question_paper / study_material). */
  hasDocumentKindOverride: boolean
  /** The format step has been answered (or is otherwise not needed). */
  skipFormatPrompt: boolean
  /**
   * The resolved content source: the caller passes `override ?? rememberedPick`
   * so a choice made earlier in the chain keeps the source step from re-opening.
   */
  contentSource: 'document' | 'text' | undefined
  /**
   * A PDF is attached AND the typed text was edited away from the document's own
   * extraction — the two sources genuinely disagree, so we must ask which to use.
   */
  sourcesDisagree: boolean
}

/**
 * The next pre-network step for a Generate DMI (re-)invocation:
 * - `'source'`  → open the content-source chooser (an attached PDF and the typed
 *                 text disagree and no pick has been made yet).
 * - `'proceed'` → no dialog needed; run generation.
 */
export function nextDmiGate(input: DmiGateInput): DmiGate {
  // The only pre-network dialog: pick a source when the attached PDF and the
  // typed text genuinely disagree and the tutor hasn't already picked one.
  if (input.sourcesDisagree && !input.contentSource) {
    return 'source'
  }
  return 'proceed'
}
