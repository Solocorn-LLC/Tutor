import { describe, it, expect } from 'vitest'
import { buildTaskPciDirective, withTaskPci } from './task-pci-context'

describe('buildTaskPciDirective (TASK-6)', () => {
  it('returns "" when neither free-text nor spec is present', () => {
    expect(buildTaskPciDirective(null, null)).toBe('')
    expect(buildTaskPciDirective('   ', {})).toBe('')
    expect(buildTaskPciDirective(undefined, undefined)).toBe('')
  })

  it('includes the structured spec and the free-text notes when present', () => {
    const out = buildTaskPciDirective('Be gentle with beginners.', {
      evaluationLogic: 'Award method marks.',
    })
    expect(out).toContain('TASK GUIDANCE')
    expect(out).toContain('Structured guidance:')
    expect(out).toContain('Evaluation logic: Award method marks.')
    expect(out).toContain("Tutor's notes:")
    expect(out).toContain('Be gentle with beginners.')
    // Never overrides the integrity rule.
    expect(out).toContain('never solve an in-progress assessment')
  })

  it('works with only free-text or only a spec', () => {
    expect(buildTaskPciDirective('notes only', null)).toContain('notes only')
    expect(buildTaskPciDirective('notes only', null)).not.toContain('Structured guidance:')
    expect(buildTaskPciDirective(null, { instructionalTone: 'Warm' })).toContain(
      'Instructional tone: Warm'
    )
  })

  it('caps very long free-text notes', () => {
    const long = 'x'.repeat(9000)
    const out = buildTaskPciDirective(long, null)
    // 4000-char cap on the notes body (plus the surrounding directive text).
    expect(out.length).toBeLessThan(5000)
  })
})

describe('withTaskPci (TASK-6)', () => {
  it('prepends the directive above the base prompt when PCI is present', () => {
    const base = 'BASE SYSTEM PROMPT'
    const out = withTaskPci(base, 'help kindly', { evaluationLogic: 'Exact match.' })
    expect(out.endsWith(base)).toBe(true)
    expect(out.indexOf('TASK GUIDANCE')).toBeLessThan(out.indexOf(base))
  })

  it('is a no-op when there is no task PCI', () => {
    const base = 'BASE SYSTEM PROMPT'
    expect(withTaskPci(base, null, null)).toBe(base)
    expect(withTaskPci(base, '', {})).toBe(base)
  })
})
