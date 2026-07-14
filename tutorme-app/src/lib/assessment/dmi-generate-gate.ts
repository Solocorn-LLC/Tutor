/**
 * Pre-network dialog routing for "Generate DMI".
 *
 * Generating a DMI resolves through a chain of dialogs, each of which pauses the
 * flow and re-invokes the generator from the top once answered:
 *
 *   format (MCQ vs free-response, assessment only)
 *     └─ free-response → source (which content: attached PDF vs edited text)
 *                          └─ proceed → (server may then ask kind → question-spec)
 *
 * This helper decides ONLY the next pre-network step. It is deliberately pure
 * and framework-free so the routing — including the property that the format
 * step is always resolved before the source step — is unit-tested directly,
 * away from the giant CourseBuilder component.
 *
 * Ordering matters. The source chooser MUST come after the format chooser:
 * multiple-choice papers are built locally and never read the content, so they
 * return at the format step and are never asked which source to use. Putting the
 * source step first (and dropping the pick on each re-invocation) is exactly the
 * bug that once looped source↔format forever — see the tests.
 */

export type DmiGate = 'format' | 'source' | 'proceed'

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
 * - `'format'`  → open the response-format chooser (assessment, not yet chosen).
 * - `'source'`  → open the content-source chooser (free-response, sources disagree,
 *                 no pick yet). Only reachable once the format step is resolved.
 * - `'proceed'` → no dialog needed; run generation.
 */
export function nextDmiGate(input: DmiGateInput): DmiGate {
  // Format first: a fresh assessment run with no downstream choice yet.
  if (
    input.type === 'assessment' &&
    !input.hasQuestionSpec &&
    !input.hasDocumentKindOverride &&
    !input.skipFormatPrompt
  ) {
    return 'format'
  }
  // Then source: only after format is resolved, and only when the two content
  // sources genuinely disagree and the tutor hasn't already picked one.
  if (input.sourcesDisagree && !input.contentSource) {
    return 'source'
  }
  return 'proceed'
}
