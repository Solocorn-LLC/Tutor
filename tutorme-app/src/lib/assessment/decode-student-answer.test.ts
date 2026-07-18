import { describe, it, expect } from 'vitest'
import { decodeStudentAnswer } from './decode-student-answer'
import type { StudentDmiItem } from '@/lib/assessment/student-dmi'

const mcq: StudentDmiItem = {
  id: 'q1',
  questionNumber: 1,
  questionText: 'Pick one',
  questionType: 'mcq',
  options: ['Apple', 'Banana', 'Cherry'],
}
const text: StudentDmiItem = {
  id: 'q2',
  questionNumber: 2,
  questionText: 'Explain',
  questionType: 'short_answer',
}

describe('decodeStudentAnswer', () => {
  it('decodes an mcq letter to its option', () => {
    expect(decodeStudentAnswer(mcq, 'B')).toBe('B. Banana')
  })

  it('returns the raw letter when the option index is out of range', () => {
    expect(decodeStudentAnswer(mcq, 'Z')).toBe('Z')
  })

  it('joins a multiple_response JSON array of option texts', () => {
    const mr: StudentDmiItem = { ...mcq, questionType: 'multiple_response' }
    expect(decodeStudentAnswer(mr, JSON.stringify(['Apple', 'Cherry']))).toBe('Apple, Cherry')
  })

  it('passes through plain text', () => {
    expect(decodeStudentAnswer(text, 'because reasons')).toBe('because reasons')
  })

  it('shows a dash for empty / missing answers', () => {
    expect(decodeStudentAnswer(text, '')).toBe('—')
    expect(decodeStudentAnswer(text, '   ')).toBe('—')
    expect(decodeStudentAnswer(text, undefined)).toBe('—')
    expect(decodeStudentAnswer(text, null)).toBe('—')
  })

  it('never throws on non-string jsonb values (number / array / object)', () => {
    expect(decodeStudentAnswer(text, 42)).toBe('42')
    expect(decodeStudentAnswer(text, ['a', 'b'])).toBe('a, b')
    expect(decodeStudentAnswer(text, { x: 1 })).toBe('{"x":1}')
  })
})
