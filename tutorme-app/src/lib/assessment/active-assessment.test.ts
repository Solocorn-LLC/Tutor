import { describe, it, expect } from 'vitest'
import {
  withAssessmentIntegrity,
  hasActiveAssessment,
  ASSESSMENT_INTEGRITY_DIRECTIVE,
} from './active-assessment'

describe('withAssessmentIntegrity', () => {
  it('prepends the integrity directive when an assessment is active', () => {
    const out = withAssessmentIntegrity('BASE PROMPT', true)
    expect(out.startsWith(ASSESSMENT_INTEGRITY_DIRECTIVE)).toBe(true)
    expect(out).toContain('BASE PROMPT')
    expect(out).toContain('ONLY give procedural clarification')
  })

  it('leaves the prompt untouched when no assessment is active', () => {
    expect(withAssessmentIntegrity('BASE PROMPT', false)).toBe('BASE PROMPT')
  })
})

describe('hasActiveAssessment', () => {
  it('short-circuits to false for an empty studentId (no DB query)', async () => {
    await expect(hasActiveAssessment('')).resolves.toBe(false)
  })
})
