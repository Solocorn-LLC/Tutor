'use client'

import { Suspense } from 'react'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { CourseBuilderInsightsRoute } from '../courses/components/CourseBuilderInsightsRoute'
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
import { Loader2, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { useSocket } from '@/hooks/use-socket'
import { saveCourse } from '../courses/components/save-course'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import type { LiveTask } from '@/lib/socket'
import type { LiveStudent, EngagementMetrics } from '@/types/live-session'

interface CourseSummary {
  id: string
  name: string
  updatedAt: string
  categories?: string[]
  isPublished?: boolean
  nationality?: string
  variantCategory?: string
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
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [courseId, setCourseId] = useState<string | null>(null)
  const [detachedCourseName, setDetachedCourseName] = useState('Course')
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<InsightsSessionOption[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [linkedCourseId, setLinkedCourseId] = useState<string | null>(null)
  const [sessionCategory, setSessionCategory] = useState<string | null>(null)
  const [sessionNationality, setSessionNationality] = useState<string | null>(null)
  const [liveTasks, setLiveTasks] = useState<LiveTask[]>([])
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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [saveMode, setSaveMode] = useState<'live' | 'draft'>(
    searchParams.get('sessionId') ? 'live' : searchParams.get('mode') === 'edit' ? 'draft' : 'live'
  )
  const [draftCourses, setDraftCourses] = useState<CourseSummary[]>([])

  // User-specific localStorage key so drafts don't leak across accounts on shared devices
  const draftStorageKey = useMemo(
    () => `lesson-bank-courses-v1:${session?.user?.id || 'anonymous'}`,
    [session?.user?.id]
  )

  // Auto-detect saveMode when courseId is set from URL or dropdown
  useEffect(() => {
    if (!courseId || courseId === 'insights-draft') return
    // If mode=edit is explicitly requested (from Dashboard or My Page), force draft
    if (searchParams.get('mode') === 'edit') {
      setSaveMode('draft')
      return
    }
    // If a sessionId is in the URL, force live mode
    if (searchParams.get('sessionId')) {
      setSaveMode('live')
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
    const activeList = saveMode === 'live' ? courses : draftCourses
    const match = activeList.find(c => c.id === courseId)
    if (match) setCourseName(match.name)
  }, [courseId, courses, draftCourses, saveMode, detachedCourseName])

  const handleCourseNameChange = useCallback(
    async (newName: string) => {
      setCourseName(newName)
      if (!courseId || courseId === 'insights-draft' || !newName.trim()) return

      // Optimistically update lists so dropdown matches instantly
      if (saveMode === 'draft') {
        setDraftCourses(prev => prev.map(c => (c.id === courseId ? { ...c, name: newName } : c)))
      } else {
        setCourses(prev => prev.map(c => (c.id === courseId ? { ...c, name: newName } : c)))
      }

      if (saveMode === 'draft') {
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
        return
      }

      // Debounce the API call for live courses could be done here,
      // but for now we just rely on the optimistic update.
      const match = courses.find(c => c.id === courseId)
      if (match && newName !== match.name) {
        try {
          const res = await fetchWithCsrf(`/api/tutor/courses/${courseId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim() }),
          })
        } catch {
          // silent fail
        }
      }
    },
    [courseId, courses, saveMode]
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
      await fetch(`/api/tutor/live-sessions/${sessionId}/recording`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
      if (new Date(currentSession.scheduledAt).getTime() > Date.now()) {
        toast.error('Session has not started yet')
        return
      }

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

  const handleSave = useCallback(
    async (lessons: any[], options?: any) => {
      if (!courseId || courseId === 'insights-draft') return

      const result = await saveCourse({
        courseId,
        lessons,
        mode: saveMode,
        draftListStorageKey: draftStorageKey,
        isAutoSave: options?.isAutoSave,
      })

      if (options?.isAutoSave) return

      if (result.success) {
        toast.success(saveMode === 'draft' ? 'Draft saved' : 'Course saved successfully')
      } else {
        console.error('[Insights] Save failed:', result.error)
        toast.error(
          result.error || (saveMode === 'draft' ? 'Failed to save draft' : 'Failed to save course')
        )
      }
    },
    [courseId, saveMode, draftStorageKey]
  )

  const handleCreateNewCourse = useCallback(async () => {
    if (!newCourseName.trim()) {
      toast.error('Please enter a course name')
      return
    }
    if (saveMode === 'draft') {
      const newCourse = {
        id: `course-${Date.now()}`,
        name: newCourseName.trim(),
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
          { id: newCourse.id, name: newCourse.name, updatedAt: newCourse.updatedAt },
        ])
        setCourseId(newCourse.id)
        setDetachedCourseName(newCourse.name)
        setNewCourseName('')
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
          categories: [],
          schedule: [],
          isLiveOnline: false,
        }),
      })

      const data = await res.json()
      const createdCourse = data.courses?.[0]
      if (res.ok && createdCourse?.id) {
        setCourses(prev => [...prev, createdCourse])
        setCourseId(createdCourse.id)
        setDetachedCourseName(createdCourse.name)
        setNewCourseName('')
        setIsCreateDialogOpen(false)
        toast.success(`Created course "${createdCourse.name}"`)
      } else {
        toast.error(data.error || 'Failed to create course')
      }
    } catch {
      toast.error('Failed to create course')
    }
  }, [newCourseName, saveMode])

  const handleDeleteCourse = useCallback(async () => {
    if (!courseId || courseId === 'insights-draft') return
    if (saveMode === 'draft') {
      if (draftCourses.length <= 1) {
        toast.error('Cannot delete the last draft')
        setIsDeleteDialogOpen(false)
        return
      }
      try {
        const raw = localStorage.getItem(draftStorageKey)
        const parsed = raw ? JSON.parse(raw) : []
        const updated = parsed.filter((c: any) => c.id !== courseId)
        localStorage.setItem(draftStorageKey, JSON.stringify(updated))
        // Also clean up detached builder content
        localStorage.removeItem(`insights-course-builder:${courseId}`)
        const remaining = draftCourses.filter(c => c.id !== courseId)
        setDraftCourses(remaining)
        setCourseId(remaining[0].id)
        setDetachedCourseName(remaining[0].name)
        setIsDeleteDialogOpen(false)
        toast.success('Draft deleted')
      } catch {
        toast.error('Failed to delete draft')
      }
      return
    }
    if (courses.length <= 1) {
      toast.error('Cannot delete the last course')
      setIsDeleteDialogOpen(false)
      return
    }
    try {
      const doDelete = async (confirmed: boolean) =>
        fetchWithCsrf(`/api/tutor/courses/${courseId}${confirmed ? '?confirm=true' : ''}`, {
          method: 'DELETE',
        })

      const res = await doDelete(false)

      if (res.ok) {
        const remaining = courses.filter(c => c.id !== courseId)
        setCourses(remaining)
        setCourseId(remaining[0].id)
        setDetachedCourseName(remaining[0].name)
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
            setCourseId(remaining[0].id)
            setDetachedCourseName(remaining[0].name)
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
  }, [courseId, courses, draftCourses, saveMode])

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
        } else if (!querySessionId) {
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
        setStudents(prev =>
          prev.map(s =>
            ((s as any)?.userId ?? s?.id) === userId ? { ...s, status: 'offline' } : s
          )
        )
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

  const { socket } = useSocket(socketOptions)

  const handleSyncToLiveSession = useCallback(() => {
    if (sessionId && socket) {
      socket.emit('course:sync', { roomId: sessionId, courseId })
    }
    toast.success('Course synced to live session')
  }, [sessionId, socket, courseId])

  // Track whether the current session has received the ending-soon alert
  const [endingAlertShown, setEndingAlertShown] = useState(false)

  useEffect(() => {
    setEndingAlertShown(false)
  }, [sessionId])

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
    }

    const handleTaskUpdated = (payload: { task: LiveTask }) => {
      setLiveTasks(prev => prev.map(item => (item.id === payload.task.id ? payload.task : item)))
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
    if (new Date(currentSession.scheduledAt).getTime() > Date.now()) {
      return { ok: false, error: 'Session has not started yet' }
    }
    return { ok: true }
  }

  const handleDeployTask = (task: LiveTask) => {
    if (!socket || !sessionId) return
    const check = checkSessionActive(task.source)
    if (!check.ok) {
      toast.error(check.error || 'Cannot deploy right now')
      return
    }
    socket.emit('task:deploy', { roomId: sessionId, task })
  }

  const handleSendPoll = (payload: { taskId: string; question: string }) => {
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

  const handleModeChange = useCallback(
    (mode: 'live' | 'draft') => {
      setSaveMode(mode)
      if (mode === 'live') {
        const first = courses[0]
        if (first) {
          setCourseId(first.id)
          setDetachedCourseName(first.name)
        }
      } else {
        const first = draftCourses[0]
        if (first) {
          setCourseId(first.id)
          setDetachedCourseName(first.name)
        } else {
          setCourseId('insights-draft')
          setDetachedCourseName('Draft Builder')
        }
      }
    },
    [courses, draftCourses]
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="p-6">
          <div className="mx-auto max-w-xl">
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <Wrench className="h-8 w-8 text-blue-500" />
                <div>
                  <h1 className="text-lg font-semibold">Opening Insights…</h1>
                  <p className="text-muted-foreground text-sm">Loading your latest course.</p>
                </div>
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  if (!courseId) {
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
                            <p className="text-xs font-medium text-blue-600">
                              {course.variantCategory || (course.categories || [])[0] || 'General'} — {course.nationality}
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

  const dataMode = saveMode === 'draft' && !sessionId ? 'detached' : 'default'

  return (
    <div className="flex min-h-screen w-full flex-col items-stretch bg-gray-50">
      <CourseBuilderInsightsRoute
        courseId={courseId}
        dataMode={dataMode}
        detachedStorageKey={
          dataMode === 'detached' ? `insights-course-builder:${courseId}` : undefined
        }
        detachedCourseName={dataMode === 'detached' ? detachedCourseName : undefined}
        insightsProps={{
          courseId,
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
            const isLiveCourse = courses.some(course => course.id === value)
            const isDraftCourse = draftCourses.some(course => course.id === value)
            if (!sessionId) {
              if (isLiveCourse) setSaveMode('live')
              else if (isDraftCourse) setSaveMode('draft')
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
          onDeployTask: handleDeployTask,
          onSendPoll: handleSendPoll,
          onSendQuestion: handleSendQuestion,
          students,
          metrics,
          classDuration,
          isRecording,
          recordingDuration: recordingDurationSeconds,
          onToggleRecording: handleToggleRecording,
          socket,
          studentBoards,
          tutorId: session?.user?.id,
          tutorName: session?.user?.name || 'Tutor',
        }}
        sessionCategory={sessionCategory}
        sessionNationality={sessionNationality}
        onSaveCourse={handleSave}
        onSyncToLiveSession={handleSyncToLiveSession}
        onCreateCourse={() => setIsCreateDialogOpen(true)}
        onDeleteCourse={() => setIsDeleteDialogOpen(true)}
        isCreateDialogOpen={isCreateDialogOpen}
        setIsCreateDialogOpen={setIsCreateDialogOpen}
        newCourseName={newCourseName}
        setNewCourseName={setNewCourseName}
        onCreateNewCourse={handleCreateNewCourse}
        isDeleteDialogOpen={isDeleteDialogOpen}
        setIsDeleteDialogOpen={setIsDeleteDialogOpen}
        onDeleteCourseConfirm={handleDeleteCourse}
        courses={courses}
        draftCourses={draftCourses.filter(draft =>
          !courses.some(live => live.name.startsWith(draft.name + ' —'))
        )}
        courseName={courseName}
        onCourseNameChange={handleCourseNameChange}
        saveMode={saveMode}
        onSaveModeChange={handleModeChange}
      />

      {/* Create New Course Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Course</DialogTitle>
            <DialogDescription>Enter a name for your new course.</DialogDescription>
          </DialogHeader>
          <Input
            value={newCourseName}
            onChange={e => setNewCourseName(e.target.value)}
            placeholder="Course name"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleCreateNewCourse()
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateNewCourse}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteCourse}>
              Delete
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
