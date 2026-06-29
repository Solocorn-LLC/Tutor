import { describe, it, expect } from 'vitest'
import {
  refKey,
  extractQuestionRef,
  isPlausibleRef,
  deriveExamContext,
  EXAM_BOARDS,
  MAX_EXTRA_QUESTIONS,
} from './marking-scheme'

describe('refKey', () => {
  it('normalizes equivalent reference formats to the same key', () => {
    expect(refKey('1(a)')).toBe('1a')
    expect(refKey('1a')).toBe('1a')
    expect(refKey('1 (a)')).toBe('1a')
    expect(refKey('Q1(a)')).toBe('q1a')
  })
  it('handles nullish input', () => {
    expect(refKey(undefined)).toBe('')
    expect(refKey(null)).toBe('')
    expect(refKey(3)).toBe('3')
  })
})

describe('extractQuestionRef', () => {
  it('pulls the reference from common label shapes', () => {
    expect(extractQuestionRef('Question 1(a)')).toBe('1(a)')
    expect(extractQuestionRef('Question 1(b)')).toBe('1(b)')
    expect(extractQuestionRef('Question 2')).toBe('2')
    expect(extractQuestionRef('Q3b')).toBe('3b')
    expect(extractQuestionRef('1.')).toBe('1')
    expect(extractQuestionRef('Question 3(a)(ii)')).toBe('3(a)(ii)')
    expect(extractQuestionRef('12')).toBe('12')
  })
  it('returns undefined when there is no leading reference (prose)', () => {
    expect(extractQuestionRef('What is the capital of France?')).toBeUndefined()
    expect(extractQuestionRef('')).toBeUndefined()
  })
})

describe('isPlausibleRef', () => {
  it('accepts short digit-led references', () => {
    expect(isPlausibleRef('1')).toBe(true)
    expect(isPlausibleRef('3(c)')).toBe(true)
    expect(isPlausibleRef('12')).toBe(true)
  })
  it('rejects prose or over-long strings', () => {
    expect(isPlausibleRef('the answer is')).toBe(false)
    expect(isPlausibleRef('1234567890123')).toBe(false) // > 12 chars
    expect(isPlausibleRef('')).toBe(false)
  })
})

describe('deriveExamContext', () => {
  it('splits board and subject from a category label', () => {
    expect(deriveExamContext('AP Calculus AB')).toEqual({ examBody: 'AP', subject: 'Calculus AB' })
    expect(deriveExamContext('IGCSE Physics')).toEqual({ examBody: 'IGCSE', subject: 'Physics' })
    expect(deriveExamContext('Cambridge AS Mathematics')).toEqual({
      examBody: 'Cambridge',
      subject: 'AS Mathematics',
    })
  })
  it('detects IGCSE before GCSE (specificity order)', () => {
    expect(deriveExamContext('IGCSE Biology').examBody).toBe('IGCSE')
    expect(deriveExamContext('GCSE Biology').examBody).toBe('GCSE')
  })
  it('falls back to the provided subject when the category is only a board', () => {
    expect(deriveExamContext('IB (International Baccalaureate)', 'My Course')).toEqual({
      examBody: 'IB',
      subject: 'My Course',
    })
  })
  it('returns no board for a plain subject', () => {
    expect(deriveExamContext('Mathematics')).toEqual({ subject: 'Mathematics' })
  })
  it('handles empty / nullish category', () => {
    expect(deriveExamContext('')).toEqual({ subject: undefined })
    expect(deriveExamContext(null, 'Fallback')).toEqual({ subject: 'Fallback' })
  })
})

describe('marking-scheme matching (the apply split)', () => {
  // Mirrors how the client splits the model's matches into patches for existing
  // questions vs new "extra" rows, keyed by normalized reference.
  function split(
    items: Array<{ questionLabel?: string; questionNumber?: number }>,
    matches: Array<{ ref: string; answer: string; extra?: boolean }>
  ) {
    const validRefs = new Set(items.map(it => refKey(it.questionLabel ?? it.questionNumber)))
    const patched: string[] = []
    for (const m of matches) {
      if (m.extra) continue
      const key = refKey(m.ref)
      if (key && validRefs.has(key)) patched.push(key)
    }
    const seen = new Set<string>()
    const newRows = matches
      .filter(m => m.extra && !validRefs.has(refKey(m.ref)) && m.ref)
      .filter(m => {
        const k = refKey(m.ref)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }))
    return { patched, newRows }
  }

  it('matches existing rows across format drift and appends deduped, sorted extras', () => {
    const items = [{ questionLabel: '3(a)' }, { questionLabel: '3(b)' }]
    const matches = [
      { ref: '3 (a)', answer: 'X' }, // format drift, existing
      { ref: '3(b)', answer: 'Y' }, // existing
      { ref: '3(c)', answer: 'Z', extra: true }, // new
      { ref: '10', answer: 'W', extra: true }, // new
      { ref: '3(c)', answer: 'dup', extra: true }, // dup of new
    ]
    const { patched, newRows } = split(items, matches)
    expect(patched).toEqual(['3a', '3b'])
    expect(newRows.map(r => r.ref)).toEqual(['3(c)', '10']) // numeric-aware sort: 3 before 10
  })

  it('does not turn an existing reference into an extra row', () => {
    const items = [{ questionLabel: '1' }]
    const matches = [{ ref: '1', answer: 'A', extra: true }] // mislabeled extra
    const { patched, newRows } = split(items, matches)
    expect(newRows).toHaveLength(0)
    // not patched either, because it was flagged extra — but crucially not duplicated as a new row
    expect(patched).toEqual([])
  })
})

describe('constants', () => {
  it('exposes a stable board list including Other', () => {
    expect(EXAM_BOARDS).toContain('AP')
    expect(EXAM_BOARDS).toContain('IB')
    expect(EXAM_BOARDS[EXAM_BOARDS.length - 1]).toBe('Other')
  })
  it('caps extra questions', () => {
    expect(MAX_EXTRA_QUESTIONS).toBeGreaterThan(0)
  })
})
