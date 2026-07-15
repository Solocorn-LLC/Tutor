'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { DASHBOARD_THEMES, getThemeStyle } from '@/components/dashboard-theme'
import { saveCourse } from './save-course'
import type {
  CourseBuilderRef,
  Lesson as CourseBuilderLesson,
} from '../../dashboard/components/CourseBuilder'
import type { CourseBuilderInsightsProps } from './course-builder-types'

interface CourseData {
  id: string
  name: string
  description?: string | null
  subject?: string | null
  isLiveOnline?: boolean
  studentCount: number
  isPublished: boolean
  price?: number | null
  currency?: string | null
}

interface AdaptiveVariantLink {
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  batchId: string
  batchName: string
  joinLink: string
}

const DIFFICULTY_ORDER: Record<AdaptiveVariantLink['difficulty'], number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
}

function normalizeVariantLinks(data: unknown): AdaptiveVariantLink[] {
  if (!Array.isArray(data)) return []

  return data
    .filter((item): item is AdaptiveVariantLink => {
      if (!item || typeof item !== 'object') return false
      const candidate = item as Partial<AdaptiveVariantLink>
      return (
        (candidate.difficulty === 'beginner' ||
          candidate.difficulty === 'intermediate' ||
          candidate.difficulty === 'advanced') &&
        typeof candidate.batchId === 'string' &&
        typeof candidate.batchName === 'string' &&
        typeof candidate.joinLink === 'string'
      )
    })
    .sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty])
}

export type UseCourseBuilderContentArgs = {
  courseId: string | null
  insightsProps?: CourseBuilderInsightsProps
  dataMode?: 'default' | 'detached'
  detachedStorageKey?: string
  detachedCourseName?: string
}

export function useCourseBuilderContentModel({
  courseId,
  insightsProps: _insightsProps,
  dataMode = 'default',
  detachedStorageKey,
  detachedCourseName,
}: UseCourseBuilderContentArgs) {
  const [course, setCourse] = useState<CourseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadedLessons, setLoadedLessons] = useState<CourseBuilderLesson[] | null>(null)
  const [savedVariants, setSavedVariants] = useState<AdaptiveVariantLink[]>([])
  const courseBuilderRef = useRef<CourseBuilderRef>(null)
  const router = useRouter()

  const [themeId, setThemeId] = useState('current')
  const selectedTheme = DASHBOARD_THEMES.find(theme => theme.id === themeId) ?? DASHBOARD_THEMES[0]
  const themeStyle = getThemeStyle(selectedTheme)

  const shouldShowCoursePickerEmpty = !courseId && dataMode !== 'detached'

  useEffect(() => {
    const savedTheme = localStorage.getItem('tutor-dashboard-theme')
    if (savedTheme) {
      setThemeId(savedTheme)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('tutor-dashboard-theme', themeId)
  }, [themeId])

  const loadCourse = useCallback(async () => {
    if (!courseId) return
    setLoading(true)
    // Reset lessons immediately to prevent stale data from previous course
    setLoadedLessons(null)
    const isDetached = dataMode === 'detached'
    const storageKey = detachedStorageKey || `insights-course-builder:${courseId}`
    try {
      if (isDetached) {
        setCourse({
          id: courseId,
          name: detachedCourseName || 'Insights Builder',
          studentCount: 0,
          isPublished: false,
        })
        const stored = localStorage.getItem(storageKey)
        if (stored) {
          const parsed = JSON.parse(stored) as { lessons?: CourseBuilderLesson[] }
          if (Array.isArray(parsed.lessons) && parsed.lessons.length > 0) {
            setLoadedLessons(parsed.lessons)
          }
        }
        return
      }
      const res = await fetch(`/api/tutor/courses/${courseId}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setCourse(data.course)
      }

      const currRes = await fetch(`/api/tutor/courses/${courseId}/course`, {
        credentials: 'include',
      })
      if (currRes.ok) {
        const currData = await currRes.json()
        if (Array.isArray(currData.lessons)) {
          setLoadedLessons(currData.lessons)
        }
      } else {
        // Explicitly null out on API failure so we don't show stale lessons
        setLoadedLessons(null)
      }
    } catch {
      setLoadedLessons(null)
    } finally {
      setLoading(false)
    }
  }, [courseId, dataMode, detachedCourseName, detachedStorageKey])

  useEffect(() => {
    if (shouldShowCoursePickerEmpty) {
      setLoading(false)
      return
    }
    loadCourse()
  }, [loadCourse, shouldShowCoursePickerEmpty])

  const handleSave = async (
    lessons: CourseBuilderLesson[],
    options?: {
      developmentMode: 'single' | 'multi'
      previewDifficulty: 'all' | 'beginner' | 'intermediate' | 'advanced'
      courseName?: string
      courseDescription?: string
      isAutoSave?: boolean
    }
  ) => {
    const isDetached = dataMode === 'detached'

    // Guard against wiping the course when its content never loaded. On a
    // DB-backed course, loadedLessons stays null only while the load is still
    // pending or has failed (a successfully-empty course loads as []). Saving an
    // empty tree in that state would soft-delete every lesson server-side — and
    // the server floor only spares DEPLOYED lessons, so un-deployed ones would be
    // lost. This MUST also cover autosave: the mount autosave fires on a 2s
    // debounce and can beat a slow load, sending an empty payload. Autosave is
    // silent; a manual save tells the tutor to wait.
    if (!isDetached && lessons.length === 0 && loadedLessons === null) {
      if (!options?.isAutoSave) {
        toast.error('Lessons haven’t finished loading yet — reload the course before saving.')
      }
      return
    }

    if (!options?.isAutoSave && !isDetached) setSaving(true)

    const result = await saveCourse({
      courseId,
      lessons,
      mode: isDetached ? 'draft' : 'live',
      storageKey: detachedStorageKey,
      courseName: options?.courseName,
      courseDescription: options?.courseDescription,
      developmentMode: options?.developmentMode,
      previewDifficulty: options?.previewDifficulty,
      isAutoSave: options?.isAutoSave,
    })

    if (!options?.isAutoSave && !isDetached) setSaving(false)

    if (result.success) {
      if (!options?.isAutoSave) {
        toast.success(isDetached ? 'Insights draft saved' : 'Course Saved')
      }

      // Redirect after creating a new course from builder-draft
      if (courseId === 'builder-draft' && options?.courseName && result.courseId) {
        router.replace(`/tutor/insights?tab=builder&courseId=${result.courseId}`)
      }

      // Extract adaptive variants on successful API save
      if (!isDetached) {
        const ordered = normalizeVariantLinks((result.data as any)?.variants)
        if (ordered.length > 0) {
          setSavedVariants(ordered)
          if (!options?.isAutoSave) {
            toast.success(`Adaptive variants ready: ${ordered.map(v => v.difficulty).join(', ')}`)
          }
        } else {
          setSavedVariants([])
        }
      }
    } else {
      if (!options?.isAutoSave) toast.error(result.error || 'Failed to save course')
    }
  }

  return {
    course,
    loading,
    saving,
    loadedLessons,
    savedVariants,
    courseBuilderRef,
    router,
    themeId,
    setThemeId,
    themeStyle,
    handleSave,
    shouldShowCoursePickerEmpty,
  }
}
