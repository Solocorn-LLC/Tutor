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

  it('marks wrong/blank answers incorrect (conservative)', () => {
    const r = autoGradeDmi(items, { q1: 'London', q2: '', q3: 'respiration' })
    expect(r.score).toBe(0)
    expect(r.questionResults?.q1.correct).toBe(false)
  })

  it('does not over-credit a single word against a long expected answer', () => {
    const r = autoGradeDmi([{ id: 'q1', answer: 'Photosynthesis converts light into energy' }], {
      q1: 'light',
    })
    expect(r.score).toBe(0)
  })

  it('computes a partial score', () => {
    const r = autoGradeDmi(items, { q1: 'Paris', q2: '7', q3: 'photosynthesis' })
    expect(r.score).toBe(67) // 2/3
  })
})
