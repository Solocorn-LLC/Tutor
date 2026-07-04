import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseLesson } from '@/lib/db/schema'
import { eq, and, inArray, asc } from 'drizzle-orm'
import crypto from 'crypto'
import { removeFile } from '@/lib/storage/service'
import { refreshDocumentUrls } from '@/lib/storage/gcs'
import { getLessonUsage } from '@/lib/courses/lesson-usage'

/** Thrown when a save would hard-delete a lesson that has deployed material. */
export const LESSON_DEPLOYED_ERROR = 'LESSON_HAS_DEPLOYMENTS'

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

    // Load lessons
    const dbLessons = await drizzleDb
      .select()
      .from(courseLesson)
      .where(eq(courseLesson.courseId, courseId))
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
    }
  ): Promise<void> {
    const guardDeletions = options?.guardDeletions ?? true
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

    // Fetch existing lessons with builderData so we can clean up orphaned GCS
    // files after the transaction succeeds.
    const existingLessons = await drizzleDb
      .select({ lessonId: courseLesson.lessonId, builderData: courseLesson.builderData })
      .from(courseLesson)
      .where(eq(courseLesson.courseId, courseId))

    const oldFileKeys = collectFileKeys(existingLessons.map(l => l.builderData))

    await drizzleDb.transaction(async tx => {
      const existingDbLessons = await tx
        .select({ id: courseLesson.lessonId })
        .from(courseLesson)
        .where(eq(courseLesson.courseId, courseId))

      const existingLessonIds = new Set(existingDbLessons.map(l => l.id))
      const incomingLessons = lessons as BuilderLessonInput[]
      const incomingLessonIds = new Set(incomingLessons.map(l => l.id).filter(Boolean))

      const idsToDelete = [...existingLessonIds].filter(id => !incomingLessonIds.has(id))

      if (idsToDelete.length > 0) {
        // Server-side enforcement of the delete guard (the builder blocks this
        // client-side, but a direct save must not slip a deployed lesson
        // through). DeployedMaterial.lessonId has no FK cascade, so hard-
        // deleting a deployed lesson would leave dangling references.
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
        await tx.delete(courseLesson).where(inArray(courseLesson.lessonId, idsToDelete))
      }

      for (const [idx, les] of incomingLessons.entries()) {
        if (!les.id) les.id = crypto.randomUUID()

        const media = les.media ?? { videos: [], images: [] }
        const builderData = {
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
              updatedAt: new Date(),
            },
          })
      }
    })

    // After successful save, delete orphaned GCS files.
    // We diff old keys against new keys so shared/reused files are preserved.
    const newFileKeys = collectFileKeys(lessons)
    const newKeySet = new Set(newFileKeys)
    const orphanedKeys = oldFileKeys.filter(k => !newKeySet.has(k))
    if (orphanedKeys.length > 0) {
      await deleteGcsFiles(orphanedKeys)
    }
  }
}
