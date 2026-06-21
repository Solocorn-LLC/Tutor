import { describe, it, expect } from 'vitest'
import { autoGradeDmi } from './auto-grade'

const items = [
  { id: 'q1', answer: 'Paris' },
  { id: 'q2', answer: '42' },
  { id: 'q3', answer: 'Photosynthesis' },
]

describe('autoGradeDmi', () => {
  it('returns null score when there is no answer key', () => {
    const r = autoGradeDmi([{ id: 'q1' }, { id: 'q2', answer: '' }], { q1: 'x' })
    expect(r.score).toBeNull()
    expect(r.gradable).toBe(0)
  })

  it('credits exact (normalized) matches', () => {
    const r = autoGradeDmi(items, { q1: 'paris', q2: '42', q3: 'Photosynthesis.' })
    expect(r.score).toBe(100)
    expect(r.correct).toBe(3)
  })

  it('credits answers that contain the full expected answer', () => {
    const r = autoGradeDmi(items, {
      q1: 'It is Paris',
      q2: 'the answer is 42',
      q3: 'photosynthesis',
    })
    expect(r.score).toBe(100)
  })

  it('marks wrong/blank answers to short-key items incorrect (conservative)', () => {
    const r = autoGradeDmi(items, { q1: 'London', q2: '', q3: 'respiration' })
    expect(r.score).toBe(0)
    expect(r.needsReview).toBe(0)
    const q1 = r.questionResults?.find(x => x.questionId === 'q1')
    expect(q1?.correct).toBe(false)
  })

  it('returns the canonical QuestionResultItem array shape without the answer key', () => {
    const r = autoGradeDmi(items, { q1: 'Paris', q2: '7', q3: 'photosynthesis' })
    expect(Array.isArray(r.questionResults)).toBe(true)
    expect(r.questionResults).toHaveLength(3)
    const q1 = r.questionResults?.find(x => x.questionId === 'q1')
    expect(q1).toMatchObject({
      questionId: 'q1',
      correct: true,
      pointsEarned: 100,
      pointsMax: 100,
      selectedAnswer: 'Paris',
    })
    // The expected answer key must never be embedded (questionResults is
    // student-readable).
    expect(JSON.stringify(r.questionResults)).not.toContain('Photosynthesis')
  })

  it('excludes and flags an open-ended item that did not reproduce the long key', () => {
    const r = autoGradeDmi([{ id: 'q1', answer: 'Photosynthesis converts light into energy' }], {
      q1: 'light',
    })
    // Not credited, not penalized — set aside for tutor review.
    expect(r.score).toBeNull()
    expect(r.needsReview).toBe(1)
    const q1 = r.questionResults?.find(x => x.questionId === 'q1')
    expect(q1).toMatchObject({ correct: false, pointsMax: 0, needsReview: true })
  })

  it('still credits a long key when the student reproduces it', () => {
    const r = autoGradeDmi([{ id: 'q1', answer: 'Photosynthesis converts light into energy' }], {
      q1: 'photosynthesis converts light into energy',
    })
    expect(r.score).toBe(100)
    expect(r.needsReview).toBe(0)
  })

  it('scores short items and excludes open-ended ones from the same task', () => {
    const mixed = [
      { id: 'q1', answer: 'Paris' }, // short, correct
      { id: 'q2', answer: 'Berlin' }, // short, wrong
      { id: 'q3', answer: 'Explain in detail how mitosis differs from meiosis' }, // open-ended
    ]
    const r = autoGradeDmi(mixed, { q1: 'Paris', q2: 'London', q3: 'they are both cell division' })
    // Only the two short items count: 1 of 2 -> 50. The essay is flagged.
    expect(r.score).toBe(50)
    expect(r.needsReview).toBe(1)
    expect(r.gradable).toBe(3)
  })

  it('computes a partial score', () => {
    const r = autoGradeDmi(items, { q1: 'Paris', q2: '7', q3: 'photosynthesis' })
    expect(r.score).toBe(67) // 2/3
    expect(r.needsReview).toBe(0)
  })
})
