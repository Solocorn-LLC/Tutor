/**
 * Pure decisions for the two Course Builder persistence guards. Both protect
 * against silent lesson data-loss, so they're extracted here and unit-tested —
 * a future refactor of the (untestable) React effect / save closure can't
 * reintroduce the loss without failing a test. See course-builder-guards.test.ts.
 */

/**
 * Whether the builder should (re)hydrate its local node state from the loaded
 * course data. Only when switching to a DIFFERENT course, or while the builder is
 * still empty — otherwise a late/async initial for the SAME course would clobber
 * the tutor's in-progress edits (which autosave then persists). See #1127.
 */
export function shouldRehydrateBuilder(courseChanged: boolean, currentNodeCount: number): boolean {
  return courseChanged || currentNodeCount === 0
}

export type EmptySaveDecision = 'proceed' | 'block-silent' | 'block-warn'

/**
 * Whether a save carrying an EMPTY lesson set must be blocked because the course
 * content hasn't finished loading (`loadedLessons === null` → load pending or
 * failed). Saving empty then would soft-delete every un-deployed lesson. Blocks
 * autosave silently and a manual save with a warning; a genuinely-empty course
 * (loaded as []) or a detached draft proceeds. See #1128.
 */
export function emptySaveDecision(params: {
  isDetached: boolean
  lessonCount: number
  loadedLessonsIsNull: boolean
  isAutoSave: boolean
}): EmptySaveDecision {
  const { isDetached, lessonCount, loadedLessonsIsNull, isAutoSave } = params
  if (!isDetached && lessonCount === 0 && loadedLessonsIsNull) {
    return isAutoSave ? 'block-silent' : 'block-warn'
  }
  return 'proceed'
}
