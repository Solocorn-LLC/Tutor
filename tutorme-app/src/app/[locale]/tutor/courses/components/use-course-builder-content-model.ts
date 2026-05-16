'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { DASHBOARD_THEMES, getThemeStyle } from '@/components/dashboard-theme'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
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
        if (Array.isArray(currData.lessons) && currData.lessons.length > 0) {
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
    if (isDetached) {
      const storageKey = detachedStorageKey || `insights-course-builder:${courseId ?? 'default'}`
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            lessons,
            savedAt: new Date().toISOString(),
            options: {
              developmentMode: options?.developmentMode ?? 'single',
              previewDifficulty: options?.previewDifficulty ?? 'all',
            },
          })
        )
        if (!options?.isAutoSave) toast.success('Insights draft saved')
      } catch {
        if (!options?.isAutoSave) toast.error('Failed to save Insights draft')
      }
      return
    }
    if (!options?.isAutoSave) setSaving(true)
    try {
      let currentCourseId = courseId

      if (courseId === 'builder-draft' && options?.courseName) {
        const createRes = await fetchWithCsrf('/api/tutor/courses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: options.courseName,
            description: options.courseDescription || '',
          }),
        })

        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}))
          throw new Error(err.error ?? 'Failed to create course')
        }

        const newCourseData = await createRes.json()
        currentCourseId = newCourseData.courses?.[0]?.id
        if (!currentCourseId) {
          throw new Error('Course creation response missing course ID')
        }
        router.replace(`/tutor/insights?tab=builder&courseId=${currentCourseId}`)
      }

      const res = await fetchWithCsrf(`/api/tutor/courses/${currentCourseId}/course`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessons,
          developmentMode: options?.developmentMode ?? 'single',
          previewDifficulty: options?.previewDifficulty ?? 'all',
          description: options?.courseDescription,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (!options?.isAutoSave) toast.success('Course Saved')
        const ordered = normalizeVariantLinks(data.variants)
        if (ordered.length > 0) {
          setSavedVariants(ordered)
          if (!options?.isAutoSave)
            toast.success(`Adaptive variants ready: ${ordered.map(v => v.difficulty).join(', ')}`)
        } else {
          setSavedVariants([])
        }
      } else {
        const err = await res.json().catch(() => ({}))
        if (!options?.isAutoSave) toast.error(err.error ?? 'Failed to save course')
      }
    } catch {
      if (!options?.isAutoSave) toast.error('Failed to save course')
    } finally {
      if (!options?.isAutoSave) setSaving(false)
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
