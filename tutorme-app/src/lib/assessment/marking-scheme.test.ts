import { describe, it, expect } from 'vitest'
import {
  refKey,
  extractQuestionRef,
  isPlausibleRef,
  deriveExamContext,
  EXAM_BOARDS,
  MAX_EXTRA_QUESTIONS,
  applySchemeMatches,
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

describe('applySchemeMatches', () => {
  const items = [
    { id: 'a', questionNumber: 1, questionLabel: '3(a)', questionText: 'Q3a', answer: '' },
    { id: 'b', questionNumber: 2, questionLabel: '3(b)', questionText: 'Q3b', answer: '' },
  ] as any
  let n = 0
  const makeId = () => `new-${++n}`

  it('patches existing rows, appends sorted/deduped new rows, counts only filled', () => {
    n = 0
    const r = applySchemeMatches(
      items,
      [
        { ref: '3 (a)', answer: 'Paris' }, // existing, format drift
        { ref: '3(b)', answer: '7' }, // existing
        { ref: '3(c)', answer: 'Z', extra: true }, // new
        { ref: '10', answer: 'W', extra: true }, // new
        { ref: '3(c)', answer: 'dup', extra: true }, // dupe of new
      ],
      makeId
    )
    expect(r.filled).toBe(2) // only the two existing rows changed
    expect(r.patchedItems.slice(0, 2).map((q: any) => q.answer)).toEqual(['Paris', '7'])
    expect(r.newRows.map((q: any) => q.questionLabel)).toEqual(['3(c)', '10']) // numeric-aware
    expect(r.newRows.map((q: any) => q.answer)).toEqual(['Z', 'W'])
    expect(r.patchedItems).toHaveLength(4)
    expect(r.newRows[0].questionText).toBe('Question 3(c)')
    expect(r.newRows[0].answerProvenance).toBe('answer_sheet_extracted')
  })

  it('applyToVersionItems patches a different array the same way', () => {
    n = 0
    const r = applySchemeMatches(items, [{ ref: '3(a)', answer: 'X' }], makeId)
    const vs = applySchemeMatches(
      items,
      [{ ref: '3(a)', answer: 'X' }],
      makeId
    ).applyToVersionItems(items)
    expect(vs[0].answer).toBe('X')
    expect(r.filled).toBe(1)
  })

  it('reports zero filled and no rows when nothing lines up', () => {
    const r = applySchemeMatches(items, [{ ref: '9(z)', answer: 'X' }], makeId) // not extra, not existing
    expect(r.filled).toBe(0)
    expect(r.newRows).toHaveLength(0)
  })

  it('ASMT-5: does not overwrite a tutor-authored answer, but still adds marks/rubric', () => {
    const tutorItems = [
      {
        id: 'a',
        questionNumber: 1,
        questionLabel: '3(a)',
        questionText: 'Q3a',
        answer: 'tutor answer',
        answerProvenance: 'tutor_edited',
      },
    ] as any
    const r = applySchemeMatches(
      tutorItems,
      [{ ref: '3(a)', answer: 'scheme answer', marks: 3, rubric: 'award 3' }],
      makeId
    )
    const patched = r.patchedItems[0]
    expect(patched.answer).toBe('tutor answer') // tutor answer preserved
    expect(patched.answerProvenance).toBe('tutor_edited') // provenance preserved
    expect(patched.marks).toBe(3) // non-answer fields still applied
    expect(patched.rubric).toBe('award 3')
  })

  it('ASMT-5: still overwrites an llm/scheme answer (no tutor precedence)', () => {
    const llmItems = [
      {
        id: 'a',
        questionNumber: 1,
        questionLabel: '3(a)',
        questionText: 'Q3a',
        answer: 'old',
        answerProvenance: 'answer_sheet_extracted',
      },
    ] as any
    const r = applySchemeMatches(llmItems, [{ ref: '3(a)', answer: 'new' }], makeId)
    expect(r.patchedItems[0].answer).toBe('new')
  })
})
