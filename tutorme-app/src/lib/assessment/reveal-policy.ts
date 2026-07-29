/**
 * Map the tutor's free-text PCI answer-reveal policy to a deploy reveal mode.
 *
 * For tasks, this is now the canonical source used at deploy time: the answer-reveal
 * dialog is skipped and the mode is derived from the task PCI (free-text instructions
 * or the structured `answerRevealPolicy` field). For assessments and homework, it is
 * still used to default the answer-reveal dialog to the tutor's stated policy.
 *
 * Returns null when the policy doesn't clearly map to a mode.
 */

export type DeployAnswerReveal = 'instant' | 'after_submit' | 'hidden' | 'student_choice'

export function revealPolicyToDeployMode(policy?: string): DeployAnswerReveal | null {
  const p = (policy ?? '').toLowerCase().trim()
  if (!p) return null
  if (/\bnever\b|\bhidden\b|do ?n'?t reveal|do not reveal|no reveal|withhold|keep hidden/.test(p))
    return 'hidden'
  if (/student'?s? choice|let (the )?student|on request|when they (want|choose)|optional/.test(p))
    return 'student_choice'
  if (
    /after (the )?(final|last|submit|submission|attempt|answer|test|quiz)|once (they|the student|submitted)|on (the )?results|end of/.test(
      p
    )
  )
    return 'after_submit'
  if (/instant|immediately|right away|straight away|as soon as|show (the )?answer/.test(p))
    return 'instant'
  return null
}
