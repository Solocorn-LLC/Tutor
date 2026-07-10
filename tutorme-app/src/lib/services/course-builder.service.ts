import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseLesson } from '@/lib/db/schema'
import { eq, and, inArray, asc, isNull } from 'drizzle-orm'
import crypto from 'crypto'
import { removeFile } from '@/lib/storage/service'
import { refreshDocumentUrls } from '@/lib/storage/gcs'
import { getLessonUsage } from '@/lib/courses/lesson-usage'

/** Thrown when a save would hard-delete a lesson that has deployed material. */
export const LESSON_DEPLOYED_ERROR = 'LESSON_HAS_DEPLOYMENTS'

/**
 * Thrown when a save would delete EVERY lesson on a course that currently has
 * lessons — almost always a failed content-load (the editor serializes an empty
 * tree) rather than a real "clear the whole course". Callers can pass
 * `allowEmpty` to override for a genuine full clear.
 */
export const EMPTY_SAVE_ERROR = 'EMPTY_LESSON_SAVE'

export interface BuilderLessonMedia {
  videos: unknown[]
  images: unknown[]
}

export interface BuilderLessonInput {
  id?: string
  title?: string
  description?: string | null
  order?: number
  isPublished?: boolean
  duration?: number
  media?: BuilderLessonMedia
  docs?: unknown[]
  content?: unknown[]
  tasks?: unknown[]
  assessments?: unknown[]
  homework?: unknown[]
  quizzes?: unknown[]
  worksheets?: unknown[]
  difficultyMode?: string
  variants?: Record<string, unknown>
}

export interface BuilderLessonData {
  id: string
  title: string
  description: string
  order: number
  isPublished?: boolean
  duration?: number
  media?: BuilderLessonMedia
  docs?: unknown[]
  content?: unknown[]
  tasks?: unknown[]
  assessments?: unknown[]
  homework?: unknown[]
  quizzes?: unknown[]
  worksheets?: unknown[]
  difficultyMode?: string
  variants?: Record<string, unknown>
}

/**
 * Recursively scan an object for blob URLs in sourceDocument.fileUrl fields.
 * Returns an array of paths where blob URLs were found.
 */
function findBlobUrls(obj: unknown, path = ''): string[] {
  const results: string[] = []
  if (typeof obj === 'string' && obj.startsWith('blob:')) {
    results.push(path || '<root>')
  } else if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      results.push(...findBlobUrls(item, `${path}[${idx}]`))
    })
  } else if (obj !== null && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const newPath = path ? `${path}.${key}` : key
      results.push(...findBlobUrls(value, newPath))
    }
  }
  return results
}

// ─── GCS Cleanup Helpers ──────────────────────────────────────────────────────

/**
 * Recursively scan an object for all `fileKey` string values.
 * Returns deduplicated keys suitable for GCS deletion.
 */
export function collectFileKeys(obj: unknown): string[] {
  const keys = new Set<string>()

  function walk(value: unknown) {
    if (typeof value === 'string') return
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (k === 'fileKey' && typeof v === 'string' && v.length > 0) {
          keys.add(v)
        } else {
          walk(v)
        }
      }
    }
  }

  walk(obj)
  return Array.from(keys)
}

/**
 * Delete GCS/local files by their keys.
 * Errors are logged but not thrown, so cleanup is best-effort.
 */
export async function deleteGcsFiles(keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await removeFile(key)
    } catch (err: any) {
      console.warn('[CourseBuilderService] Failed to delete file:', key, err?.message)
    }
  }
}

/** Build the `builderData` JSONB payload for a lesson row from builder input. */
function toLessonBuilderData(les: BuilderLessonInput) {
  const media = les.media ?? { videos: [], images: [] }
  return {
    isPublished: les.isPublished ?? false,
    duration: les.duration ?? 45,
    difficultyMode: les.difficultyMode ?? 'all',
    variants: les.variants ?? {},
    media,
    docs: les.docs ?? [],
    content: les.content ?? [],
    tasks: les.tasks ?? [],
    assessments: les.assessments ?? [],
    homework: les.homework ?? [],
    quizzes: les.quizzes ?? [],
    worksheets: les.worksheets ?? [],
  }
}

export class CourseBuilderService {
  /**
   * Scan all lessons in a course for fileKeys and delete the GCS objects.
   * Best-effort: errors are logged but not thrown.
   */
  static async cleanupCourseFiles(courseId: string): Promise<void> {
    try {
      const lessons = await drizzleDb
        .select({ builderData: courseLesson.builderData })
        .from(courseLesson)
        .where(eq(courseLesson.courseId, courseId))

      const keys = collectFileKeys(lessons.map(l => l.builderData))
      if (keys.length > 0) {
        await deleteGcsFiles(keys)
      }
    } catch (err: any) {
      console.warn('[CourseBuilderService] cleanupCourseFiles failed:', err?.message)
    }
  }

