/**
 * Evaluation-layer stripping (ASMT-10, ASMT-13, ASMT-15).
 *
 * The single deterministic guarantee in this subsystem that is NOT warn-only:
 * any payload sent to a student must pass through `stripEvaluationLayer` so
 * answers, rubrics, and scoring logic can never leak into the delivery layer.
 */

/** Keys that belong to the hidden evaluation layer and must never reach students. */
const EVALUATION_KEYS = new Set([
  'answer',
  'answers',
  'correctAnswer',
  'correct_answer',
  'correctAnswers',
  'acceptableVariants',
  'acceptable_variants',
  'modelAnswer',
  'model_answer',
  'keyPoints',
  'key_points',
  'rubric',
  'rubrics',
  'rubricCriteria',
  'rubric_criteria',
  'scoring',
  'scoringLogic',
  'scoring_logic',
  'evaluationCriteria',
  'evaluation_criteria',
  'markScheme',
  'mark_scheme',
  'answerProvenance',
  'answer_provenance',
  'provenance',
  'prepopulatedAnswer',
  'prepopulated_answer',
  'sampleResponse',
  'sample_response',
  // Interactive answer keys: the correct correspondence (matching/drag_drop) and
  // the correct clickable areas (hotspot) — never deliver these to students.
  'pairs',
  'regions',
])

/**
 * Recursively remove all evaluation-layer fields from a DMI/PCI structure,
 * returning a deep-cloned, student-safe copy. Non-object input is returned as-is.
 */
export function stripEvaluationLayer<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map(item => stripEvaluationLayer(item)) as unknown as T
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (EVALUATION_KEYS.has(key)) continue
      out[key] = stripEvaluationLayer(value)
    }
    return out as unknown as T
  }
  return input
}

/**
 * Audit a student-facing payload for residual evaluation-layer keys.
 * Returns the dotted paths of any leaked keys (empty array = clean).
 */
export function findEvaluationLeaks(input: unknown, path = ''): string[] {
  const leaks: string[] = []
  if (Array.isArray(input)) {
    input.forEach((item, i) => leaks.push(...findEvaluationLeaks(item, `${path}[${i}]`)))
  } else if (input && typeof input === 'object') {
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const here = path ? `${path}.${key}` : key
      if (EVALUATION_KEYS.has(key)) leaks.push(here)
      else leaks.push(...findEvaluationLeaks(value, here))
    }
  }
  return leaks
}
