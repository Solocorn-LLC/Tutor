import { describe, it, expect } from 'vitest'
import { dmiOptionLetter, dmiSelectedOptionLetters } from './mcq-answer'

const OPTS = ['alpha', 'beta', 'gamma', 'delta']

describe('dmiOptionLetter', () => {
  it('maps index → A, B, C, D', () => {
    expect([0, 1, 2, 3].map(dmiOptionLetter)).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('dmiSelectedOptionLetters', () => {
  it('reads a single letter (any case)', () => {
    expect([...dmiSelectedOptionLetters('B', OPTS)]).toEqual(['B'])
    expect([...dmiSelectedOptionLetters('b', OPTS)]).toEqual(['B'])
  })

  it('reads multiple letters separated by commas or spaces', () => {
    expect([...dmiSelectedOptionLetters('A, C', OPTS)].sort()).toEqual(['A', 'C'])
    expect([...dmiSelectedOptionLetters('A C', OPTS)].sort()).toEqual(['A', 'C'])
    expect([...dmiSelectedOptionLetters('a,d', OPTS)].sort()).toEqual(['A', 'D'])
  })

  it('matches by exact option text', () => {
    expect([...dmiSelectedOptionLetters('gamma', OPTS)]).toEqual(['C'])
    expect([...dmiSelectedOptionLetters('GAMMA', OPTS)]).toEqual(['C'])
  })

  it('returns empty for blank / unmatched answers', () => {
    expect([...dmiSelectedOptionLetters('', OPTS)]).toEqual([])
    expect([...dmiSelectedOptionLetters(undefined, OPTS)]).toEqual([])
    expect([...dmiSelectedOptionLetters('Z', OPTS)]).toEqual([])
  })

  it('does not select a letter beyond the option count', () => {
    // Only 2 options → only A/B are valid even if the answer says "C".
    expect([...dmiSelectedOptionLetters('C', ['x', 'y'])]).toEqual([])
  })
})
