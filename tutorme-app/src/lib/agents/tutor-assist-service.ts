/**
 * Tutor-facing assistant.
 *
 * Distinct from `runTutorChat` (the STUDENT Socratic tutor): the person here is a
 * professional educator, so the assistant answers DIRECTLY — no Socratic
 * deflection, no answer-withholding. Backs the tutor's own tools, each with its
 * own specialised prompt (`kind`):
 *   - `teaching`  — in-class questions / polls (AITeachingAssistant)
 *   - `builder`   — task/assessment content + marking policy (AIAssistAgent)
 *   - `analytics` — interpret class/student performance data (Reports chat)
 *   - `general`   — fallback
 *
 * SECURITY: this direct-answer path must only ever run for TUTOR/ADMIN sessions.
 * The route gates it; a student calling with this mode falls back to the Socratic
 * tutor (which also enforces the ASMT-15 assessment-integrity guardrail).
 */
import { generateWithFallback } from './orchestrator-llm'
import { AISecurityManager } from '@/lib/security/ai-sanitization'

export type TutorAssistKind = 'general' | 'teaching' | 'builder' | 'analytics'

/** Shared framing every specialised prompt builds on. */
const SHARED_PREAMBLE = `You are an AI assistant for a professional tutor using the Solocorn teaching platform. The person you are helping is a TEACHER, not a student — answer directly, accurately, and concisely. Never use Socratic deflection or withhold answers. When asked for a specific output format (e.g. a JSON array), return exactly that with no extra prose or code fences.`

const KIND_PROMPTS: Record<TutorAssistKind, string> = {
  general: `${SHARED_PREAMBLE}

You help tutors draft teaching material, build assessments and marking policies, and interpret class analytics.`,

  teaching: `${SHARED_PREAMBLE}

Your job: generate ready-to-use in-class material — discussion questions, polls, and prompts — pitched to the lesson content and the students' level. Make each one specific and classroom-ready (not generic), with useful follow-ups where asked. If a JSON shape is specified, match it exactly.`,

  builder: `${SHARED_PREAMBLE}

Your job: help the tutor build course content in the assessment/task builder — draft and refine questions, tighten rubrics, and turn a rough intention into clear, gradeable instructions and marking policies (PCI). Be concrete and edit-ready; when the tutor pastes existing content, improve it in place rather than restating it.`,

  analytics: `${SHARED_PREAMBLE}

Your job: interpret class and student analytics. Given performance data, session details, or a roster, surface concrete insights — trends, at-risk students, and specific next actions — and cite the numbers you were given. No vague generalities; if the data is thin, say what's missing.`,
}

/** The specialised system prompt for a tool. Unknown kinds fall back to general. */
export function tutorAssistPrompt(kind: TutorAssistKind = 'general'): string {
  return KIND_PROMPTS[kind] ?? KIND_PROMPTS.general
}

export interface TutorAssistInput {
  message: string
  kind?: TutorAssistKind
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
    tutorAssistPrompt(input.kind),
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
