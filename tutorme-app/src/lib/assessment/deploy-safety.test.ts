import { describe, it, expect } from 'vitest'
import { buildStudentDeployPayload, type RawDeployDmiItem } from './deploy-safety'

const rawItem = (over: Partial<RawDeployDmiItem> = {}): RawDeployDmiItem => ({
  id: 'q1',
  questionNumber: 1,
  questionText: 'What is 2 + 2?',
  questionType: 'mcq',
  options: ['3', '4', '5', '6'],
  marks: 1,
  answer: 'B',
  acceptableVariants: ['b', 'four'],
  rubric: 'Award 1 for B.',
  ...over,
})

describe('buildStudentDeployPayload', () => {
  it('strips the answer key from the student dmiItems', () => {
    const { dmiItems } = buildStudentDeployPayload([rawItem()])
    const item = dmiItems[0] as Record<string, unknown>
    expect(item.answer).toBeUndefined()
    expect(item.rubric).toBeUndefined()
    expect(item.acceptableVariants).toBeUndefined()
    // ...but keeps the student-facing fields.
    expect(item.questionText).toBe('What is 2 + 2?')
    expect(item.options).toEqual(['3', '4', '5', '6'])
  })

  it('derives the server-only answerKey from the raw items', () => {
    const { answerKey } = buildStudentDeployPayload([rawItem()])
    expect(answerKey).toEqual([
      { id: 'q1', answer: 'B', acceptableVariants: ['b', 'four'], marks: 1 },
    ])
  })

  it('reports NO leaks in the produced student payload', () => {
    const { leaks } = buildStudentDeployPayload([
      rawItem(),
      rawItem({ id: 'q2', answer: 'A', questionText: 'Pick A' }),
    ])
    expect(leaks).toEqual([])
  })

  it('strips matching/hotspot answer keys (pairs/regions) from the student view', () => {
    const { dmiItems, leaks } = buildStudentDeployPayload([
      {
        id: 'm1',
        questionNumber: 1,
        questionText: 'Match them',
        questionType: 'matching',
        pairs: [
          { left: 'A', right: '1' },
          { left: 'B', right: '2' },
        ],
      } as RawDeployDmiItem,
    ])
    const item = dmiItems[0] as Record<string, unknown>
    expect(item.pairs).toBeUndefined()
    // The prompt is shown; the correct pairing is not.
    expect(item.matchPrompts).toEqual(['A', 'B'])
    expect(leaks).toEqual([])
  })

  it('uses a provided answerKey as-is (already-stripped paths)', () => {
    const provided = [{ id: 'q1', answer: 'B', marks: 1 }]
    const { answerKey } = buildStudentDeployPayload([rawItem({ answer: undefined })], provided)
    expect(answerKey).toBe(provided)
  })

  it('handles empty / undefined input', () => {
    expect(buildStudentDeployPayload(undefined)).toEqual({ dmiItems: [], answerKey: [], leaks: [] })
    expect(buildStudentDeployPayload([])).toEqual({ dmiItems: [], answerKey: [], leaks: [] })
  })
})
