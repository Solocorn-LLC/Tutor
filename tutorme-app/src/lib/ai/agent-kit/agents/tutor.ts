/**
 * Tutor agent — Phase 3 port.
 *
 * Delegates its system prompt to the EXISTING builder so there's a single source
 * of truth for the Socratic tutor prompt (no duplicate copy in the kit). The
 * calling route passes a `TutorContext`-shaped `context`; `buildHintPrompt` /
 * `buildExplanationPrompt` become tools in a later PR.
 */
import { buildSystemPrompt } from '@/lib/agents/tutor/prompts/system-prompt'
import { registerAgent } from '../registry'
import type { AgentDefinition } from '../types'

export const tutorAgent: AgentDefinition = registerAgent({
  id: 'tutor',
  description: 'Socratic AI tutor — guides students to answers, never gives them directly.',
  systemPrompt: input =>
    buildSystemPrompt(input.context as unknown as Parameters<typeof buildSystemPrompt>[0]),
  temperature: 0.7,
})
