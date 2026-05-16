import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseLesson } from '@/lib/db/schema'
import { eq, and, inArray, asc } from 'drizzle-orm'
import crypto from 'crypto'

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

export class CourseBuilderService {
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
    return dbLessons.map(l => {
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
  }

  /**
   * Upserts the full builder tree (lessons) for a given course.
   * Verifies that the course belongs to the requesting user.
   */
  static async updateCourseBuilderData(
    courseId: string,
    userId: string,
    lessons: unknown
  ): Promise<void> {
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
  }
}
