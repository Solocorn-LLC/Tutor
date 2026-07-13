import { describe, it, expect } from 'vitest'
import { tutorAssistPrompt, type TutorAssistKind } from './tutor-assist-service'

describe('tutorAssistPrompt', () => {
  const kinds: TutorAssistKind[] = ['general', 'teaching', 'builder', 'analytics']

  it('returns a distinct, specialised prompt for each tool', () => {
    const prompts = kinds.map(k => tutorAssistPrompt(k))
    expect(new Set(prompts).size).toBe(kinds.length) // all four differ
  })

  it('every prompt keeps the direct-answer framing (not the student Socratic one)', () => {
    for (const k of kinds) {
      const p = tutorAssistPrompt(k)
      expect(p).toContain('TEACHER, not a student')
      expect(p).toContain('answer directly')
    }
  })

  it('specialisations mention their focus', () => {
    expect(tutorAssistPrompt('teaching')).toMatch(/poll|discussion|class/i)
    expect(tutorAssistPrompt('builder')).toMatch(/rubric|marking policy|PCI/i)
    expect(tutorAssistPrompt('analytics')).toMatch(/at-risk|trends|analytics/i)
  })

  it('falls back to general for an unknown kind', () => {
    expect(tutorAssistPrompt(undefined)).toBe(tutorAssistPrompt('general'))
  })
})
