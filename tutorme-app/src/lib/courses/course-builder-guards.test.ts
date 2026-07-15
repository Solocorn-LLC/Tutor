import { describe, it, expect } from 'vitest'
import {
  shouldRehydrateBuilder,
  preSaveDecision,
  mergeLoadedWithPendingEdits,
} from './course-builder-guards'

describe('shouldRehydrateBuilder (#1127 — late re-fetch must not clobber edits)', () => {
  it('hydrates when the course changed (new mount / course switch), even with edits', () => {
    expect(shouldRehydrateBuilder(true, 0)).toBe(true)
    expect(shouldRehydrateBuilder(true, 3)).toBe(true)
  })

  it('hydrates the SAME course only while the builder is still empty', () => {
    expect(shouldRehydrateBuilder(false, 0)).toBe(true)
  })

  it('does NOT re-hydrate the same course once the tutor has added lessons', () => {
    expect(shouldRehydrateBuilder(false, 1)).toBe(false)
    expect(shouldRehydrateBuilder(false, 5)).toBe(false)
  })
})

describe('preSaveDecision (no save while the initial load is incomplete)', () => {
  const base = {
    isDetached: false,
    isDraftCourse: false,
    loadedLessonsIsNull: false,
    isAutoSave: false,
  }

  it('proceeds for a normal save once the course has loaded', () => {
    expect(preSaveDecision(base)).toBe('proceed')
    expect(preSaveDecision({ ...base, isAutoSave: true })).toBe('proceed')
  })

  it('blocks ANY save while the load is pending/failed (loadedLessons === null)', () => {
    // Manual save -> warn the tutor.
    expect(preSaveDecision({ ...base, loadedLessonsIsNull: true, isAutoSave: false })).toBe(
      'block-warn'
    )
    // Autosave -> block silently. This is the core fix: a non-empty payload built
    // during the load window used to delete every not-yet-loaded lesson.
    expect(preSaveDecision({ ...base, loadedLessonsIsNull: true, isAutoSave: true })).toBe(
      'block-silent'
    )
  })

  it('allows a course whose load completed, even when empty (loadedLessons === [])', () => {
    // loadedLessonsIsNull === false models a completed load (empty or populated).
    expect(preSaveDecision({ ...base, loadedLessonsIsNull: false })).toBe('proceed')
  })

  it('never blocks a detached draft (no DB load)', () => {
    expect(preSaveDecision({ ...base, isDetached: true, loadedLessonsIsNull: true })).toBe(
      'proceed'
    )
    expect(
      preSaveDecision({ ...base, isDetached: true, loadedLessonsIsNull: true, isAutoSave: true })
    ).toBe('proceed')
  })

  it('never blocks a draft-sentinel course whose "save" is a create (insights/builder-draft)', () => {
    // Its load 404s so loadedLessons stays null; blocking would break creation.
    expect(preSaveDecision({ ...base, isDraftCourse: true, loadedLessonsIsNull: true })).toBe(
      'proceed'
    )
    expect(
      preSaveDecision({ ...base, isDraftCourse: true, loadedLessonsIsNull: true, isAutoSave: true })
    ).toBe('proceed')
  })
})

describe('mergeLoadedWithPendingEdits (first real load keeps DB baseline + in-progress adds)', () => {
  const node = (nodeId: string, lessonId: string) => ({
    id: nodeId,
    lessons: [{ id: lessonId }],
  })

  it('returns the loaded set unchanged when nothing was added during the load', () => {
    const loaded = [node('node-a', 'a'), node('node-b', 'b')]
    expect(mergeLoadedWithPendingEdits(loaded, [])).toEqual(loaded)
  })

  it('appends lessons added during the load window after the loaded (DB) lessons', () => {
    // Reopen [A,B,C]; tutor added D before the load landed. Merge must keep A,B,C
    // AND D so the next save carries all four (no wrongful delete of A,B,C).
    const loaded = [node('node-a', 'a'), node('node-b', 'b'), node('node-c', 'c')]
    const pending = [node('node-d', 'd')]
    const merged = mergeLoadedWithPendingEdits(loaded, pending)
    expect(merged.map(n => n.lessons[0].id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps the default lesson plus a lesson added on a newly-created course', () => {
    // Create -> default Lesson 1 (L1) in DB; tutor added Lesson 2 during the load.
    const loaded = [node('node-L1', 'L1')]
    const pending = [node('node-new', 'new2')]
    expect(mergeLoadedWithPendingEdits(loaded, pending).map(n => n.lessons[0].id)).toEqual([
      'L1',
      'new2',
    ])
  })

  it('drops a pending node that collides with a loaded lesson (same lesson id)', () => {
    const loaded = [node('node-a', 'a')]
    const pending = [node('node-a', 'a'), node('node-x', 'x')]
    expect(mergeLoadedWithPendingEdits(loaded, pending).map(n => n.lessons[0].id)).toEqual([
      'a',
      'x',
    ])
  })

  it('dedupes by node id even when a pending node has no lesson id yet', () => {
    const loaded = [{ id: 'node-a', lessons: [{ id: 'a' }] }]
    const pending = [
      { id: 'node-a', lessons: [] },
      { id: 'node-fresh', lessons: [] },
    ]
    const merged = mergeLoadedWithPendingEdits(loaded, pending)
    expect(merged.map(n => n.id)).toEqual(['node-a', 'node-fresh'])
  })
})
