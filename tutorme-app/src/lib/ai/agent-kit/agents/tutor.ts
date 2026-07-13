/**
 * Example port: the Socratic tutor as a declarative config.
 *
 * Phase 1 keeps the prompt self-contained (additive, no coupling). In the
 * porting phase its `systemPrompt` will delegate to the existing
 * `lib/agents/tutor` prompt builder, and its `tools` will be populated
 * (student progress, curriculum lookup, concept mastery).
 */
import { registerAgent } from '../registry'
import type { AgentDefinition } from '../types'

export const tutorAgent: AgentDefinition = registerAgent({
  id: 'tutor',
  description: 'Socratic AI tutor — guides students to answers, never gives them directly.',
  systemPrompt:
    'You are a Socratic tutor. Guide the student to discover the answer through ' +
    'targeted questions and hints. Never state the final answer directly. Be encouraging ' +
    'and concise.',
  temperature: 0.7,
  // tools: [getStudentProgress, getCurriculum, getConceptMastery]  // Phase 2/3
})
