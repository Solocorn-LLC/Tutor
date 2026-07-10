import { describe, it, expect } from 'vitest'
import { normalizePciSpec, pciSpecToText } from './pci-spec'

describe('normalizePciSpec (TASK-6)', () => {
  it('keeps only recognized, tutor-defined fields', () => {
    const spec = normalizePciSpec({
      evaluationLogic: 'Award method marks even if the final answer is wrong.',
      instructionalTone: 'Encouraging',
      bogusField: 'ignored',
    })
    expect(spec).toEqual({
      evaluationLogic: 'Award method marks even if the final answer is wrong.',
      instructionalTone: 'Encouraging',
    })
  })

  it('drops fabricated placeholders (unspecified / N/A / none / empty)', () => {
    const spec = normalizePciSpec({
      evaluationLogic: 'Exact match.',
      retryPolicy: 'unspecified',
      partialUnderstandingBehavior: 'N/A',
      noResponseBehavior: '   ',
      instructionalTone: 'none',
    })
    expect(spec).toEqual({ evaluationLogic: 'Exact match.' })
  })

  it('returns null when nothing is defined (or input is not an object)', () => {
    expect(normalizePciSpec({ retryPolicy: 'unspecified' })).toBeNull()
    expect(normalizePciSpec({})).toBeNull()
    expect(normalizePciSpec(null)).toBeNull()
    expect(normalizePciSpec('nope')).toBeNull()
    expect(normalizePciSpec(['a'])).toBeNull()
  })
})

describe('pciSpecToText (TASK-6)', () => {
  it('renders defined fields as labelled lines in canonical order', () => {
    const text = pciSpecToText({
      // deliberately out of canonical order to prove ordering is enforced
      instructionalTone: 'Encouraging',
      evaluationLogic: 'Award method marks.',
      incorrectResponseBehavior: 'Give a socratic hint.',
    })
    expect(text).toBe(
      [
        'Evaluation logic: Award method marks.',
        'Incorrect-response behaviour: Give a socratic hint.',
        'Instructional tone: Encouraging',
      ].join('\n')
    )
  })

  it('returns "" for null/empty specs', () => {
    expect(pciSpecToText(null)).toBe('')
    expect(pciSpecToText(undefined)).toBe('')
    expect(pciSpecToText({})).toBe('')
  })
})