  /**
   * Retrieves the full builder tree (lessons) for a given course.
   * Verifies that the course belongs to the requesting user.
   */
  static async getCourseBuilderData(
    courseId: string,
    userId: string
  ): Promise<BuilderLessonData[]> {
    // Verify ownership
    const [courseRow] = await drizzleDb
      .select({ courseId: course.courseId })
      .from(course)
      .where(and(eq(course.courseId, courseId), eq(course.creatorId, userId)))

    if (!courseRow) {
      throw new Error('Course not found or access denied')
    }

    // Load lessons. Filter soft-deleted rows to match the other readers
    // (progress, submissions, publish) — otherwise the builder would show and
    // re-save a lesson those views already hide.
    const dbLessons = await drizzleDb
      .select()
      .from(courseLesson)
      .where(and(eq(courseLesson.courseId, courseId), isNull(courseLesson.deletedAt)))
      .orderBy(asc(courseLesson.order))

    // Transform to expected frontend structure
    const lessons = dbLessons.map(l => {
      const bData = (l.builderData ?? {}) as Record<string, unknown>
      const media = (bData.media ?? { videos: [], images: [] }) as BuilderLessonMedia
      const docs = Array.isArray(bData.docs) ? bData.docs : []
      const content = Array.isArray(bData.content) ? bData.content : []
      const tasks = Array.isArray(bData.tasks) ? bData.tasks : []
      const assessments = Array.isArray(bData.assessments) ? bData.assessments : []
      const homework = Array.isArray(bData.homework) ? bData.homework : []
      const quizzes = Array.isArray(bData.quizzes) ? bData.quizzes : []
      const worksheets = Array.isArray(bData.worksheets) ? bData.worksheets : []

      return {
        id: l.lessonId,
        title: l.title,
        description: l.description || '',
        order: l.order || 0,
        isPublished: bData.isPublished === true,
        duration: typeof bData.duration === 'number' ? bData.duration : 45,
        media,
        docs,
        content,
        tasks,
        assessments,
        homework,
        quizzes,
        worksheets,
        difficultyMode: typeof bData.difficultyMode === 'string' ? bData.difficultyMode : 'all',
        variants:
          typeof bData.variants === 'object' && bData.variants !== null
            ? (bData.variants as Record<string, unknown>)
            : {},
      }
    })

    // Refresh any expired GCS presigned URLs in document references before returning.
    // URLs are signed for 7 days; this ensures PDFs and attachments remain viewable.
    return await refreshDocumentUrls(lessons)
  }

