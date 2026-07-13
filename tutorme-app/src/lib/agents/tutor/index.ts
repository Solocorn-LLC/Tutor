/**
 * Tutor agent — response-classification helpers.
 *
 * The interactive tutoring flow now lives in `lib/agents/tutor-chat-service.ts`
 * (`runTutorChat`), which is what the API routes call. Only the two pure string
 * helpers below remain in use — imported by that service to classify a reply and
 * extract next-step suggestions.
 *
 * The former `tutorChat` / `generateHint` / `explainConcept` / `analyzeIntent`
 * functions were superseded by `runTutorChat` and removed (they had no callers).
 */

export interface TutorRequest {
  studentId: string
  subject: string
  message: string
  conversationId?: string
}

export interface TutorResponse {
  content: string
  provider: string
  latencyMs: number
  intent?: string
  hintType?: 'socratic' | 'direct' | 'encouragement' | 'clarification'
  relevantConcepts?: string[]
  suggestedNextSteps?: string[]
}

export function classifyHintType(message: string): TutorResponse['hintType'] {
  const lower = message.toLowerCase()

  if (
    lower.includes('?') &&
    (lower.includes('what') || lower.includes('how') || lower.includes('why'))
  ) {
    return 'socratic'
  }
  if (lower.includes('try') || lower.includes('consider') || lower.includes('think about')) {
    return 'socratic'
  }
  if (lower.includes('well done') || lower.includes('great') || lower.includes('excellent')) {
    return 'encouragement'
  }
  if (lower.includes('let me explain') || lower.includes("here's how")) {
    return 'direct'
  }

  return 'clarification'
}

export function extractNextSteps(message: string): string[] | undefined {
  const patterns = [
    /try (to |)([^.]+)/i,
    /next, ([^.]+)/i,
    /you could ([^.]+)/i,
    /consider ([^.]+)/i,
  ]

  const steps: string[] = []
  patterns.forEach(pattern => {
    const match = message.match(pattern)
    if (match) {
      steps.push(match[0])
    }
  })

  return steps.length > 0 ? steps : undefined
}
