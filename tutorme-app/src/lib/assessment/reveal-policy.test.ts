import { describe, it, expect } from 'vitest'
import { revealPolicyToDeployMode } from './reveal-policy'

describe('revealPolicyToDeployMode', () => {
  it('maps hidden / never phrasings', () => {
    expect(revealPolicyToDeployMode('Never reveal the answer')).toBe('hidden')
    expect(revealPolicyToDeployMode('Keep the answer hidden')).toBe('hidden')
    expect(revealPolicyToDeployMode("Don't reveal answers")).toBe('hidden')
  })

  it('maps after-submit / after-attempt phrasings', () => {
    expect(revealPolicyToDeployMode('Reveal after the final attempt')).toBe('after_submit')
    expect(revealPolicyToDeployMode('Show it once they submit')).toBe('after_submit')
    expect(revealPolicyToDeployMode('Only on the results screen')).toBe('after_submit')
  })

  it('maps instant phrasings', () => {
    expect(revealPolicyToDeployMode('Show the answer immediately')).toBe('instant')
    expect(revealPolicyToDeployMode('Reveal right away')).toBe('instant')
  })

  it('maps student-choice phrasings', () => {
    expect(revealPolicyToDeployMode("Student's choice")).toBe('student_choice')
    expect(revealPolicyToDeployMode('Let the student decide when to see it')).toBe('student_choice')
  })

  it('returns null for empty or unmappable policies', () => {
    expect(revealPolicyToDeployMode('')).toBeNull()
    expect(revealPolicyToDeployMode(undefined)).toBeNull()
    expect(revealPolicyToDeployMode('Mark strictly to the rubric')).toBeNull()
  })

  it('prioritizes hidden over after-submit when both are implied', () => {
    // "never" wins even if "after" appears.
    expect(revealPolicyToDeployMode('Never reveal, not even after submit')).toBe('hidden')
  })
})
