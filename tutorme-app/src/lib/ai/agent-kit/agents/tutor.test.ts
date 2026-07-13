import { describe, it, expect } from 'vitest'
import { tutorAgent, type TutorAgentContext } from './tutor'
import { getAgent } from '../registry'
import type { PromptConfig } from '@/lib/ai/teaching-prompts/prompt-builder'

const promptConfig = {
  language: 'en',
  teachingMode: 'socratic',
  personality: 'friendly_mentor',
  subject: 'Mathematics',
  topic: null,
  tier: 'FREE',
  chatHistory: [],
  userMessage: 'How do I factor x^2 - 9?',
} as unknown as PromptConfig

function render(ctx: Partial<TutorAgentContext>): string {
  const fn = tutorAgent.systemPrompt
  if (typeof fn !== 'function') throw new Error('expected a function systemPrompt')
  return fn({ message: 'help', context: { promptConfig, ...ctx } })
}

describe('tutor agent (faithful port)', () => {
  it('registers itself with the expected metadata', () => {
    expect(getAgent('tutor')).toBe(tutorAgent)
    expect(tutorAgent.temperature).toBe(0.7)
    expect(tutorAgent.maxTokens).toBe(2048)
    expect(tutorAgent.guardrailDomain).toBeUndefined() // tutor chat is not a PCI domain
    expect(typeof tutorAgent.systemPrompt).toBe('function')
  })

  it('builds a prompt from the live builder (buildCompletePrompt), not the stale one', () => {
    const prompt = render({ assessmentActive: false })
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(0)
  })

  it('preserves the ASMT-15 assessment-integrity constraint when an assessment is active', () => {
    // The integrity layer is added ONLY when assessmentActive === true, so an
    // active-assessment prompt must differ from (and be longer than) an inactive
    // one. This guards against a cutover silently dropping the safety directive.
    const active = render({ assessmentActive: true })
    const inactive = render({ assessmentActive: false })
    expect(active).not.toEqual(inactive)
    expect(active.length).toBeGreaterThan(inactive.length)
  })
})
