import { describe, it, expect } from 'vitest'
import {
  resolvePciComposition,
  assessmentVariantAddendum,
  taskVariantAddendum,
  guardrailSystemPrompt,
  ASSESSMENT_SYSTEM_PROMPT,
  ASSESSMENT_GUARDRAILS,
  TASK_PCI_SYSTEM_PROMPT,
  TASK_PCI_GUARDRAILS,
} from './index'

describe('resolvePciComposition', () => {
  it('returns undefined when there are no typed questions', () => {
    expect(resolvePciComposition([])).toBeUndefined()
    expect(resolvePciComposition([null, undefined])).toBeUndefined()
  })

  it('classifies an all-closed set as objective', () => {
    expect(resolvePciComposition(['mcq', 'true_false', 'fill_blank', 'matching'])).toBe('objective')
  })

  it('classifies an all-open set as free_response', () => {
    expect(resolvePciComposition(['short', 'long', 'long'])).toBe('free_response')
  })

  it('applies the 80% closed threshold for objective', () => {
    // 4 closed + 1 open = 80% closed → objective
    expect(resolvePciComposition(['mcq', 'mcq', 'mcq', 'mcq', 'long'])).toBe('objective')
    // 3 closed + 1 open = 75% closed → not objective (and open 25% < 60%) → mixed
    expect(resolvePciComposition(['mcq', 'mcq', 'mcq', 'long'])).toBe('mixed')
  })

  it('applies the 60% open threshold for free_response', () => {
    // 3 open + 2 closed = 60% open → free_response
    expect(resolvePciComposition(['long', 'short', 'long', 'mcq', 'mcq'])).toBe('free_response')
  })

  it('classifies a balanced mix as mixed', () => {
    expect(resolvePciComposition(['mcq', 'long'])).toBe('mixed')
  })

  it('ignores null/undefined entries when computing ratios', () => {
    expect(resolvePciComposition(['mcq', null, 'mcq', undefined, 'mcq', 'mcq'])).toBe('objective')
  })
})

describe('assessmentVariantAddendum', () => {
  it('is empty for no variant / empty variant', () => {
    expect(assessmentVariantAddendum()).toBe('')
    expect(assessmentVariantAddendum({})).toBe('')
    expect(assessmentVariantAddendum({ documentKind: 'question_paper' })).toBe('')
  })

  it('includes a composition block when composition is set', () => {
    expect(assessmentVariantAddendum({ composition: 'objective' })).toContain('OBJECTIVE-HEAVY')
    expect(assessmentVariantAddendum({ composition: 'free_response' })).toContain('FREE-RESPONSE')
    expect(assessmentVariantAddendum({ composition: 'mixed' })).toContain('MIXED assessment')
  })

  it('adds the study-material note only for study_material', () => {
    expect(assessmentVariantAddendum({ composition: 'objective' })).not.toContain('GENERATED from')
    expect(
      assessmentVariantAddendum({ composition: 'objective', documentKind: 'study_material' })
    ).toContain('GENERATED from')
  })

  it('marks the block as steering-only so it cannot read as a new rule', () => {
    expect(assessmentVariantAddendum({ composition: 'mixed' })).toContain('steering only')
  })
})

describe('guardrailSystemPrompt with variants', () => {
  const variants = [
    undefined,
    { composition: 'objective' as const },
    { composition: 'free_response' as const },
    { composition: 'mixed' as const },
    { composition: 'free_response' as const, documentKind: 'study_material' as const },
  ]

  it('never drops a guardrail rule for any assessment variant (additive only)', () => {
    for (const v of variants) {
      const prompt = guardrailSystemPrompt('assessment', v)
      // the full base prompt is always a prefix
      expect(prompt.startsWith(ASSESSMENT_SYSTEM_PROMPT)).toBe(true)
      // every ASMT rule id survives
      for (const rule of ASSESSMENT_GUARDRAILS) {
        expect(prompt).toContain(rule.id)
      }
    }
  })

  it('returns the base assessment prompt verbatim when no variant is given', () => {
    expect(guardrailSystemPrompt('assessment')).toBe(ASSESSMENT_SYSTEM_PROMPT)
  })

  it('appends the matching addendum for a variant', () => {
    expect(guardrailSystemPrompt('assessment', { composition: 'objective' })).toContain(
      'OBJECTIVE-HEAVY'
    )
  })

  it('ignores composition for tasks (task answering is free-form)', () => {
    expect(guardrailSystemPrompt('task', { composition: 'objective' })).toBe(TASK_PCI_SYSTEM_PROMPT)
    expect(guardrailSystemPrompt('task', { composition: 'free_response' })).toBe(
      TASK_PCI_SYSTEM_PROMPT
    )
  })
})

describe('taskVariantAddendum / task study-material variant', () => {
  it('is empty unless the source is study_material', () => {
    expect(taskVariantAddendum()).toBe('')
    expect(taskVariantAddendum({})).toBe('')
    expect(taskVariantAddendum({ documentKind: 'question_paper' })).toBe('')
    // composition never triggers a task addendum
    expect(taskVariantAddendum({ composition: 'objective' })).toBe('')
  })

  it('adds a study-material note for a study_material task', () => {
    const addendum = taskVariantAddendum({ documentKind: 'study_material' })
    expect(addendum).toContain('GENERATED from')
    expect(addendum).toContain('steering only')
  })

  it('returns the base task prompt verbatim when no variant / no source', () => {
    expect(guardrailSystemPrompt('task')).toBe(TASK_PCI_SYSTEM_PROMPT)
    expect(guardrailSystemPrompt('task', { documentKind: 'question_paper' })).toBe(
      TASK_PCI_SYSTEM_PROMPT
    )
  })

  it('appends the note for a study_material task without dropping any TASK rule', () => {
    const prompt = guardrailSystemPrompt('task', { documentKind: 'study_material' })
    expect(prompt.startsWith(TASK_PCI_SYSTEM_PROMPT)).toBe(true)
    expect(prompt).toContain('GENERATED from')
    for (const rule of TASK_PCI_GUARDRAILS) {
      expect(prompt).toContain(rule.id)
    }
  })
})
