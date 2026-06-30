import { describe, it, expect } from 'vitest'
import { toStudentDmiItem } from './student-dmi'

describe('toStudentDmiItem (ASMT-10/13 layer separation)', () => {
  const base = { id: 'q1', questionNumber: 1, questionText: 'Match them' }

  it('never emits pairs/regions/answer-key fields', () => {
    const safe = toStudentDmiItem({
      ...base,
      questionType: 'matching',
      pairs: [
        { left: 'Dog', right: 'Bark' },
        { left: 'Cat', right: 'Meow' },
      ],
      // @ts-expect-error — extra evaluation fields must not survive the projection
      answer: 'Dog=Bark;Cat=Meow',
      rubric: 'secret',
      regions: [{ x: 0, y: 0, w: 1, h: 1 }],
    })
    expect('pairs' in safe).toBe(false)
    expect('regions' in safe).toBe(false)
    expect('answer' in safe).toBe(false)
    expect('rubric' in safe).toBe(false)
  })

  it('keeps prompts in order but a SORTED bank (no pairing leak)', () => {
    const safe = toStudentDmiItem({
      ...base,
      questionType: 'matching',
      pairs: [
        { left: 'Dog', right: 'Woof' },
        { left: 'Cat', right: 'Meow' },
        { left: 'Cow', right: 'Moo' },
      ],
    })
    expect(safe.matchPrompts).toEqual(['Dog', 'Cat', 'Cow']) // prompt order preserved
    expect(safe.matchBank).toEqual(['Meow', 'Moo', 'Woof']) // sorted — not the answer order
  })

  it('does not add match fields to non-matching types', () => {
    const safe = toStudentDmiItem({ ...base, questionType: 'mcq', options: ['a', 'b'] })
    expect(safe.matchPrompts).toBeUndefined()
    expect(safe.matchBank).toBeUndefined()
    expect(safe.options).toEqual(['a', 'b'])
  })
})

describe('toStudentDmiItem — section passthrough (ASMT-4)', () => {
  it('carries the section title (delivery-layer, safe to show)', () => {
    const safe = toStudentDmiItem({
      id: 'q1',
      questionNumber: 1,
      questionText: 'Q',
      questionType: 'short',
      // @ts-expect-error structural item carries section
      section: 'Section A',
    })
    expect(safe.section).toBe('Section A')
  })
})
