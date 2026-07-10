import { describe, expect, it } from 'vitest'
import { assessmentDmiReadiness } from './dmi-readiness'

describe('assessmentDmiReadiness', () => {
  it('is not ready with no questions', () => {
    const r = assessmentDmiReadiness([])
    expect(r).toEqual({ hasQuestions: false, totalMarks: 0, hasAnswerKey: false, ready: false })
  })

  it('is not ready when there are no marks (even with an answer key)', () => {
    const r = assessmentDmiReadiness([{ answer: '42' }, { rubric: 'method marks' }])
    expect(r.hasQuestions).toBe(true)
    expect(r.totalMarks).toBe(0)
    expect(r.hasAnswerKey).toBe(true)
    expect(r.ready).toBe(false)
  })

  it('is not ready when marks exist but there is no answer key/rubric (e.g. a bare question paper)', () => {
    const r = assessmentDmiReadiness([
      { marks: 3, answer: '', rubric: '' },
      { marks: 2, answer: '   ' },
    ])
    expect(r.totalMarks).toBe(5)
    expect(r.hasAnswerKey).toBe(false)
    expect(r.ready).toBe(false)
  })

  it('is ready with questions + positive marks + an answer OR rubric', () => {
    const r = assessmentDmiReadiness([
      { marks: 3, answer: 'x = 4' },
      { marks: 2, rubric: 'award method marks' },
    ])
    expect(r.totalMarks).toBe(5)
    expect(r.hasAnswerKey).toBe(true)
    expect(r.ready).toBe(true)
  })

  it('ignores non-positive / non-numeric marks when totalling', () => {
    const r = assessmentDmiReadiness([
      { marks: 0, answer: 'a' },
      { marks: -1, answer: 'b' },
      { marks: null, rubric: 'c' },
      { marks: 4, answer: 'd' },
    ])
    expect(r.totalMarks).toBe(4)
    expect(r.ready).toBe(true)
  })

  it('a rubric alone (no model answer) still counts as an answer key', () => {
    const r = assessmentDmiReadiness([{ marks: 5, rubric: 'one mark per valid point' }])
    expect(r.hasAnswerKey).toBe(true)
    expect(r.ready).toBe(true)
  })
})
