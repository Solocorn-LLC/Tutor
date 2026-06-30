import { describe, it, expect } from 'vitest'
import { findOpenItemsMissingRubric, reverifyAssessment } from './assessment-gates'

describe('findOpenItemsMissingRubric (ASMT-8)', () => {
  it('flags open (short/long) questions with no rubric, by label', () => {
    const missing = findOpenItemsMissingRubric([
      { questionType: 'long', questionLabel: '1(a)', rubric: '' },
      { questionType: 'short', questionNumber: 2, rubric: '   ' },
    ])
    expect(missing).toEqual(['1(a)', 'Q2'])
  })

  it('passes when open questions have a rubric (including a manual-marking note)', () => {
    expect(
      findOpenItemsMissingRubric([
        { questionType: 'long', questionLabel: '1', rubric: 'Award 2 for method, 1 for answer.' },
        {
          questionType: 'short',
          questionLabel: '2',
          rubric: 'Manual marking — tutor grades by hand.',
        },
      ])
    ).toEqual([])
  })

  it('does not gate closed/auto-graded or untyped legacy items', () => {
    expect(
      findOpenItemsMissingRubric([
        { questionType: 'mcq', questionLabel: '1', rubric: '' },
        { questionType: 'fill_blank', questionLabel: '2', rubric: '' },
        { questionType: 'matching', questionLabel: '3', rubric: '' },
        { questionType: undefined, questionLabel: '4', rubric: '' },
      ])
    ).toEqual([])
  })
})

describe('reverifyAssessment (ASMT-12)', () => {
  it('passes a consistent, fully-keyed assessment', () => {
    expect(
      reverifyAssessment([
        { questionType: 'long', questionLabel: '1', rubric: 'award 3' },
        { questionType: 'mcq', questionLabel: '2', answer: 'B' },
        { questionType: 'matching', questionLabel: '3', pairs: [{ left: 'a', right: 'b' }] },
        { questionType: 'hotspot', questionLabel: '4', regions: [{ x: 0, y: 0, w: 1, h: 1 }] },
      ])
    ).toEqual([])
  })

  it('flags duplicate question references (numbering integrity)', () => {
    const issues = reverifyAssessment([
      { questionType: 'mcq', questionLabel: '1(a)', answer: 'A' },
      { questionType: 'mcq', questionLabel: '1a', answer: 'B' }, // same ref normalized
    ])
    expect(issues.some(i => i.kind === 'numbering')).toBe(true)
  })

  it('flags open questions without a rubric and closed questions without an answer key', () => {
    const issues = reverifyAssessment([
      { questionType: 'long', questionLabel: '1', rubric: '' },
      { questionType: 'mcq', questionLabel: '2', answer: '' },
      { questionType: 'matching', questionLabel: '3', pairs: [] },
    ])
    expect(issues.filter(i => i.kind === 'rubric')).toHaveLength(1)
    expect(issues.filter(i => i.kind === 'answer-mapping')).toHaveLength(2)
  })

  it('leaves untyped legacy items lenient (not blocked)', () => {
    expect(reverifyAssessment([{ questionLabel: '1', answer: '' }])).toEqual([])
  })

  it('accepts acceptableVariants as an answer key for closed types', () => {
    expect(
      reverifyAssessment([
        { questionType: 'fill_blank', questionLabel: '1', answer: '', acceptableVariants: ['x'] },
      ])
    ).toEqual([])
  })
})

describe('reverifyAssessment — section consistency (ASMT-4)', () => {
  it('flags a partially-sectioned paper', () => {
    const issues = reverifyAssessment([
      { id: 'a', questionType: 'mcq', questionLabel: '1', answer: 'A', section: 'Section A' },
      { id: 'b', questionType: 'mcq', questionLabel: '2', answer: 'B' }, // no section
    ])
    expect(issues.some(i => i.kind === 'section')).toBe(true)
  })

  it('accepts a fully-sectioned paper', () => {
    const issues = reverifyAssessment([
      { id: 'a', questionType: 'mcq', questionLabel: '1', answer: 'A', section: 'Section A' },
      { id: 'b', questionType: 'mcq', questionLabel: '2', answer: 'B', section: 'Section B' },
    ])
    expect(issues.some(i => i.kind === 'section')).toBe(false)
  })
})
