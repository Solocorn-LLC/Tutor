/**
 * Tutor agent — faithful to the LIVE tutor-chat path.
 *
 * The canonical tutor entrypoint is `runTutorChat` (lib/agents/tutor-chat-service),
 * which builds its prompt with `buildCompletePrompt` and then layers TASK-6
 * (`withTaskPci`) and ASMT-15 (`withAssessmentIntegrity`) — in that order, so the
 * integrity directive stays highest.
 *
 * The initial Phase-3a port delegated to a DIFFERENT, older builder
 * (`buildSystemPrompt`, lib/agents/tutor/prompts) — the two prompts CONFLICT.
 * Per the single-source-of-truth rule we keep the live `buildCompletePrompt`
 * chain and drop the stale one here, and we preserve the assessment-integrity
 * constraint: dropping it would let the tutor help a student during a live
 * assessment (an academic-integrity regression).
 *
 * NOTE: `runTutorChat` remains the canonical runtime for now. This config exists
 * so the kit's tutor is a FAITHFUL mirror (not a landmine) ahead of any route
 * cutover; the cutover itself is a separate, flag-gated, reviewed PR.
 */
import { buildCompletePrompt, type PromptConfig } from '@/lib/ai/teaching-prompts/prompt-builder'
import { withTaskPci } from '@/lib/assessment/task-pci-context'
import { withAssessmentIntegrity } from '@/lib/assessment/active-assessment'
import type { PciSpec } from '@/lib/assessment/pci-spec'
import { registerAgent } from '../registry'
import type { AgentDefinition } from '../types'

/** Prompt inputs the tutor agent expects (mirrors `runTutorChat`'s inputs). */
export interface TutorAgentContext {
  promptConfig: PromptConfig
  taskPci?: string | null
  taskPciSpec?: PciSpec | null
  assessmentActive?: boolean
}

export const tutorAgent: AgentDefinition = registerAgent({
  id: 'tutor',
  description: 'Socratic AI tutor — guides students to answers, never gives them directly.',
  systemPrompt: input => {
    const c = (input.context ?? {}) as unknown as TutorAgentContext
    // Same three layers, same order, as runTutorChat: base prompt → task PCI →
    // assessment-integrity on top.
    const base = buildCompletePrompt(c.promptConfig)
    const taskAware = withTaskPci(base, c.taskPci ?? null, c.taskPciSpec ?? null)
    return withAssessmentIntegrity(taskAware, c.assessmentActive === true)
  },
  temperature: 0.7,
  maxTokens: 2048,
})
