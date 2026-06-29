import { describe, it, expect } from 'vitest'
import { parseMatches, parseDetection } from './scheme-response'

const valid = new Map([
  ['1a', '1(a)'],
  ['1b', '1(b)'],
  ['2', '2'],
])

describe('parseMatches', () => {
  it('echoes the DMI canonical reference for known matches', () => {
    const out = parseMatches(
      JSON.stringify({ matches: [{ ref: '1 (a)', answer: 'Paris' }] }),
      valid
    )
    expect(out).toEqual([{ ref: '1(a)', answer: 'Paris' }])
  })

  it('tolerates a model that still emits `number`', () => {
    const out = parseMatches(JSON.stringify({ matches: [{ number: 2, answer: 'B' }] }), valid)
    expect(out[0]).toMatchObject({ ref: '2', answer: 'B' })
  })

  it('marks references not in the DMI as extra (when plausible)', () => {
    const out = parseMatches(
      JSON.stringify({
        matches: [
          { ref: '2', answer: 'keep' },
          { ref: '3(c)', answer: 'new' }, // plausible extra
          { ref: 'see the notes', answer: 'noise' }, // not a ref → dropped
        ],
      }),
      valid
    )
    expect(out.find(m => m.ref === '2')?.extra).toBeUndefined()
    expect(out.find(m => m.ref === '3(c)')?.extra).toBe(true)
    expect(out.find(m => m.ref === 'see the notes')).toBeUndefined()
  })

  it('drops empty answers and de-dupes by reference', () => {
    const out = parseMatches(
      JSON.stringify({
        matches: [
          { ref: '1(a)', answer: '' }, // empty → dropped
          { ref: '1(b)', answer: 'X' },
          { ref: '1 b', answer: 'dup' }, // same key as 1(b) → dropped
        ],
      }),
      valid
    )
    expect(out).toEqual([{ ref: '1(b)', answer: 'X' }])
  })

  it('cleans variants: trims, de-dupes, and drops ones echoing the answer', () => {
    const out = parseMatches(
      JSON.stringify({
        matches: [
          { ref: '2', answer: 'Paris', variants: ['Paris', ' paris ', 'PARIS', 'Lutetia'] },
        ],
      }),
      valid
    )
    expect(out[0].variants).toEqual(['Lutetia'])
  })

  it('keeps positive marks, drops zero/negative/non-numeric', () => {
    expect(
      parseMatches(JSON.stringify({ matches: [{ ref: '2', answer: 'x', marks: 3 }] }), valid)[0]
        .marks
    ).toBe(3)
    expect(
      parseMatches(JSON.stringify({ matches: [{ ref: '2', answer: 'x', marks: 0 }] }), valid)[0]
        .marks
    ).toBeUndefined()
  })

  it('parses through code fences and surrounding prose', () => {
    const raw = 'Here:\n```json\n{ "matches": [ { "ref": "2", "answer": "B" } ] }\n```\ndone'
    expect(parseMatches(raw, valid)[0]).toMatchObject({ ref: '2', answer: 'B' })
  })

  it('returns [] on malformed / non-JSON', () => {
    expect(parseMatches('not json', valid)).toEqual([])
    expect(parseMatches(JSON.stringify({ matches: 'nope' }), valid)).toEqual([])
  })
})

describe('parseDetection', () => {
  it('extracts and trims board + subject', () => {
    expect(
      parseDetection(JSON.stringify({ examBody: ' AP ', subject: ' Calculus AB ', matches: [] }))
    ).toEqual({ examBody: 'AP', subject: 'Calculus AB' })
  })

  it('returns undefined fields when empty/absent', () => {
    expect(parseDetection(JSON.stringify({ matches: [] }))).toEqual({
      examBody: undefined,
      subject: undefined,
    })
  })

  it('returns {} on malformed input', () => {
    expect(parseDetection('garbage')).toEqual({})
  })
})
