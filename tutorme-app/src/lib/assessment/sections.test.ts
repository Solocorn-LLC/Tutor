import { describe, it, expect } from 'vitest'
import { deriveSections, deriveTotalMarks, hasPartialSectioning } from './sections'

describe('deriveTotalMarks', () => {
  it('sums marks, defaulting unmarked questions to 1', () => {
    expect(deriveTotalMarks([{ id: 'a', marks: 5 }, { id: 'b' }, { id: 'c', marks: 2 }])).toBe(8)
  })
})

describe('deriveSections', () => {
  it('groups by section tag in first-appearance order with summed marks', () => {
    const secs = deriveSections([
      { id: 'a', section: 'Section A', marks: 2 },
      { id: 'b', section: 'Section A', marks: 3 },
      { id: 'c', section: 'Section B', marks: 5 },
    ])
    expect(secs.map(s => s.title)).toEqual(['Section A', 'Section B'])
    expect(secs[0]).toMatchObject({ marks: 5, questionIds: ['a', 'b'] })
    expect(secs[1]).toMatchObject({ marks: 5, questionIds: ['c'] })
  })

  it('returns [] for an unsectioned paper', () => {
    expect(deriveSections([{ id: 'a', marks: 1 }, { id: 'b' }])).toEqual([])
  })
})

describe('hasPartialSectioning', () => {
  it('flags a partially-sectioned paper', () => {
    expect(hasPartialSectioning([{ id: 'a', section: 'A' }, { id: 'b' }])).toBe(true)
  })
  it('is false when fully sectioned or fully unsectioned', () => {
    expect(
      hasPartialSectioning([
        { id: 'a', section: 'A' },
        { id: 'b', section: 'B' },
      ])
    ).toBe(false)
    expect(hasPartialSectioning([{ id: 'a' }, { id: 'b' }])).toBe(false)
  })
})
