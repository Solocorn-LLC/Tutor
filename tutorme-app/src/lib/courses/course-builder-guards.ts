/**
 * Pure decisions for the Course Builder lesson-persistence guards. They protect
 * against silent lesson data-loss, so they're extracted here and unit-tested — a
 * future refactor of the (untestable) React effect / save closure can't
 * reintroduce the loss without failing a test. See course-builder-guards.test.ts.
 *
 * The save (`updateCourseBuilderData`) is delete-missing: it soft-deletes every
 * DB lesson whose id is NOT in the incoming payload. That is only safe if the
 * payload was built from a `builderNodes` state that already contains every
 * lesson currently in the DB. The builder opens EMPTY and cannot tell "still
 * loading" (`loadedLessons === null`) from "genuinely empty" (`[]`), so a tutor
 * who starts adding lessons before the initial load lands would otherwise build a
 * payload missing the not-yet-loaded lessons — and the save would delete them.
 * Two rules close that: (1) never save while the load is incomplete, and (2) when
 * the load lands, MERGE it with any lessons added during the load window.
 */

/**
 * Whether the builder should (re)hydrate its local node state from a SUBSEQUENT
 * (non-first) delivery of loaded course data — i.e. a re-fetch for the same
 * course. Only when switching to a DIFFERENT course, or while the builder is
 * still empty; otherwise a late/async re-fetch for the SAME course would clobber
 * the tutor's in-progress edits (which autosave then persists). See #1127. The
 * FIRST real load is handled separately by a merge (see mergeLoadedWithPendingEdits).
 */
export function shouldRehydrateBuilder(courseChanged: boolean, currentNodeCount: number): boolean {
  return courseChanged || currentNodeCount === 0
}

export type SaveGateDecision = 'proceed' | 'block-silent' | 'block-warn'

/**
 * Whether a save must be blocked because the course content hasn't finished
 * loading. For a DB-backed course, `loadedLessons === null` means the initial
 * load is still pending or has failed — the builder's lesson set does NOT yet
 * reflect the DB, so a delete-missing save would soft-delete every not-yet-loaded
 * lesson (the create/reopen "lessons disappear" bug). Block ANY save in that
 * state — autosave silently, a manual save with a warning. Bypassed when there
 * are no persisted lessons to protect: a detached draft, or a draft-sentinel
 * course (insights-draft / builder-draft) whose "save" is really a create — its
 * load 404s so loadedLessons stays null, and blocking would break creation. A
 * course whose load has completed (`loadedLessons` is `[]` or populated)
 * proceeds. Supersedes the narrower empty-only guard from #1128.
 */
export function preSaveDecision(params: {
  isDetached: boolean
  isDraftCourse: boolean
  loadedLessonsIsNull: boolean
  isAutoSave: boolean
}): SaveGateDecision {
  const { isDetached, isDraftCourse, loadedLessonsIsNull, isAutoSave } = params
  if (isDetached || isDraftCourse) return 'proceed'
  if (loadedLessonsIsNull) {
    return isAutoSave ? 'block-silent' : 'block-warn'
  }
  return 'proceed'
}

type MergeableNode = { id?: string; lessons?: Array<{ id?: string } | null | undefined> }

/**
 * Merge the just-loaded course nodes with any nodes the tutor added while the
 * initial load was still in flight, so builderNodes ends up containing BOTH the
 * full DB baseline AND the in-progress additions. Loaded nodes come first (they
 * are the authoritative DB order); a pending node is appended only if it isn't
 * already represented in the loaded set — matched by its lesson id, else its node
 * id. During the load window the builder is empty, so the tutor can only ADD new
 * lessons (never edit a not-yet-loaded one); a pending node that collides with a
 * loaded lesson is therefore the same lesson and is dropped in favour of the
 * loaded copy. This lets a save carry every DB lesson (no wrongful delete) while
 * keeping the tutor's new lessons.
 */
export function mergeLoadedWithPendingEdits<T extends MergeableNode>(
  loaded: T[],
  pending: T[]
): T[] {
  const loadedLessonIds = new Set<string>()
  const loadedNodeIds = new Set<string>()
  for (const node of loaded) {
    if (node.id) loadedNodeIds.add(node.id)
    const lessonId = node.lessons?.[0]?.id
    if (lessonId) loadedLessonIds.add(lessonId)
  }
  const extras = pending.filter(node => {
    const lessonId = node.lessons?.[0]?.id
    if (lessonId && loadedLessonIds.has(lessonId)) return false
    if (node.id && loadedNodeIds.has(node.id)) return false
    return true
  })
  return [...loaded, ...extras]
}