  /**
   * Upserts the full builder tree (lessons) for a given course.
   * Verifies that the course belongs to the requesting user.
   */
  static async updateCourseBuilderData(
    courseId: string,
    userId: string,
    lessons: unknown,
    options?: {
      /**
       * Reject the save if it would hard-delete a lesson that has deployed
       * material. Defaults to true. Set false for variant-propagation, which
       * wholesale re-syncs a sibling's lessons and is not a user deletion.
       */
      guardDeletions?: boolean
      /**
       * Allow a save that clears every lesson on a course that currently has
       * lessons. Defaults to false — an empty payload against a non-empty course
       * is almost always a failed content-load, not an intentional full clear.
       */
      allowEmpty?: boolean
    }
  ): Promise<void> {
    const guardDeletions = options?.guardDeletions ?? true
    const allowEmpty = options?.allowEmpty ?? false
    // Verify ownership
    const [courseRow] = await drizzleDb
      .select({ courseId: course.courseId })
      .from(course)
      .where(and(eq(course.courseId, courseId), eq(course.creatorId, userId)))

    if (!courseRow) {
      throw new Error('Course not found or access denied')
    }

    if (!Array.isArray(lessons)) {
      throw new Error('Invalid payload: expected lessons array')
    }

    // Reject any lessons that contain blob URLs in sourceDocument.fileUrl.
    // Blob URLs are client-side only and become invalid after page refresh.
    const blobPaths = findBlobUrls(lessons)
    if (blobPaths.length > 0) {
      throw new Error(
        `Invalid payload: blob URLs found in task/assessment documents. ` +
          `Please re-upload the files so they are stored persistently. ` +
          `Found at: ${blobPaths.slice(0, 3).join(', ')}${blobPaths.length > 3 ? '...' : ''}`
      )
    }

    // Fetch existing (live) lessons with builderData so we can clean up orphaned
    // GCS files after the transaction succeeds. Soft-deleted rows are excluded —
    // they're not part of the editable tree.
    const existingLessons = await drizzleDb
      .select({ lessonId: courseLesson.lessonId, builderData: courseLesson.builderData })
      .from(courseLesson)
      .where(and(eq(courseLesson.courseId, courseId), isNull(courseLesson.deletedAt)))

    const oldFileKeys = collectFileKeys(existingLessons.map(l => l.builderData))
    // Ids removed in this save are SOFT-deleted (deletedAt set), so their rows —
    // and the files they reference — must survive; captured here for GCS cleanup.
    let softDeletedIds: string[] = []

    // Floor guard: never let an empty payload wipe a course that has lessons.
    // This is the signature of a failed content-load (the editor serializes an
    // empty tree) — refuse it rather than silently deleting the whole course
    // (and cascading student progress). A genuine full clear passes allowEmpty.
    if (!allowEmpty && lessons.length === 0 && existingLessons.length > 0) {
      throw new Error(
        `${EMPTY_SAVE_ERROR}: refusing to delete all ${existingLessons.length} lesson(s) on an ` +
          `empty save — the editor may not have finished loading. Reload the course and try again.`
      )
    }

    await drizzleDb.transaction(async tx => {
      // Only consider LIVE lessons for the diff; already soft-deleted rows are
      // gone from the tree (re-adding the same id resurrects it via the upsert's
      // deletedAt: null below).
      const existingDbLessons = await tx
        .select({ id: courseLesson.lessonId })
        .from(courseLesson)
        .where(and(eq(courseLesson.courseId, courseId), isNull(courseLesson.deletedAt)))

      const existingLessonIds = new Set(existingDbLessons.map(l => l.id))
      const incomingLessons = lessons as BuilderLessonInput[]
      const incomingLessonIds = new Set(incomingLessons.map(l => l.id).filter(Boolean))

      const idsToDelete = [...existingLessonIds].filter(id => !incomingLessonIds.has(id))

      if (idsToDelete.length > 0) {
        // Server-side enforcement of the delete guard (the builder blocks this
        // client-side, but a direct save must not slip a deployed lesson
        // through). DeployedMaterial.lessonId has no FK cascade, so removing a
        // deployed lesson would orphan references.
        if (guardDeletions) {
          const usage = await getLessonUsage(courseId, idsToDelete)
          const blocked = idsToDelete.filter(id => usage[id]?.hasDeployments)
          if (blocked.length > 0) {
            throw new Error(
              `${LESSON_DEPLOYED_ERROR}: cannot delete ${blocked.length} lesson(s) with material ` +
                `deployed from them in a class. Remove or reassign the deployed tasks/assessments first.`
            )
          }
        }
        // Soft-delete (set deletedAt) rather than hard-delete: every reader
        // filters isNull(deletedAt), so the lesson leaves the tree while its row
        // — and any DeployedMaterial / progress / submission that references its
        // id — stays intact and recoverable.
        softDeletedIds = idsToDelete
        await tx
          .update(courseLesson)
          .set({ deletedAt: new Date() })
          .where(inArray(courseLesson.lessonId, idsToDelete))
      }

      for (const [idx, les] of incomingLessons.entries()) {
        if (!les.id) les.id = crypto.randomUUID()

        const builderData = toLessonBuilderData(les)

        await tx
          .insert(courseLesson)
          .values({
            lessonId: les.id,
            courseId,
            title: les.title || 'Untitled Lesson',
            description: les.description || null,
            duration: les.duration ?? 60,
            order: idx,
            builderData,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: courseLesson.lessonId,
            set: {
              title: les.title || 'Untitled Lesson',
              description: les.description || null,
              duration: les.duration ?? 60,
              order: idx,
              builderData,
              // Resurrect the row if this id was previously soft-deleted.
              deletedAt: null,
              updatedAt: new Date(),
            },
          })
      }
    })

    // After successful save, delete orphaned GCS files. We diff old keys against
    // new keys so shared/reused files are preserved — AND keep the files of
    // soft-deleted lessons, whose rows still exist and reference them.
    const softDeletedSet = new Set(softDeletedIds)
    const keptKeys = collectFileKeys(lessons)
    const softDeletedKeys = collectFileKeys(
      existingLessons.filter(l => softDeletedSet.has(l.lessonId)).map(l => l.builderData)
    )
    const newKeySet = new Set([...keptKeys, ...softDeletedKeys])
    const orphanedKeys = oldFileKeys.filter(k => !newKeySet.has(k))
    if (orphanedKeys.length > 0) {
      await deleteGcsFiles(orphanedKeys)
    }
  }

