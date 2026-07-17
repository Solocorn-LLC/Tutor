/**
 * SAI (Solocorn AI) — tutor-facing classroom assistant guardrails.
 *
 * Governs all messages exchanged between the tutor and SAI in the Classroom
 * (Test mode and live sessions). The default trust posture is:
 *   - SAI messages are **tutor-only** unless explicitly classified as safe for
 *     student visibility.
 *   - Any reference to missing policy, grading, rubrics, answer keys, or PCI
 *     stays hidden from students.
 *
 * Student-visible SAI output is an explicit, future opt-in; the current rule
 * set returns everything to the tutor stream.
 */

export type SaiVisibility = 'tutor-only' | 'student-visible'

export interface SaiMessage {
  role: 'sai' | 'tutor'
  content: string
  visibility: SaiVisibility
}

export interface ClassifiedSaiResponse {
  content: string
  visibility: SaiVisibility
  violations: string[]
}

/** Patterns that must keep a response in the tutor-only stream. */
const TUTOR_ONLY_TRIGGERS = [
  /no policy was set/i,
  /marking policy|mark scheme|rubric|answer key|model answer/i,
  /pci policy|pci spec|structured pci/i,
  /\bgrade[sd]?\b|\bscore[sd]?\b|\bmarks?\b/i,
]

/**
 * Classify a raw SAI response for visibility and compliance.
 *
 * @param raw - The raw text returned by the LLM or generated locally.
 * @param context - Runtime context, e.g. whether the current task has a policy.
 */
export function classifySaiResponse(
  raw: string,
  context: { hasTaskPolicy: boolean }
): ClassifiedSaiResponse {
  const violations: string[] = []
  const content = raw.trim()

  // Default posture: SAI output is for the tutor only.
  let visibility: SaiVisibility = 'tutor-only'

  // Student-visible output must be explicitly requested/allowed.
  if (/(?:for the students|to the class|tell the class|share with students)/i.test(content)) {
    visibility = 'student-visible'
  }

  // Anything touching policy, grading, rubrics, answer keys, or PCI goes back
  // to the tutor-only stream.
  for (const re of TUTOR_ONLY_TRIGGERS) {
    if (re.test(content)) {
      visibility = 'tutor-only'
      if (!context.hasTaskPolicy) {
        violations.push('TUTOR_ONLY_INFO: policy/grading content shown only to tutor')
      }
      break
    }
  }

  return { content, visibility, violations }
}

/** Factory for a typed SAI message. */
export function createSaiMessage(
  content: string,
  visibility: SaiVisibility = 'tutor-only',
  role: SaiMessage['role'] = 'sai'
): SaiMessage {
  return { role, content, visibility }
}

/** Canonical tutor-only note when a task has no PCI policy set. */
export const NO_POLICY_SET_MESSAGE = 'No policy was set for this class'
