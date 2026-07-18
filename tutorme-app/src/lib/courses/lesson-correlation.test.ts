import { describe, it, expect } from 'vitest'
import { buildScopedLessonResolver } from './lesson-correlation'

describe('buildScopedLessonResolver', () => {
  // A published-variant course: two lessons copied from template (t-l1, t-l2) plus
  // one authored directly on the variant.
  const lessons = [
    { lessonId: 'k-l1', order: 0, sourceLessonId: 't-l1' },
    { lessonId: 'k-l2', order: 1, sourceLessonId: 't-l2' },
    { lessonId: 'k-l3', order: 2, sourceLessonId: null },
  ]
  const resolve = buildScopedLessonResolver(lessons)

  it('keeps a task already on one of the scoped lessons', () => {
    expect(resolve('k-l3', null, 2)).toBe('k-l3')
  })

  it('maps a template-authored task onto the scoped lesson via sourceLessonId', () => {
    // task lessonId is the template lesson t-l2 → scoped lesson k-l2 (root t-l2)
    expect(resolve('t-l2', null, 1)).toBe('k-l2')
  })

  it('maps a sibling-variant task that shares the same template root', () => {
    // another variant's lesson s-l1 whose sourceLessonId is t-l1 → k-l1
    expect(resolve('s-l1', 't-l1', 0)).toBe('k-l1')
  })

  it('falls back to a unique order when there is no root match', () => {
    expect(resolve('foreign', null, 1)).toBe('k-l2')
  })

  it('does NOT use the order fallback when the order is ambiguous', () => {
    const dup = buildScopedLessonResolver([
      { lessonId: 'a', order: 0, sourceLessonId: null },
      { lessonId: 'b', order: 0, sourceLessonId: null }, // duplicate order 0
    ])
    // ambiguous order → left unchanged (surfaces under "Other tasks"), never guessed
    expect(dup('foreign', null, 0)).toBe('foreign')
  })

  it('returns the input unchanged when nothing correlates', () => {
    expect(resolve('foreign', null, 99)).toBe('foreign')
  })

  it('returns null for a null lessonId', () => {
    expect(resolve(null, null, 0)).toBeNull()
  })
})
