/**
 * Tutor-facing assistant.
 *
 * Distinct from `runTutorChat` (the STUDENT Socratic tutor): the person here is a
 * professional educator, so the assistant answers DIRECTLY — no Socratic
 * deflection, no answer-withholding. Backs the tutor's own tools: the in-class
 * teaching-suggestion generator, the course-builder "AI Assist", and the reports
 * analytics chat.
 *
 * SECURITY: this direct-answer path must only ever run for TUTOR/ADMIN sessions.
 * The route gates it; a student calling with this mode falls back to the Socratic
 * tutor (which also enforces the ASMT-15 assessment-integrity guardrail).
 */
import { generateWithFallback } from './orchestrator-llm'
import { AISecurityManager } from '@/lib/security/ai-sanitization'

export const TUTOR_ASSIST_SYSTEM_PROMPT = `You are an AI assistant for a professional tutor using the Solocorn teaching platform. The person you are helping is a TEACHER, not a student — answer their requests directly, accurately, and concisely. Never use Socratic deflection or withhold answers.

You help tutors:
- draft teaching questions, polls, and discussion prompts for their class
- build assessments and marking policies, and write lesson content
- interpret class and student analytics with concrete, actionable insights

When the tutor asks for output in a specific format (e.g. a JSON array), return exactly that format with no extra prose or code fences. When given data (student performance, session details), analyse it and give specific, practical recommendations.`

export interface TutorAssistInput {
  message: string
  previousMessages?: Array<{ role?: string; content?: string }>
}

export interface TutorAssistOutput {
  response: string
  provider: string
  latencyMs: number
}

export async function runTutorAssistChat(input: TutorAssistInput): Promise<TutorAssistOutput> {
  const safeMessage = AISecurityManager.sanitizeAiInput(String(input.message))
  if (!safeMessage) {
    throw new Error('Message is required or invalid after sanitization')
  }

  const history = (input.previousMessages ?? [])
    .slice(-6)
    .map(m => `${m?.role === 'assistant' ? 'Assistant' : 'Tutor'}: ${String(m?.content ?? '')}`)
    .join('\n')

  const prompt = [
    TUTOR_ASSIST_SYSTEM_PROMPT,
    history && `Conversation so far:\n${history}`,
    `Tutor: ${safeMessage}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await generateWithFallback(prompt, { temperature: 0.7, maxTokens: 2048 })

  const validation = await AISecurityManager.validateAiResponse(result.content)
  if (!validation.isValid && validation.severity === 'CRITICAL') {
    throw new Error('AI response failed security validation')
  }

  return { response: result.content, provider: result.provider, latencyMs: result.latencyMs }
}
