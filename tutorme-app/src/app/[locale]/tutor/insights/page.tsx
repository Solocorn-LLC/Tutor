'use client'

import { Suspense } from 'react'
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CourseBuilderInsightsRoute } from '../courses/components/CourseBuilderInsightsRoute'
import { PanelErrorBoundary } from '@/components/ui/panel-error-boundary'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { useSocket } from '@/hooks/use-socket'
import { saveCourse } from '../courses/components/save-course'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { CountryFlag } from '@/components/country-flag'
import type { LiveTask } from '@/lib/socket'
import type { LiveStudent, EngagementMetrics } from '@/types/live-session'
import type { ScheduleItem } from '../courses/[id]/constants'

interface CourseSummary {
  id: string
  name: string
  updatedAt: string
  categories?: string[]
  isPublished?: boolean
  nationality?: string
  variantCategory?: string
  isVariant?: boolean
  schedule?: ScheduleItem[]
}

interface InsightsSessionOption {
  id: string
  title: string
  subject: string
  scheduledAt: string
  status: string
  durationMinutes: number
}

// Stroke points may be compressed (flat number array) from socket delta sync.
// Decompress to {x,y} Point[] so the canvas can render them.
function decompressPoints(flat: number[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i], y: flat[i + 1] })
  return pts
}

function normalizeStroke(stroke: any): any {
  if (!stroke) return stroke
  const pts = stroke.points
  if (!pts || !Array.isArray(pts) || pts.length === 0) return stroke
  // Already decompressed?
  if (typeof pts[0] === 'object' && pts[0] !== null && 'x' in pts[0]) return stroke
  // Compressed flat array
  return { ...stroke, points: decompressPoints(pts) }
}

