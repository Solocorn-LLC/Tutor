'use client'

import { fetchWithCsrf } from '@/lib/api/fetch-csrf'

export interface SaveCourseOptions {
  courseId: string | null
  lessons: unknown[]
  mode: 'draft' | 'live' | 'publish'
  storageKey?: string
  draftListStorageKey?: string
  courseName?: string
  courseDescription?: string
  /** Categories to set when creating a DB course from a draft (chosen at
   *  creation and held on the local draft). Ignored for updates. */
  categories?: string[]
  developmentMode?: 'single' | 'multi'
  previewDifficulty?: 'all' | 'beginner' | 'intermediate' | 'advanced'
  isAutoSave?: boolean
  isExistingDbCourse?: boolean
  detachedCourseName?: string
  propagateToVariants?: boolean
  setIndependent?: boolean
}

export interface SaveCourseResult {
  success: boolean
  courseId?: string
  error?: string
  data?: unknown
}

export interface DmiResolutionResult {
  lessons: unknown[]
  hasMissingDmis: boolean
}

const DRAFT_SENTINELS = new Set(['insights-draft', 'builder-draft'])

function getDefaultStorageKey(courseId: string | null): string {
  return `insights-course-builder:${courseId ?? 'default'}`
}

export function isDraftCourseId(courseId: string | null): boolean {
  return !courseId || DRAFT_SENTINELS.has(courseId)
}

function safeStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (
      val &&
      ((typeof Window !== 'undefined' && val instanceof Window) ||
        (typeof Node !== 'undefined' && val instanceof Node))
    ) {
      return undefined
    }
    return val
  })
}

/**
 * Resolve active DMI versions for homework and tasks within lessons.
 * Returns the resolved lessons and a flag indicating if any homework is missing DMIs.
 */
export function resolveLessonDmis(lessons: unknown[]): DmiResolutionResult {
  let hasMissingDmis = false

  const resolved = lessons.map((lesson: any) => ({
    ...lesson,
    homework: (lesson.homework || []).map((hw: any) => {
      if (!hw.dmiVersions || hw.dmiVersions.length === 0) {
        hasMissingDmis = true
        return hw
      }
      const activeVersionId = hw.activeDmiVersionId || hw.dmiVersions[0].id
      const activeVersion =
        hw.dmiVersions.find((v: any) => v.id === activeVersionId) || hw.dmiVersions[0]
      return {
        ...hw,
        dmiItems: activeVersion.items,
      }
    }),
    tasks: (lesson.tasks || []).map((task: any) => {
      if (!task.dmiVersions || task.dmiVersions.length === 0) {
        return task
      }
      const activeVersionId = task.activeDmiVersionId || task.dmiVersions[0].id
      const activeVersion =
        task.dmiVersions.find((v: any) => v.id === activeVersionId) || task.dmiVersions[0]
      return {
        ...task,
        dmiItems: activeVersion.items,
      }
    }),
  }))

  return { lessons: resolved, hasMissingDmis }
}

/**
 * Unified course save function.
 *
 * - `draft`: persists to localStorage
 * - `live`:  persists to the backend API (creates course if needed)
 * - `publish`: same as live, but will also create a DB course when
 *   `isExistingDbCourse` is false
 */
export async function saveCourse(options: SaveCourseOptions): Promise<SaveCourseResult> {
  const {
    courseId,
    lessons,
    mode,
    storageKey,
    draftListStorageKey,
    courseName,
    courseDescription,
    categories,
    developmentMode = 'single',
    previewDifficulty = 'all',
    isExistingDbCourse = false,
    detachedCourseName,
    propagateToVariants,
    setIndependent,
  } = options

  // ---- DRAFT MODE ----
  if (mode === 'draft') {
    try {
      const key = storageKey || getDefaultStorageKey(courseId)
      const payload: Record<string, unknown> = {
        lessons,
        savedAt: new Date().toISOString(),
      }

      // Only store builder options when they differ from defaults to keep
      // localStorage payload minimal and compatible with all load paths.
      if (developmentMode !== 'single' || previewDifficulty !== 'all') {
        payload.options = { developmentMode, previewDifficulty }
      }

      localStorage.setItem(key, JSON.stringify(payload))

      // Update draft list metadata timestamp if applicable
      if (draftListStorageKey && courseId && !DRAFT_SENTINELS.has(courseId)) {
        try {
          const raw = localStorage.getItem(draftListStorageKey)
          const parsed = raw ? JSON.parse(raw) : []
          const updated = parsed.map((c: any) =>
            c.id === courseId ? { ...c, updatedAt: new Date().toISOString() } : c
          )
          localStorage.setItem(draftListStorageKey, JSON.stringify(updated))
        } catch {
          // ignore metadata update failure
        }
      }

      return { success: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to save draft'
      return { success: false, error }
    }
  }

  // ---- LIVE / PUBLISH MODE ----
  let targetCourseId = courseId

  // Create course in DB when the ID is a client-side draft sentinel,
  // or when publishing a draft that does not yet exist in the DB.
  if (isDraftCourseId(targetCourseId) || (mode === 'publish' && !isExistingDbCourse)) {
    const title = courseName || detachedCourseName || 'Untitled Course'

    try {
      const createRes = await fetchWithCsrf('/api/tutor/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: safeStringify({
          title,
          description: courseDescription || '',
          categories: categories ?? [],
          schedule: [],
          isLiveOnline: false,
        }),
      })

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}))
        return {
          success: false,
          error: err.error || err.details || 'Failed to create course',
        }
      }

      const newCourseData = await createRes.json()
      targetCourseId = newCourseData.courses?.[0]?.id

      if (!targetCourseId) {
        return { success: false, error: 'Course created but ID is missing' }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to create course'
      return { success: false, error }
    }
  }

  if (!targetCourseId) {
    return { success: false, error: 'No course ID available' }
  }

  // A course we just created already carries the default lesson added by the
  // POST above. Sending an empty lessons array to the content PUT would wipe it
  // and trip the server's floor guard ("refusing to delete all N lessons"), so
  // when publishing a brand-new course with no lessons, keep the default and
  // return the new id instead of clearing it.
  const createdNew = isDraftCourseId(courseId) || (mode === 'publish' && !isExistingDbCourse)
  if (createdNew && (!Array.isArray(lessons) || lessons.length === 0)) {
    return { success: true, courseId: targetCourseId }
  }

  try {
    const saveRes = await fetchWithCsrf(`/api/tutor/courses/${targetCourseId}/course`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: safeStringify({
        lessons,
        developmentMode,
        previewDifficulty,
        description: courseDescription,
        propagateToVariants,
        setIndependent,
      }),
    })

    if (!saveRes.ok) {
      const err = await saveRes.json().catch(() => ({}))
      return {
        success: false,
        courseId: targetCourseId,
        error: err.error || err.details || 'Failed to save course content',
      }
    }

    const data = await saveRes.json().catch(() => ({}))
    return {
      success: true,
      courseId: targetCourseId,
      data,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to save course content'
    return {
      success: false,
      courseId: targetCourseId,
      error,
    }
  }
}
