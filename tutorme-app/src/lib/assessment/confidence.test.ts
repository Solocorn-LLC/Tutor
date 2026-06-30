import { describe, it, expect } from 'vitest'
import { scoreDocumentConfidence } from './confidence'

describe('scoreDocumentConfidence (ASMT-2)', () => {
  it('Low when nothing parsed', () => {
    const r = scoreDocumentConfidence([], 'some text')
    expect(r.level).toBe('Low')
    expect(r.reasons[0]).toMatch(/No questions/)
  })

  it('High for a clean paper: references + marks present, numbering intact', () => {
    const items = [
      { questionLabel: '1', marks: 2 },
      { questionLabel: '2', marks: 3 },
      { questionLabel: '3', marks: 5 },
    ]
    const r = scoreDocumentConfidence(items, 'a'.repeat(200))
    expect(r.level).toBe('High')
    expect(r.reasons).toEqual([])
  })

  it('Medium when some marks are missing but structure is mostly intact', () => {
    const items = [
      { questionLabel: '1', marks: 2 },
      { questionLabel: '2', marks: 3 },
      { questionLabel: '3' }, // no marks
      { questionLabel: '4' }, // no marks
    ]
    const r = scoreDocumentConfidence(items, 'a'.repeat(200))
    expect(r.level).toBe('Medium')
    expect(r.reasons.join(' ')).toMatch(/Mark allocations/)
  })

  it('Low when references are largely missing', () => {
    const items = [{ marks: 2 }, { marks: 3 }, { questionLabel: '3', marks: 1 }]
    const r = scoreDocumentConfidence(items, 'a'.repeat(200))
    expect(r.level).toBe('Low')
  })

  it('Low on a big numbering gap (missing pages)', () => {
    const items = [
      { questionLabel: '1', marks: 1 },
      { questionLabel: '2', marks: 1 },
      { questionLabel: '9', marks: 1 }, // gap of 6
    ]
    const r = scoreDocumentConfidence(items, 'a'.repeat(200))
    expect(r.level).toBe('Low')
    expect(r.signals.numberingGaps).toBeGreaterThanOrEqual(2)
  })
})
