import { describe, it, expect } from 'vitest'
import { shouldRehydrateBuilder, emptySaveDecision } from './course-builder-guards'

describe('shouldRehydrateBuilder (#1127 — late load must not clobber edits)', () => {
  it('hydrates when the course changed (new mount / course switch), even with edits', () => {
    expect(shouldRehydrateBuilder(true, 0)).toBe(true)
    expect(shouldRehydrateBuilder(true, 3)).toBe(true)
  })

  it('hydrates the SAME course only while the builder is still empty', () => {
    // Reopen: builder empty, load delivers → hydrate.
    expect(shouldRehydrateBuilder(false, 0)).toBe(true)
  })

  it('does NOT re-hydrate the same course once the tutor has added lessons', () => {
    // The regression: a late async load for the same course must not overwrite
    // in-progress edits.
    expect(shouldRehydrateBuilder(false, 1)).toBe(false)
    expect(shouldRehydrateBuilder(false, 5)).toBe(false)
  })
})

describe('emptySaveDecision (#1128 — no empty save before the load finishes)', () => {
  const base = { isDetached: false, lessonCount: 2, loadedLessonsIsNull: false, isAutoSave: false }

  it('proceeds for a normal save with content', () => {
    expect(emptySaveDecision(base)).toBe('proceed')
  })

  it('blocks an empty save while the load is pending/failed (loadedLessons === null)', () => {
    // Manual save → warn the tutor.
    expect(
      emptySaveDecision({ ...base, lessonCount: 0, loadedLessonsIsNull: true, isAutoSave: false })
    ).toBe('block-warn')
    // Autosave → block silently (the regression: this used to be allowed and wiped lessons).
    expect(
      emptySaveDecision({ ...base, lessonCount: 0, loadedLessonsIsNull: true, isAutoSave: true })
    ).toBe('block-silent')
  })

  it('allows a genuinely-empty course once it has loaded (loadedLessons === [])', () => {
    expect(
      emptySaveDecision({ ...base, lessonCount: 0, loadedLessonsIsNull: false, isAutoSave: true })
    ).toBe('proceed')
  })

  it('allows deleting all lessons on a loaded course (user intent)', () => {
    // loaded (not null) + now empty → proceed (deploy guard still protects deployed lessons).
    expect(
      emptySaveDecision({ ...base, lessonCount: 0, loadedLessonsIsNull: false, isAutoSave: false })
    ).toBe('proceed')
  })

  it('never blocks a detached draft (different flow)', () => {
    expect(
      emptySaveDecision({
        isDetached: true,
        lessonCount: 0,
        loadedLessonsIsNull: true,
        isAutoSave: true,
      })
    ).toBe('proceed')
    expect(
      emptySaveDecision({
        isDetached: true,
        lessonCount: 0,
        loadedLessonsIsNull: true,
        isAutoSave: false,
      })
    ).toBe('proceed')
  })
})
