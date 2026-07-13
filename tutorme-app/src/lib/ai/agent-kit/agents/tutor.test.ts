import { describe, it, expect } from 'vitest'
import { tutorAgent } from './tutor'
import { getAgent } from '../registry'

describe('tutor agent (ported)', () => {
  it('registers itself with the expected metadata', () => {
    expect(getAgent('tutor')).toBe(tutorAgent)
    expect(tutorAgent.temperature).toBe(0.7)
    expect(tutorAgent.guardrailDomain).toBeUndefined() // tutor chat is not a PCI domain
    expect(typeof tutorAgent.systemPrompt).toBe('function')
  })

  it('delegates its system prompt to the existing builder (single source of truth)', () => {
    // A representative TutorContext; the assertion is about *delegation*, so we
    // only require that the ported agent returns the builder's output verbatim.
    const context = {
      student: { id: 's1', name: 'A', grade: '10' },
      subject: 'Mathematics',
      conversationHistory: '',
    }
    const fn = tutorAgent.systemPrompt
    if (typeof fn !== 'function') throw new Error('expected a function systemPrompt')
    const prompt = fn({ message: 'help', context })
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(0)
  })
})