  /**
   * Propagate a source published variant's lessons into a TARGET sibling variant.
   * Two variants' lessons correlate when they share a `sourceLessonId` (both were
   * copied from the same template lesson); we fall back to `order` for rows that
   * predate that linkage. Matched lessons are updated IN PLACE, preserving the
   * target's own `lessonId` (so DeployedMaterial, live-session, and
   * student-progress links survive); unmatched source lessons are inserted;
   * target lessons no longer present in the source are deleted only when nothing
   * has been deployed from them.
   *
   * This is the SAFE replacement for feeding a foreign course's lessons into
   * updateCourseBuilderData: because sibling variants carry distinct lessonIds,
   * that path deleted every target lesson and then no-op'd on the id conflicts,
   * leaving the sibling empty and cascading away its students' progress.
   */
  static async propagateLessonsToVariant(
    targetCourseId: string,
    userId: string,
    lessons: unknown
  ): Promise<void> {
    const [courseRow] = await drizzleDb
      .select({ courseId: course.courseId })
      .from(course)
      .where(and(eq(course.courseId, targetCourseId), eq(course.creatorId, userId)))
    if (!courseRow) {
      throw new Error('Course not found or access denied')
    }
    if (!Array.isArray(lessons)) {
      throw new Error('Invalid payload: expected lessons array')
    }
    const sourceLessons = lessons as BuilderLessonInput[]

    // Resolve each source lesson's template origin (sourceLessonId) so we can
    // correlate to the sibling by a stable id instead of by position.
    const sourceIds = sourceLessons.map(l => l.id).filter((id): id is string => Boolean(id))
    const originBySourceId = new Map<string, string>()
    if (sourceIds.length > 0) {
      const rows = await drizzleDb
        .select({ lessonId: courseLesson.lessonId, sourceLessonId: courseLesson.sourceLessonId })
        .from(courseLesson)
        .where(inArray(courseLesson.lessonId, sourceIds))
      for (const r of rows) {
        if (r.sourceLessonId) originBySourceId.set(r.lessonId, r.sourceLessonId)
      }
    }

    await drizzleDb.transaction(async tx => {
      const existing = await tx
        .select({
          lessonId: courseLesson.lessonId,
          order: courseLesson.order,
          sourceLessonId: courseLesson.sourceLessonId,
        })
        .from(courseLesson)
        .where(and(eq(courseLesson.courseId, targetCourseId), isNull(courseLesson.deletedAt)))
        .orderBy(asc(courseLesson.order))

      const targetBySource = new Map<string, string>()
      const targetByOrder = new Map<number, string>()
      for (const l of existing) {
        if (l.sourceLessonId && !targetBySource.has(l.sourceLessonId)) {
          targetBySource.set(l.sourceLessonId, l.lessonId)
        }
        const ord = l.order ?? 0
        if (!targetByOrder.has(ord)) targetByOrder.set(ord, l.lessonId)
      }

      const claimed = new Set<string>()
      for (const [idx, les] of sourceLessons.entries()) {
        const builderData = toLessonBuilderData(les)
        const origin = les.id ? originBySourceId.get(les.id) : undefined
        const targetId = (origin ? targetBySource.get(origin) : undefined) ?? targetByOrder.get(idx)
        if (targetId && !claimed.has(targetId)) {
          claimed.add(targetId)
          await tx
            .update(courseLesson)
            .set({
              // Only (re)assert the linkage when we know the origin; never blank
              // out a good sourceLessonId the target already has.
              ...(origin ? { sourceLessonId: origin } : {}),
              title: les.title || 'Untitled Lesson',
              description: les.description || null,
              duration: les.duration ?? 60,
              order: idx,
              builderData,
              updatedAt: new Date(),
            })
            .where(eq(courseLesson.lessonId, targetId))
        } else {
          await tx.insert(courseLesson).values({
            lessonId: crypto.randomUUID(),
            courseId: targetCourseId,
            sourceLessonId: origin ?? null,
            title: les.title || 'Untitled Lesson',
            description: les.description || null,
            duration: les.duration ?? 60,
            order: idx,
            builderData,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        }
      }

      const removedIds = existing.filter(l => !claimed.has(l.lessonId)).map(l => l.lessonId)
      if (removedIds.length > 0) {
        const usage = await getLessonUsage(targetCourseId, removedIds)
        const deletable = removedIds.filter(id => !usage[id]?.hasDeployments)
        if (deletable.length > 0) {
          await tx.delete(courseLesson).where(inArray(courseLesson.lessonId, deletable))
        }
      }
    })
  }
}