function TutorInsightsPageInner() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [courseId, setCourseId] = useState<string | null>(null)
  const [detachedCourseName, setDetachedCourseName] = useState('Course')
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<InsightsSessionOption[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [linkedCourseId, setLinkedCourseId] = useState<string | null>(null)
  const [sessionCategory, setSessionCategory] = useState<string | null>(null)
  const [sessionNationality, setSessionNationality] = useState<string | null>(null)
  // Canonical "Category — Nationality" label from the API (formatCourseVariantName),
  // so the tutor header matches exactly what the student side shows.
  const [sessionVariantName, setSessionVariantName] = useState<string | null>(null)
  const [liveTasks, setLiveTasks] = useState<LiveTask[]>([])
  // In-session task/assessment completions (with answers) for the Submissions tab.
  const [liveSubmissions, setLiveSubmissions] = useState<
    {
      taskId: string
      studentId: string
      studentName?: string
      submittedAt: string | number
      answers?: Record<string, string>
    }[]
  >([])
  const [studentBoards, setStudentBoards] = useState<
    Record<string, { pages: unknown[]; pageIndex: number; updatedAt?: number }>
  >({})
  const [students, setStudents] = useState<LiveStudent[]>([])
  const [metrics, setMetrics] = useState<EngagementMetrics | null>(null)
  const [classDuration, setClassDuration] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(0)
  const courseIdFromQuery = searchParams.get('courseId')

  const [courseName, setCourseName] = useState('')
  const [newCourseName, setNewCourseName] = useState('')
  const [newCourseCategories, setNewCourseCategories] = useState<string[]>([])
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [propagationDialogOpen, setPropagationDialogOpen] = useState(false)
  const [pendingSavePayload, setPendingSavePayload] = useState<{
    lessons: any[]
    options?: any
  } | null>(null)
  // When opened from Dashboard sidebar or My Page Create Course, start in draft mode
  const startInEditMode = searchParams.get('mode') === 'edit'
  // Embedded in the in-session Edit-course modal: edit UI, but persist straight
  // to the DB (live) and auto-save — so "changes sync everywhere" holds.
  const embedded = searchParams.get('embed') === '1'
  const [saveMode, setSaveMode] = useState<'live' | 'draft'>(
    searchParams.get('sessionId') || embedded ? 'live' : startInEditMode ? 'draft' : 'live'
  )
  const [draftCourses, setDraftCourses] = useState<CourseSummary[]>([])

  // User-specific localStorage key so drafts don't leak across accounts on shared devices
  const draftStorageKey = useMemo(
    () => `lesson-bank-courses-v1:${session?.user?.id || 'anonymous'}`,
    [session?.user?.id]
  )

  // Auto-detect saveMode when courseId is set from URL or dropdown
  // BUT respect explicit mode=edit query param (set by Create Course / Course Builder nav)
  useEffect(() => {
    if (!courseId || courseId === 'insights-draft') return
    // A sessionId or the embedded Edit-course modal force live (DB) persistence.
    if (searchParams.get('sessionId') || searchParams.get('embed') === '1') {
      setSaveMode('live')
      return
    }
    // Respect explicit mode=edit query param — don't auto-detect away from draft
    if (searchParams.get('mode') === 'edit') {
      setSaveMode('draft')
      return
    }
    // Otherwise detect from which list the course belongs to
    const isLive = courses.some(c => c.id === courseId)
    const isDraft = draftCourses.some(c => c.id === courseId)
    if (isLive && !isDraft) {
      setSaveMode('live')
    } else if (isDraft && !isLive) {
      setSaveMode('draft')
    }
    // If both or neither (e.g., during loading), leave current value
  }, [courseId, courses, draftCourses, searchParams])

  // Migrate legacy draft data saved under `modules` in lesson-bank-courses-v1
  // to the new `insights-course-builder:${courseId}` key with `lessons`
  useEffect(() => {
    if (!courseId || courseId === 'insights-draft') return
    const builderKey = `insights-course-builder:${courseId}`
    if (localStorage.getItem(builderKey)) return // Already migrated or saved
    try {
      const raw = localStorage.getItem(draftStorageKey)
      const parsed = raw ? JSON.parse(raw) : []
      const course = parsed.find((c: any) => c.id === courseId)
      if (course && Array.isArray(course.modules) && course.modules.length > 0) {
        localStorage.setItem(
          builderKey,
          JSON.stringify({
            lessons: course.modules,
            savedAt: course.updatedAt || new Date().toISOString(),
          })
        )
      }
    } catch {
      // ignore
    }
  }, [courseId, draftStorageKey])

  // Load draft courses from lesson bank localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftStorageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setDraftCourses(
            parsed.map((c: any) => ({
              id: c.id,
              name: c.name,
              updatedAt: c.updatedAt,
              categories: c.categories || [],
              isPublished: c.isPublished || false,
            }))
          )
        }
      }
    } catch {
      // ignore
    }
  }, [draftStorageKey, isCreateDialogOpen, isDeleteDialogOpen])

  useEffect(() => {
    // Search both lists regardless of saveMode so the name syncs correctly
    // even when mode is locked to draft and a live course is selected
    const match = [...courses, ...draftCourses].find(c => c.id === courseId)
    if (match) setCourseName(match.name)
  }, [courseId, courses, draftCourses, saveMode, detachedCourseName])

  const handleCourseNameChange = useCallback(
    async (newName: string) => {
      setCourseName(newName)
      if (!courseId || courseId === 'insights-draft') return

      // Optimistically update BOTH lists so dropdown matches instantly
      // regardless of which saveMode is currently active
      setDraftCourses(prev => prev.map(c => (c.id === courseId ? { ...c, name: newName } : c)))
      setCourses(prev => prev.map(c => (c.id === courseId ? { ...c, name: newName } : c)))

      // Also update localStorage drafts
      try {
        const raw = localStorage.getItem(draftStorageKey)
        const parsed = raw ? JSON.parse(raw) : []
        const updated = parsed.map((c: any) =>
          c.id === courseId
            ? { ...c, name: newName.trim(), updatedAt: new Date().toISOString() }
            : c
        )
        localStorage.setItem(draftStorageKey, JSON.stringify(updated))
      } catch {
        // silent fail
      }

      // Persist to API for live courses (and drafts that have a DB id)
      const match = [...courses, ...draftCourses].find(c => c.id === courseId)
      if (match && newName.trim() !== match.name) {
        try {
          await fetchWithCsrf(`/api/tutor/courses/${courseId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim() }),
          })
        } catch {
          // silent fail
        }
      }
    },
    [courseId, courses, draftCourses, draftStorageKey]
  )

  useEffect(() => {
    if (!isRecording) {
      setRecordingDurationSeconds(0)
      return
    }
    const interval = setInterval(() => {
      setRecordingDurationSeconds(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [isRecording])

  const persistRecordingState = useCallback(
    async (recording: boolean) => {
      if (!sessionId) return
      await fetchWithCsrf(`/api/tutor/live-sessions/${sessionId}/recording`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isRecording: recording,
          recordingUrl: null, // Insights only tracks state
        }),
      })
    },
    [sessionId]
  )

  const generateReplayArtifact = useCallback(async () => {
    if (!sessionId) return
    const response = await fetch(`/api/tutor/live-sessions/${sessionId}/replay-artifact/generate`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) {
      throw new Error('Replay artifact generation failed')
    }
  }, [sessionId])

  const handleStopRecording = useCallback(async () => {
    if (!isRecording) return
    try {
      setIsRecording(false)
      await persistRecordingState(false)
      toast.success('Recording stopped. Building transcript and AI lesson summary...')
      await generateReplayArtifact()
      toast.success('Replay artifact ready')
    } catch (error) {
      setIsRecording(false)
      setRecordingDurationSeconds(0)
      toast.error(error instanceof Error ? error.message : 'Recording action failed')
    }
  }, [generateReplayArtifact, isRecording, persistRecordingState])

  const handleToggleRecording = useCallback(async () => {
    try {
      if (isRecording) {
        await handleStopRecording()
        return
      }

      // Guard: cannot start recording before scheduled time or after session ended
      if (!sessionId) {
        toast.error('No session selected')
        return
      }
      const currentSession = sessions.find(s => s.id === sessionId)
      if (!currentSession) {
        toast.error('Session not found')
        return
      }
      if (currentSession.status === 'ended') {
        toast.error('Session has ended')
        return
      }
      // No scheduledAt gate — a tutor can start (and record) the session early.

      setIsRecording(true)
      setRecordingDurationSeconds(0)
      await persistRecordingState(true)
      toast.success('Recording started')
    } catch (error) {
      setIsRecording(false)
      setRecordingDurationSeconds(0)
      toast.error(error instanceof Error ? error.message : 'Recording action failed')
    }
  }, [isRecording, persistRecordingState, handleStopRecording, sessionId, sessions])

  const isPublishedVariant = useMemo(() => {
    if (!courseId) return false
    const course = courses.find(c => c.id === courseId)
    return course?.isPublished === true && course?.isVariant === true
  }, [courseId, courses])

  const executeSave = useCallback(
    async (
      lessons: any[],
      options?: any,
      propagateToVariants?: boolean,
      setIndependent?: boolean
    ) => {
      // Published variants always persist to the DB (mode='live') even when the UI is in 'draft' edit mode
      const persistMode = isPublishedVariant ? 'live' : saveMode

      const result = await saveCourse({
        courseId,
        lessons,
        mode: persistMode,
        draftListStorageKey: draftStorageKey,
        courseName: options?.courseName,
        courseDescription: options?.courseDescription,
        // When a draft is first persisted to the DB, carry the category chosen
        // at creation (drafts hold it locally) so it isn't lost.
        categories: [...courses, ...draftCourses].find(c => c.id === courseId)?.categories,
        detachedCourseName,
        isAutoSave: options?.isAutoSave,
        propagateToVariants,
        setIndependent,
      })

      if (options?.isAutoSave) return

      if (result.success) {
        toast.success(persistMode === 'draft' ? 'Draft saved' : 'Course saved successfully')

        // If a new course was created (draft sentinel → real DB course),
        // update state + URL so refresh loads the persisted course
        if (result.courseId && result.courseId !== courseId) {
          // Carry the draft's categories onto the persisted course so the builder
          // header keeps showing the full name (name + category), not just the name.
          const draftCategories = [...courses, ...draftCourses].find(
            c => c.id === courseId
          )?.categories
          const newCourse = {
            id: result.courseId,
            name: options?.courseName || detachedCourseName || 'Untitled Course',
            categories: draftCategories,
            updatedAt: new Date().toISOString(),
          }
          setCourses(prev => {
            if (prev.some(c => c.id === result.courseId)) return prev
            return [...prev, newCourse]
          })
          setCourseId(result.courseId)
          setSaveMode('live')
          router.replace(`/tutor/insights?tab=builder&courseId=${result.courseId}`)
        }
      } else {
        console.error('[Insights] Save failed:', result.error)
        toast.error(
          result.error ||
            (persistMode === 'draft' ? 'Failed to save draft' : 'Failed to save course')
        )
      }
    },
    [
      courseId,
      saveMode,
      draftStorageKey,
      isPublishedVariant,
      detachedCourseName,
      router,
      courses,
      draftCourses,
    ]
  )

  const handleSave = useCallback(
    async (lessons: any[], options?: any) => {
      // For published variants, propagate edits to sibling variants (those
      // published with this course, NOT all tutor courses) — but ONLY on an
      // explicit manual Save. Autosave is debounced and silent (no toast), so
      // auto-propagating would rewrite every sibling variant on each edit burst
      // with no confirmation. On autosave we fall through and persist just this
      // variant (persistMode stays 'live' for a published variant, so the edit
      // is still saved to the DB — it simply doesn't touch the siblings).
      if (isPublishedVariant && !options?.isAutoSave) {
        await executeSave(lessons, options, true, false)
        return
      }

      await executeSave(lessons, options)
    },
    [courseId, isPublishedVariant, executeSave]
  )

  const handleCreateNewCourse = useCallback(async () => {
    if (!newCourseName.trim()) {
      toast.error('Please enter a course name')
      return
    }
    if (newCourseCategories.length === 0) {
      toast.error('Please select a category')
      return
    }
    if (saveMode === 'draft') {
      const newCourse = {
        id: `course-${Date.now()}`,
        name: newCourseName.trim(),
        categories: newCourseCategories,
        modules: [],
        updatedAt: new Date().toISOString(),
      }
      try {
        const raw = localStorage.getItem(draftStorageKey)
        const parsed = raw ? JSON.parse(raw) : []
        const updated = [...parsed, newCourse]
        localStorage.setItem(draftStorageKey, JSON.stringify(updated))
        // Initialize empty builder content so loadCourse finds the key
        localStorage.setItem(
          `insights-course-builder:${newCourse.id}`,
          JSON.stringify({ lessons: [], savedAt: new Date().toISOString() })
        )
        setDraftCourses(prev => [
          ...prev,
          {
            id: newCourse.id,
            name: newCourse.name,
            categories: newCourseCategories,
            updatedAt: newCourse.updatedAt,
          },
        ])
        setCourseId(newCourse.id)
        setDetachedCourseName(newCourse.name)
        // Point the URL at the new course so the courseId<-URL sync effect keeps
        // it selected instead of snapping back to the previous ?courseId= value.
        router.replace(`/tutor/insights?tab=builder&courseId=${newCourse.id}`)
        setNewCourseName('')
        setNewCourseCategories([])
        setIsCreateDialogOpen(false)
        toast.success(`Created draft "${newCourse.name}"`)
      } catch {
        toast.error('Failed to create draft')
      }
      return
    }
    try {
      const res = await fetchWithCsrf('/api/tutor/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newCourseName.trim(),
          categories: newCourseCategories,
          schedule: [],
          isLiveOnline: false,
        }),
      })

      const data = await res.json()
      const createdCourse = data.courses?.[0]
      if (res.ok && createdCourse?.id) {
        // Ensure the new course carries its category into state so the builder
        // header shows the full name (name + category) immediately.
        const withCategories = {
          ...createdCourse,
          categories:
            Array.isArray(createdCourse.categories) && createdCourse.categories.length > 0
              ? createdCourse.categories
              : newCourseCategories,
        }
        setCourses(prev => [...prev, withCategories])
        setCourseId(createdCourse.id)
        setDetachedCourseName(createdCourse.name)
        // Point the URL at the new course so the courseId<-URL sync effect keeps
        // it selected instead of snapping back to the previous ?courseId= value.
        router.replace(`/tutor/insights?tab=builder&courseId=${createdCourse.id}`)
        setNewCourseName('')
        setNewCourseCategories([])
        setIsCreateDialogOpen(false)
        toast.success(`Created course "${createdCourse.name}"`)
      } else {
        toast.error(data.error || 'Failed to create course')
      }
    } catch {
      toast.error('Failed to create course')
    }
  }, [newCourseName, newCourseCategories, saveMode, router, draftStorageKey])

  // Persist an edited course name/categories from the control-panel Edit button.
  const handleUpdateCourse = useCallback(
    async (id: string, patch: { name: string; categories: string[] }) => {
      // Optimistic local update so the builder header reflects it immediately.
      setCourses(prev =>
        prev.map(c => (c.id === id ? { ...c, name: patch.name, categories: patch.categories } : c))
      )
      setDraftCourses(prev =>
        prev.map(c => (c.id === id ? { ...c, name: patch.name, categories: patch.categories } : c))
      )
      if (id === courseId) setDetachedCourseName(patch.name)

      // Drafts live only in localStorage; DB courses persist via PATCH.
      const isDraft = draftCourses.some(c => c.id === id)
      if (isDraft) {
        try {
          const raw = localStorage.getItem(draftStorageKey)
          const parsed = raw ? JSON.parse(raw) : []
          localStorage.setItem(
            draftStorageKey,
            JSON.stringify(
              parsed.map((c: any) =>
                c.id === id ? { ...c, name: patch.name, categories: patch.categories } : c
              )
            )
          )
        } catch {
          // ignore
        }
        toast.success('Course updated')
        return
      }
      try {
        const res = await fetchWithCsrf(`/api/tutor/courses/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: patch.name, categories: patch.categories }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          toast.error(data.error || 'Failed to update course')
          return
        }
        toast.success('Course updated')
      } catch {
        toast.error('Failed to update course')
      }
    },
    [courseId, draftCourses, draftStorageKey]
  )

  const handleDeleteCourse = useCallback(async () => {
    if (!courseId || courseId === 'insights-draft') return

    // Determine if this courseId is a localStorage draft or a DB course
    const isDraft = draftCourses.some(c => c.id === courseId)

    if (isDraft) {
      try {
        const raw = localStorage.getItem(draftStorageKey)
        const parsed = raw ? JSON.parse(raw) : []
        const updated = parsed.filter((c: any) => c.id !== courseId)
        localStorage.setItem(draftStorageKey, JSON.stringify(updated))
        // Also clean up detached builder content
        localStorage.removeItem(`insights-course-builder:${courseId}`)
        const remaining = draftCourses.filter(c => c.id !== courseId)
        setDraftCourses(remaining)
        const next = remaining[0] || courses[0]
        if (next) {
          setCourseId(next.id)
          setDetachedCourseName(next.name)
        } else {
          setCourseId('insights-draft')
          setDetachedCourseName('Insights Builder')
        }
        setIsDeleteDialogOpen(false)
        toast.success('Draft deleted')
      } catch {
        toast.error('Failed to delete draft')
      }
      return
    }

    // Live/DB course deletion
    try {
      const doDelete = async (confirmed: boolean) =>
        fetchWithCsrf(`/api/tutor/courses/${courseId}${confirmed ? '?confirm=true' : ''}`, {
          method: 'DELETE',
        })

      const res = await doDelete(false)

      if (res.ok) {
        const remaining = courses.filter(c => c.id !== courseId)
        setCourses(remaining)
        const next = remaining[0] || draftCourses[0]
        if (next) {
          setCourseId(next.id)
          setDetachedCourseName(next.name)
        } else {
          setCourseId('insights-draft')
          setDetachedCourseName('Insights Builder')
        }
        setIsDeleteDialogOpen(false)
        toast.success('Course deleted')
      } else {
        const data = await res.json().catch(() => ({}))
        if (res.status === 409 && data?.requiresConfirmation) {
          const enrolledCount = Number(data?.enrolledCount || 0)
          const courseName = data?.courseName || detachedCourseName || 'this course'
          const ok = confirm(
            `This published course has ${enrolledCount} enrolled student${enrolledCount === 1 ? '' : 's'}.\n\nDeleting it will automatically initiate refunds for paid enrollments and notify students.\n\nDelete "${courseName}" anyway?`
          )
          if (!ok) return
          const confirmedRes = await doDelete(true)
          const confirmedData = await confirmedRes.json().catch(() => ({}))
          if (confirmedRes.ok) {
            const remaining = courses.filter(c => c.id !== courseId)
            setCourses(remaining)
            const next = remaining[0] || draftCourses[0]
            if (next) {
              setCourseId(next.id)
              setDetachedCourseName(next.name)
            } else {
              setCourseId('insights-draft')
              setDetachedCourseName('Insights Builder')
            }
            setIsDeleteDialogOpen(false)
            const refundsInitiated = Number(confirmedData?.refundsInitiated || 0)
            toast.success(
              refundsInitiated > 0
                ? `Course deleted. Refunds initiated for ${refundsInitiated} payment${refundsInitiated === 1 ? '' : 's'}.`
                : 'Course deleted'
            )
            return
          }
          toast.error(confirmedData?.error || 'Failed to delete course')
          return
        }
        toast.error(data?.error || 'Failed to delete course')
      }
    } catch {
      toast.error('Failed to delete course')
    }
  }, [courseId, courses, draftCourses, draftStorageKey, detachedCourseName])

  useEffect(() => {
    if (!sessionId) {
      setStudents([])
      setMetrics(null)
      setClassDuration(0)
      return
    }
    // Optional: Fetch live class details (students, metrics) if needed
    // For now, initializing with empty/defaults to satisfy props
  }, [sessionId])

  useEffect(() => {
    const loadCourses = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/tutor/courses', { credentials: 'include' })
        if (!res.ok) {
          // Only set draft if we don't have a session that will give us the courseId
          if (!searchParams.get('sessionId')) {
            setCourseId('insights-draft')
            setDetachedCourseName('Insights Builder')
          }
          return
        }
        const data = await res.json()
        const courseList = (data.courses || []) as CourseSummary[]
        setCourses(courseList)

        // Check if we have a sessionId that will give us a courseId
        const hasSessionInUrl = !!searchParams.get('sessionId')
        const hasCourseInUrl = !!courseIdFromQuery

        if (courseList.length > 0) {
          const sorted = [...courseList].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )

          // Only set a default course if we don't have a specific session
          if (!hasSessionInUrl && !hasCourseInUrl) {
            setCourseId(prev => prev ?? sorted[0].id)
            setDetachedCourseName(sorted[0].name)
          }
        } else if (!hasSessionInUrl) {
          // No courses found and no session, use default
          setCourseId('insights-draft')
          setDetachedCourseName('Insights Builder')
        }
      } catch (error) {
        if (!searchParams.get('sessionId')) {
          setCourseId('insights-draft')
          setDetachedCourseName('Insights Builder')
        }
      } finally {
        setLoading(false)
      }
    }

    loadCourses()
  }, [courseIdFromQuery, searchParams])

  useEffect(() => {
    if (!courseIdFromQuery) return
    setCourseId(courseIdFromQuery)
    const match = courses.find(course => course.id === courseIdFromQuery)
    if (match) setDetachedCourseName(match.name)
  }, [courseIdFromQuery, courses])

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const querySessionId = searchParams.get('sessionId')
        // Set sessionId from query immediately if present
        if (querySessionId) {
          setSessionId(querySessionId)
        }

        const res = await fetch('/api/tutor/classes', { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load sessions')
        const data = await res.json()
        const classSessions = (
          (data.classes || []) as Array<InsightsSessionOption & { duration?: number }>
        ).map(s => ({
          ...s,
          durationMinutes: s.duration ?? 60,
        }))
        setSessions(classSessions)

        const activeSession = classSessions.find(item => item.status === 'active')

        if (querySessionId && classSessions.some(s => s.id === querySessionId)) {
          // Already set, but confirming it exists in the list
          setSessionId(querySessionId)
        } else if (
          !querySessionId &&
          searchParams.get('tab') !== 'builder' &&
          searchParams.get('mode') !== 'edit'
        ) {
          if (activeSession) {
            setSessionId(prev => prev ?? activeSession.id)
          } else if (classSessions.length > 0) {
            setSessionId(prev => prev ?? classSessions[0].id)
          }
        }
      } catch (error) {
        toast.error('Failed to load live sessions')
      }
    }

    loadSessions()
  }, [searchParams])

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    const loadLinkedCourse = async () => {
      try {
        const res = await fetch(`/api/tutor/classes/${sessionId}`, { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setLinkedCourseId(data?.session?.linkedCourseId || null)
        setSessionCategory(data?.session?.category || null)
        setSessionNationality(data?.session?.nationality || null)
        setSessionVariantName(data?.session?.variantName || null)
      } catch {
        // Ignore; keep existing selection
      }
    }
    loadLinkedCourse()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    if (!linkedCourseId) return
    const sessionParam = searchParams.get('sessionId')
    if (sessionParam) {
      setCourseId(linkedCourseId)
    } else {
      setCourseId(prev => {
        if (prev && prev !== 'insights-draft' && prev !== linkedCourseId) return prev
        return linkedCourseId
      })
    }
    const match = courses.find(course => course.id === linkedCourseId)
    if (match) setDetachedCourseName(match.name)
  }, [courses, linkedCourseId, searchParams])

  useEffect(() => {
    setLiveTasks([])
    setStudentBoards({})
  }, [sessionId])

  const socketOptions = useMemo(() => {
    if (!sessionId || !session?.user?.id) return undefined
    return {
      roomId: sessionId,
      userId: session.user.id,
      name: session.user.name || 'Tutor',
      role: 'tutor' as const,
      onRoomState: (state: { tasks?: LiveTask[]; whiteboardData?: any; students?: any[] }) => {
        if (state.tasks) {
          setLiveTasks(state.tasks)
        }
        if (state.whiteboardData?.studentBoards) {
          const boards = state.whiteboardData.studentBoards as Record<string, any>
          const normalizedBoards: typeof studentBoards = {}
          Object.entries(boards).forEach(([uid, board]) => {
            const pages = (board as any)?.pages?.map((page: any) => ({
              ...page,
              strokes: (page.strokes || []).map((s: any) => normalizeStroke(s)),
            }))
            normalizedBoards[uid] = { ...(board as any), pages }
          })
          setStudentBoards(normalizedBoards)
        }
        if (state.students && Array.isArray(state.students)) {
          setStudents(prev => {
            const map = new Map<string, any>()
            prev.forEach(s => {
              const id = (s as any)?.userId ?? s?.id
              if (id) map.set(id, s)
            })
            state.students!.forEach((s: any) => {
              const id = s?.userId ?? s?.id
              if (!id) return
              const existing = map.get(id) || {}
              map.set(id, {
                ...existing,
                ...s,
                id,
                status: s.status || existing.status || 'online',
              })
            })
            return Array.from(map.values())
          })
        }
      },
      onStudentJoined: (student: any) => {
        const id = student?.userId ?? student?.id
        if (!id) return
        setStudents(prev => {
          const exists = prev.some(s => ((s as any)?.userId ?? s?.id) === id)
          if (exists) {
            return prev.map(s =>
              ((s as any)?.userId ?? s?.id) === id ? { ...s, ...student, status: 'online' } : s
            )
          }
          return [...prev, { ...student, id, status: 'online' }]
        })
      },
      onStudentLeft: (userId: string) => {
        // Remove the student so the client roster mirrors the server's
        // room.students (which deletes on disconnect). Previously this only
        // flipped status to 'offline', so departed students accumulated forever
        // and the Monitor tab showed people who had already left.
        setStudents(prev => prev.filter(s => ((s as any)?.userId ?? s?.id) !== userId))
      },
      onStudentStateUpdate: (data: { userId: string; state: any }) => {
        setStudents(prev =>
          prev.map(s =>
            ((s as any)?.userId ?? s?.id) === data.userId ? { ...s, ...data.state } : s
          )
        )
      },
    }
  }, [session?.user?.id, session?.user?.name, sessionId])

  const { socket, isConnected: socketConnected } = useSocket(socketOptions)

  const handleSyncToLiveSession = useCallback(
    (silent = false) => {
      if (sessionId && socket) {
        socket.emit('course:sync', { roomId: sessionId, courseId })
      }
      // Background auto-sync passes silent=true; only manual syncs toast.
      if (!silent) toast.success('Course synced to live session')
    },
    [sessionId, socket, courseId]
  )

  // Track whether the current session has received the ending-soon alert
  const [endingAlertShown, setEndingAlertShown] = useState(false)
  const hasAutoSyncedRef = useRef<string | null>(null)

  useEffect(() => {
    setEndingAlertShown(false)
  }, [sessionId])

  // Auto-sync course content when entering a live session from URL
  useEffect(() => {
    if (!sessionId || !socket || !courseId || courseId === 'insights-draft') return
    if (hasAutoSyncedRef.current === sessionId) return
    hasAutoSyncedRef.current = sessionId
    socket.emit('course:sync', { roomId: sessionId, courseId })
    toast.success('Course content auto-synced to students')
  }, [sessionId, socket, courseId])

  useEffect(() => {
    if (!socket) return

    const handleTaskDeployed = (task: LiveTask) => {
      setLiveTasks(prev => {
        const exists = prev.some(item => item.id === task.id)
        if (exists) {
          return prev.map(item => (item.id === task.id ? { ...item, ...task } : item))
        }
        return [...prev, task]
      })
      // Confirm only once the server has broadcast the deploy — this is the real
      // "it reached students" signal, vs. an optimistic toast fired on click
      // before the emit was even acknowledged.
      toast.success(`Deployed to students${task.title ? `: ${task.title}` : ''}`)
    }

    const handleTaskUpdated = (payload: { task: LiveTask }) => {
      setLiveTasks(prev => prev.map(item => (item.id === payload.task.id ? payload.task : item)))
    }

    const handleTaskCompleted = (data: {
      taskId: string
      studentId: string
      studentName: string
      completedAt: number
      totalCompleted: number
      answers?: Record<string, string>
    }) => {
      toast.success(`${data.studentName} completed a task`, {
        description: `${data.totalCompleted} student${data.totalCompleted === 1 ? '' : 's'} completed this task`,
      })
      // Also update the task in liveTasks so the completedBy count is available
      setLiveTasks(prev =>
        prev.map(item =>
          item.id === data.taskId
            ? { ...item, completedBy: [...(item.completedBy || []), data.studentId] }
            : item
        )
      )
      // Record the submission (with any typed answers) so the Submissions tab
      // shows it live. Replace any prior entry for the same student+task.
      setLiveSubmissions(prev => [
        ...prev.filter(s => !(s.taskId === data.taskId && s.studentId === data.studentId)),
        {
          taskId: data.taskId,
          studentId: data.studentId,
          studentName: data.studentName,
          submittedAt: data.completedAt,
          answers: data.answers,
        },
      ])
    }

    const handleSessionEndingSoon = (data: { sessionId: string; minutesRemaining: number }) => {
      if (data.sessionId === sessionId && !endingAlertShown) {
        setEndingAlertShown(true)
        toast.warning(`Session ending in ${data.minutesRemaining} minutes!`, {
          duration: 10000,
          icon: '⏰',
        })
      }
    }

    const handleSessionEnded = (data: { sessionId: string; reason?: string }) => {
      if (data.sessionId === sessionId) {
        // Update local session status
        setSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, status: 'ended' } : s)))
        // Auto-stop recording after 5-minute grace period
        setTimeout(
          () => {
            handleStopRecording().catch(() => {})
          },
          5 * 60 * 1000
        )
        toast.info('Session has ended', { duration: 5000 })
      }
    }

    const handleDeployError = (data: { error: string }) => {
      toast.error(data.error || 'Cannot deploy right now')
    }

    const getOrCreateBoard = (prev: typeof studentBoards, userId: string) => {
      const existing = prev[userId]
      if (existing) return existing
      return {
        pages: [
          {
            id: 'page-1',
            name: 'Page 1',
            strokes: [],
            shapes: [],
            texts: [],
            formulas: [],
            graphs: [],
            backgroundColor: '#ffffff',
            backgroundStyle: 'solid',
          },
        ],
        pageIndex: 0,
      }
    }

    const handleWhiteboardStrokeAdded = (payload: {
      userId: string
      stroke: any
      pageIndex?: number
    }) => {
      if (!payload?.userId) return
      setStudentBoards(prev => {
        const board = getOrCreateBoard(prev, payload.userId)
        const pages = [...(board.pages as any[])]
        const pageIdx = payload.pageIndex ?? payload.stroke?.pageIndex ?? board.pageIndex ?? 0
        if (pageIdx >= pages.length) {
          // Ensure the page exists
          while (pages.length <= pageIdx) {
            pages.push({
              id: `page-${pages.length + 1}`,
              name: `Page ${pages.length + 1}`,
              strokes: [],
              shapes: [],
              texts: [],
              formulas: [],
              graphs: [],
              backgroundColor: '#ffffff',
              backgroundStyle: 'solid',
            })
          }
        }
        const page = pages[pageIdx]
        if (!page) return prev
        const normalizedStroke = normalizeStroke(payload.stroke)
        pages[pageIdx] = { ...page, strokes: [...(page.strokes || []), normalizedStroke] }
        return { ...prev, [payload.userId]: { ...board, pages, updatedAt: Date.now() } }
      })
    }

    const handleWhiteboardShapeAdded = (payload: {
      userId: string
      shape: any
      pageIndex?: number
    }) => {
      if (!payload?.userId) return
      setStudentBoards(prev => {
        const board = getOrCreateBoard(prev, payload.userId)
        const pages = [...(board.pages as any[])]
        const pageIdx = payload.pageIndex ?? payload.shape?.pageIndex ?? board.pageIndex ?? 0
        if (pageIdx >= pages.length) {
          while (pages.length <= pageIdx) {
            pages.push({
              id: `page-${pages.length + 1}`,
              name: `Page ${pages.length + 1}`,
              strokes: [],
              shapes: [],
              texts: [],
              formulas: [],
              graphs: [],
              backgroundColor: '#ffffff',
              backgroundStyle: 'solid',
            })
          }
        }
        const page = pages[pageIdx]
        if (!page) return prev
        pages[pageIdx] = { ...page, shapes: [...(page.shapes || []), payload.shape] }
        return { ...prev, [payload.userId]: { ...board, pages, updatedAt: Date.now() } }
      })
    }

    const handleWhiteboardTextAdded = (payload: {
      userId: string
      text: any
      pageIndex?: number
    }) => {
      if (!payload?.userId) return
      setStudentBoards(prev => {
        const board = getOrCreateBoard(prev, payload.userId)
        const pages = [...(board.pages as any[])]
        const pageIdx = payload.pageIndex ?? payload.text?.pageIndex ?? board.pageIndex ?? 0
        if (pageIdx >= pages.length) {
          while (pages.length <= pageIdx) {
            pages.push({
              id: `page-${pages.length + 1}`,
              name: `Page ${pages.length + 1}`,
              strokes: [],
              shapes: [],
              texts: [],
              formulas: [],
              graphs: [],
              backgroundColor: '#ffffff',
              backgroundStyle: 'solid',
            })
          }
        }
        const page = pages[pageIdx]
        if (!page) return prev
        pages[pageIdx] = { ...page, texts: [...(page.texts || []), payload.text] }
        return { ...prev, [payload.userId]: { ...board, pages, updatedAt: Date.now() } }
      })
    }

    const handleStudentWhiteboardUpdate = (data: {
      studentId?: string
      pages?: any[]
      pageIndex?: number
      updatedAt?: number
    }) => {
      const studentId = data?.studentId
      if (!studentId || !data?.pages) return
      setStudentBoards(prev => {
        const pages = data.pages!.map((page: any) => ({
          ...page,
          strokes: (page.strokes || []).map((s: any) => normalizeStroke(s)),
        }))
        return {
          ...prev,
          [studentId]: {
            pages,
            pageIndex: data.pageIndex ?? 0,
            updatedAt: data.updatedAt ?? Date.now(),
          },
        }
      })
    }

    socket.on('task:deployed', handleTaskDeployed)
    socket.on('task:updated', handleTaskUpdated)
    socket.on('task:completed', handleTaskCompleted)
    socket.on('session:ending-soon', handleSessionEndingSoon)
    socket.on('session:ended', handleSessionEnded)
    socket.on('task:deploy:error', handleDeployError)
    socket.on('insight:send:error', handleDeployError)
    socket.on('whiteboard:stroke:added', handleWhiteboardStrokeAdded)
    socket.on('whiteboard:shape:added', handleWhiteboardShapeAdded)
    socket.on('whiteboard:text:added', handleWhiteboardTextAdded)
    socket.on('student:whiteboard:update', handleStudentWhiteboardUpdate)

    return () => {
      socket.off('task:deployed', handleTaskDeployed)
      socket.off('task:updated', handleTaskUpdated)
      socket.off('task:completed', handleTaskCompleted)
      socket.off('session:ending-soon', handleSessionEndingSoon)
      socket.off('session:ended', handleSessionEnded)
      socket.off('task:deploy:error', handleDeployError)
      socket.off('insight:send:error', handleDeployError)
      socket.off('whiteboard:stroke:added', handleWhiteboardStrokeAdded)
      socket.off('whiteboard:shape:added', handleWhiteboardShapeAdded)
      socket.off('whiteboard:text:added', handleWhiteboardTextAdded)
      socket.off('student:whiteboard:update', handleStudentWhiteboardUpdate)
    }
  }, [socket, sessionId, endingAlertShown, handleStopRecording])

  const checkSessionActive = (source?: string): { ok: boolean; error?: string } => {
    if (!sessionId) return { ok: false, error: 'No session selected' }
    const currentSession = sessions.find(s => s.id === sessionId)
    if (!currentSession) return { ok: false, error: 'Session not found' }
    // Homework can be dropped even after session ends
    if (source !== 'homework' && currentSession.status === 'ended') {
      return { ok: false, error: 'Session has ended' }
    }
    // A live session is deployable regardless of its scheduled time — the tutor
    // may have started early. Only block a still-scheduled session that hasn't
    // begun; otherwise an active-but-early session would wrongly reject deploys.
    const isLive =
      currentSession.status === 'active' ||
      currentSession.status === 'live' ||
      currentSession.status === 'preparing'
    if (!isLive && new Date(currentSession.scheduledAt).getTime() > Date.now()) {
      return { ok: false, error: 'Session has not started yet' }
    }
    return { ok: true }
  }

  const handleDeployTask = (task: LiveTask) => {
    if (!socket || !sessionId) {
      toast.error('Open a live session before deploying')
      return
    }
    const check = checkSessionActive(task.source)
    if (!check.ok) {
      toast.error(check.error || 'Cannot deploy right now')
      return
    }
    socket.emit('task:deploy', { roomId: sessionId, task })
  }

  const handleSendPoll = (payload: { taskId: string; question: string; options?: string[] }) => {
    if (!socket || !sessionId) return
    const check = checkSessionActive()
    if (!check.ok) {
      toast.error(check.error || 'Cannot send poll right now')
      return
    }
    socket.emit('insight:send', {
      roomId: sessionId,
      taskId: payload.taskId,
      type: 'poll',
      prompt: payload.question,
      options: payload.options,
    })
  }

  const handleSendQuestion = (payload: { taskId: string; prompt: string }) => {
    if (!socket || !sessionId) return
    const check = checkSessionActive()
    if (!check.ok) {
      toast.error(check.error || 'Cannot send question right now')
      return
    }
    socket.emit('insight:send', {
      roomId: sessionId,
      taskId: payload.taskId,
      type: 'question',
      prompt: payload.prompt,
    })
  }

  const activeCourses = saveMode === 'live' ? courses : draftCourses

  const handleModeChange = useCallback((mode: 'live' | 'draft') => {
    setSaveMode(mode)
    // Don't switch courseId when changing modes — the user stays on the same course
  }, [])

  if (loading) {
    return (
      <div className="flex h-full w-full flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      </div>
    )
  }

  if (!courseId) {
    // If a sessionId is in the URL, we're still resolving the linked course — show spinner
    if (searchParams.get('sessionId')) {
      return (
        <div className="flex h-full w-full flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
        </div>
      )
    }
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="p-6">
          <div className="mx-auto max-w-2xl">
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <Wrench className="h-8 w-8 text-blue-500" />
                <div>
                  <h1 className="text-lg font-semibold">
                    {activeCourses.length > 0 ? 'Select a course' : 'No courses yet'}
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    {activeCourses.length > 0
                      ? `Pick a ${saveMode} course to open the builder.`
                      : `Create a ${saveMode} course to access the builder.`}
                  </p>
                </div>
                {activeCourses.length === 0 ? (
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    New {saveMode === 'live' ? 'Course' : 'Draft'}
                  </Button>
                ) : (
                  <div className="mt-4 grid w-full gap-3">
                    {activeCourses.map(course => (
                      <button
                        key={course.id}
                        type="button"
                        onClick={() => {
                          setCourseId(course.id)
                          setDetachedCourseName(course.name)
                        }}
                        className="flex w-full items-center justify-between rounded-lg border bg-white px-4 py-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50"
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{course.name}</p>
                          {course.nationality && course.nationality !== 'Global' && (
                            <p className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                              {course.variantCategory || (course.categories || [])[0] || 'General'}{' '}
                              — <CountryFlag countryName={course.nationality} size="xs" showLabel />
                            </p>
                          )}
                          <p className="text-muted-foreground text-xs">
                            Last updated{' '}
                            {course.updatedAt
                              ? new Date(course.updatedAt).toLocaleString()
                              : 'Unavailable'}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-blue-600">Open</span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  const dataMode =
    saveMode === 'draft' && !sessionId && courseId === 'insights-draft' ? 'detached' : 'default'

  return (
    <div className="flex h-screen w-full flex-col items-stretch bg-gray-50">
      <PanelErrorBoundary label="the insights builder" resetKeys={[courseId, saveMode]}>
        <CourseBuilderInsightsRoute
          courseId={courseId}
          dataMode={dataMode}
          detachedStorageKey={
            dataMode === 'detached' ? `insights-course-builder:${courseId}` : undefined
          }
          detachedCourseName={dataMode === 'detached' ? detachedCourseName : undefined}
          insightsProps={{
            courseId,
            autoSave: embedded,
            courses: courses.map(course => ({
              id: course.id,
              name: course.name,
              categories: course.categories,
              isPublished: course.isPublished,
              nationality: course.nationality,
              variantCategory: course.variantCategory,
            })),
            onCourseChange: value => {
              setCourseId(value)
              const isDraftCourse = draftCourses.some(course => course.id === value)
              // Only auto-switch to draft mode for draft courses.
              // Live courses can be edited in either mode, so keep the current mode.
              if (!sessionId && isDraftCourse) {
                setSaveMode('draft')
              }

              const match = [...courses, ...draftCourses].find(course => course.id === value)
              if (match) {
                setDetachedCourseName(match.name)
              }
            },
            sessionId,
            sessions,
            onSessionChange: setSessionId,
            liveTasks,
            liveSubmissions,
            // Only expose deploy inside a live session — the deploy buttons gate
            // on this callback, so hiding it prevents "deploying" from the plain
            // builder (where the emit would be silently dropped, no session/room).
            onDeployTask: sessionId ? handleDeployTask : undefined,
            onSendPoll: handleSendPoll,
            onSendQuestion: handleSendQuestion,
            students,
            metrics,
            classDuration,
            isRecording,
            recordingDuration: recordingDurationSeconds,
            onToggleRecording: handleToggleRecording,
            socket,
            isConnected: socketConnected,
            studentBoards,
            tutorId: session?.user?.id,
            tutorName: session?.user?.name || 'Tutor',
          }}
          sessionCategory={sessionCategory}
          sessionNationality={sessionNationality}
          sessionVariantName={sessionVariantName}
          onSaveCourse={handleSave}
          onSyncToLiveSession={handleSyncToLiveSession}
          onCreateCourse={() => setIsCreateDialogOpen(true)}
          onDeleteCourse={() => setIsDeleteDialogOpen(true)}
          isCreateDialogOpen={isCreateDialogOpen}
          setIsCreateDialogOpen={setIsCreateDialogOpen}
          newCourseName={newCourseName}
          setNewCourseName={setNewCourseName}
          newCourseCategories={newCourseCategories}
          setNewCourseCategories={setNewCourseCategories}
          createStorageUserId={session?.user?.id}
          onUpdateCourse={handleUpdateCourse}
          editStorageUserId={session?.user?.id}
          onCreateNewCourse={handleCreateNewCourse}
          isDeleteDialogOpen={isDeleteDialogOpen}
          setIsDeleteDialogOpen={setIsDeleteDialogOpen}
          onDeleteCourseConfirm={handleDeleteCourse}
          courses={courses}
          draftCourses={draftCourses.filter(
            draft => !courses.some(live => live.name.startsWith(draft.name + ' —'))
          )}
          courseName={courseName}
          onCourseNameChange={handleCourseNameChange}
          saveMode={saveMode}
          onSaveModeChange={handleModeChange}
          modeLocked={false}
        />
      </PanelErrorBoundary>

      {/* Delete Course Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Course</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{detachedCourseName}&quot;? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="modal-secondary-dark" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteCourse}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Propagation Dialog */}
      <Dialog open={propagationDialogOpen} onOpenChange={setPropagationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Changes</DialogTitle>
            <DialogDescription>
              This is a published course variant. How would you like to apply your changes?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Button
              variant="outline"
              className="h-auto justify-start px-4 py-3 text-left"
              onClick={async () => {
                setPropagationDialogOpen(false)
                if (pendingSavePayload) {
                  await executeSave(
                    pendingSavePayload.lessons,
                    pendingSavePayload.options,
                    true,
                    false
                  )
                  setPendingSavePayload(null)
                }
              }}
            >
              <div className="flex flex-col items-start">
                <span className="font-semibold">Apply to all variants</span>
                <span className="text-muted-foreground text-sm">
                  Copy these changes to all sibling variants (except independent ones)
                </span>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start px-4 py-3 text-left"
              onClick={async () => {
                setPropagationDialogOpen(false)
                if (pendingSavePayload) {
                  await executeSave(
                    pendingSavePayload.lessons,
                    pendingSavePayload.options,
                    false,
                    true
                  )
                  setPendingSavePayload(null)
                }
              }}
            >
              <div className="flex flex-col items-start">
                <span className="font-semibold">Only this variant</span>
                <span className="text-muted-foreground text-sm">
                  Save changes to this variant only and mark it as independent
                </span>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="modal-secondary-dark"
              onClick={() => {
                setPropagationDialogOpen(false)
                setPendingSavePayload(null)
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function TutorInsightsPage() {
  return (
    <Suspense fallback={null}>
      <TutorInsightsPageInner />
    </Suspense>
  )
}
