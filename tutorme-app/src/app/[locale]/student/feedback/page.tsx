'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
  Suspense,
  type ComponentProps,
} from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSocket } from '@/hooks/use-socket'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  ListTodo,
  MessageSquare,
  Send,
  Bell,
  Loader2,
  Layout,
  ArrowLeft,
  FileText,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Folder,
  Video,
  Plus,
  Minus,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { EnhancedWhiteboard } from '@/components/class/enhanced-whiteboard'
import { useVideoOverlayStore } from '@/stores/video-overlay-store'
import type { LiveTask, LiveTaskPoll, LiveTaskQuestion, ChatMessage } from '@/lib/socket'

type WhiteboardPages = NonNullable<ComponentProps<typeof EnhancedWhiteboard>['pages']>
type WhiteboardPage = WhiteboardPages[number]

const createDefaultWhiteboardPages = (): WhiteboardPages => [
  {
    id: 'page-1',
    name: 'Page 1',
    strokes: [],
    texts: [],
    shapes: [],
    formulas: [],
    graphs: [],
    backgroundColor: '#ffffff',
    backgroundStyle: 'solid',
  },
]

function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase()
  return '#' + '00000'.substring(0, 6 - c.length) + c
}

interface SessionSummary {
  id: string
  title: string
  subject: string
  scheduledAt: string
  status: string
}

export default function StudentFeedbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <StudentFeedbackContent />
    </Suspense>
  )
}

function StudentFeedbackContent() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const sessionIdFromQuery = searchParams.get('sessionId')
  const courseNameFromQuery = searchParams.get('courseName')
  const tutorHandleFromQuery = searchParams.get('tutorHandle')

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(sessionIdFromQuery)
  const [tasks, setTasks] = useState<LiveTask[]>([])
  const [liveHomework, setLiveHomework] = useState<LiveTask[]>([])
  const [selectedDirectoryItem, setSelectedDirectoryItem] = useState<LiveTask | null>(null)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [requestingSessionId, setRequestingSessionId] = useState<string | null>(null)
  const [showTasksPanel, setShowTasksPanel] = useState(false)
  const [rightPanelTab, setRightPanelTab] = useState<'dmi' | 'interactions' | 'board'>('interactions')
  const [unseenTaskIds, setUnseenTaskIds] = useState<string[]>([])
  const [unseenHomeworkIds, setUnseenHomeworkIds] = useState<string[]>([])
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({})
  const [chatInput, setChatInput] = useState('')
  const [viewerZoom, setViewerZoom] = useState(1)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [sessionContext, setSessionContext] = useState<{
    topic: string | null
    objectives: string[] | null
    roomUrl: string | null
    token: string | null
    tutorId: string | null
    tutorUsername: string
    courseCategory: string
    courseId: string | null
    courseName: string | null
    status: string | null
    startedAt: string | null
    scheduledAt: string | null
    endedAt: string | null
  } | null>(null)
  const [activeCourseName, setActiveCourseName] = useState<string | null>(null)
  const [sessionTimer, setSessionTimer] = useState<string>('')
  const [myBoardPages, setMyBoardPages] = useState<WhiteboardPage[]>(createDefaultWhiteboardPages)
  const [myBoardPageIndex, setMyBoardPageIndex] = useState(0)
  const [tutorBoardPages, setTutorBoardPages] = useState<WhiteboardPage[]>(
    createDefaultWhiteboardPages
  )
  const [tutorBoardPageIndex, setTutorBoardPageIndex] = useState(0)
  const saveBoardsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Left Panel state
  const [leftPanelHidden, setLeftPanelHidden] = useState(false)
  const [leftPanelWidth, setLeftPanelWidth] = useState(300)
  const [leftPanelResizing, setLeftPanelResizing] = useState(false)
  const leftResizeStartX = useRef(0)
  const leftResizeStartW = useRef(300)

  // Assets state
  const [selectedReport, setSelectedReport] = useState<any | null>(null)
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [courseAssets, setCourseAssets] = useState<any[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [studentDirectory, setStudentDirectory] = useState<Record<string, Record<string, any>>>({})

  // Derive the page title from session context, selected item, or directory
  const pageTitle = useMemo(() => {
    if (sessionContext?.courseName) return sessionContext.courseName
    if (courseNameFromQuery) return courseNameFromQuery
    if (activeCourseName) return activeCourseName
    // Try to find course name from directory based on activeTaskId
    if (activeTaskId && studentDirectory) {
      for (const tutor of Object.values(studentDirectory)) {
        for (const course of Object.values(tutor)) {
          const allItems = [
            ...(course.tasks || []),
            ...(course.assessments || []),
            ...(course.homework || []),
            ...(course.recordedSessions || []),
          ]
          const item = allItems.find((i: any) => (i.itemId || i.id) === activeTaskId)
          if (item?.courseName) return item.courseName
        }
      }
    }
    // If only one course exists, show it
    const tutors = Object.values(studentDirectory || {})
    if (tutors.length === 1) {
      const courses = Object.keys(tutors[0] || {})
      if (courses.length === 1) return courses[0]
    }
    return 'Live Classroom'
  }, [
    sessionContext?.courseName,
    courseNameFromQuery,
    activeCourseName,
    activeTaskId,
    studentDirectory,
  ])

  const [directoryLoading, setDirectoryLoading] = useState(true)
  const [directoryError, setDirectoryError] = useState<string | null>(null)
  const [directoryWarnings, setDirectoryWarnings] = useState<string[]>([])
  const [foldersOpen, setFoldersOpen] = useState<Record<string, boolean>>({
    tasks: true,
    assessments: true,
    homework: true,
    reports: true,
    recordedSessions: true,
  })

  const portalRef = useRef<HTMLDivElement | null>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const loadDirectory = async () => {
      setDirectoryLoading(true)
      setDirectoryError(null)
      setDirectoryWarnings([])
      try {
        const res = await fetch('/api/student/directory', {
          credentials: 'include',
          cache: 'no-store',
        })
        if (res.ok) {
          const data = await res.json()
          setStudentDirectory(data.directory || {})

          // Surface partial backend errors as warnings, not fatal
          if (data.errors && data.errors.length > 0) {
            console.error('Directory partial errors:', data.errors)
            setDirectoryWarnings(data.errors)
          }

          // Open all top-level and second-level folders by default
          const newFoldersOpen: Record<string, boolean> = {
            tasks: true,
            assessments: true,
            homework: true,
            reports: true,
            recordedSessions: true,
          }

          const sessionTasks: LiveTask[] = []

          if (data.directory) {
            Object.keys(data.directory).forEach(tutor => {
              newFoldersOpen[`tutor_${tutor}`] = true
              Object.keys(data.directory[tutor]).forEach(category => {
                newFoldersOpen[`cat_${tutor}_${category}`] = true

                // Extract tasks for the current active session
                const catTasks = data.directory[tutor][category].tasks || []
                catTasks.forEach((t: any) => {
                  if (selectedSessionId && t.sessionId === selectedSessionId) {
                    try {
                      const parsed =
                        typeof t.content === 'string' ? JSON.parse(t.content) : t.content
                      // Make sure we use the formatted title (s1, s2 etc)
                      parsed.title = t.title
                      sessionTasks.push(parsed as LiveTask)
                    } catch (e) {
                      console.error('Failed to parse task content', e)
                    }
                  }
                })
              })
            })
          }
          setFoldersOpen(newFoldersOpen)

          // Pre-populate tasks if we joined late
          if (sessionTasks.length > 0) {
            setTasks(prev => {
              const newTasks = [...prev]
              sessionTasks.forEach(st => {
                if (!newTasks.some(pt => pt.id === st.id)) {
                  newTasks.push(st)
                }
              })
              return newTasks
            })
          }
        } else {
          const errorData = await res.json().catch(() => ({}))
          const msg = errorData.detail || errorData.error || res.statusText || `HTTP ${res.status}`
          console.error('Directory load failed:', msg)
          setDirectoryError(msg)
        }
      } catch (err: any) {
        console.error('Failed to load student directory:', err)
        setDirectoryError(err?.message || 'Network error')
      } finally {
        setDirectoryLoading(false)
      }
    }
    loadDirectory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    if (portalRef.current) setPortalTarget(portalRef.current)
  }, [])

  useEffect(() => {
    if (!leftPanelResizing) return
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - leftResizeStartX.current
      const newW = Math.max(200, Math.min(500, leftResizeStartW.current + delta))
      setLeftPanelWidth(newW)
    }
    const onUp = () => setLeftPanelResizing(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [leftPanelResizing])

  useEffect(() => {
    const loadAssets = async () => {
      setAssetsLoading(true)
      try {
        const res = await fetch('/api/student/resources', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setCourseAssets(data.resources || [])
        }
      } catch (err) {
        console.error('Failed to load assets:', err)
      } finally {
        setAssetsLoading(false)
      }
    }
    loadAssets()
  }, [])

  // Students don't call /api/class/rooms (tutor-only); sessionId comes from URL or socket
  useEffect(() => {
    if (sessionIdFromQuery) {
      setSelectedSessionId(sessionIdFromQuery)
    }
  }, [sessionIdFromQuery])

  // Session timer
  useEffect(() => {
    if (!sessionContext) {
      setSessionTimer('')
      return
    }
    const updateTimer = () => {
      const now = Date.now()
      if (sessionContext.status === 'active' && sessionContext.startedAt) {
        const started = new Date(sessionContext.startedAt).getTime()
        const elapsed = Math.max(0, now - started)
        const mins = Math.floor(elapsed / 60000)
        const secs = Math.floor((elapsed % 60000) / 1000)
        setSessionTimer(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`)
      } else if (sessionContext.status === 'scheduled' && sessionContext.scheduledAt) {
        const scheduled = new Date(sessionContext.scheduledAt).getTime()
        const diff = scheduled - now
        if (diff > 0) {
          const mins = Math.floor(diff / 60000)
          const secs = Math.floor((diff % 60000) / 1000)
          setSessionTimer(
            `Starts in ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
          )
        } else {
          setSessionTimer('Starting soon')
        }
      } else if (sessionContext.status === 'ended' && sessionContext.endedAt) {
        const ended = new Date(sessionContext.endedAt).getTime()
        const elapsed = Math.max(0, now - ended)
        const mins = Math.floor(elapsed / 60000)
        const secs = Math.floor((elapsed % 60000) / 1000)
        setSessionTimer(
          `Ended ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} ago`
        )
      } else {
        setSessionTimer(sessionContext.status || '')
      }
    }
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [sessionContext])

  const socketOptions = useMemo(() => {
    if (!selectedSessionId || !session?.user?.id) return undefined
    return {
      roomId: selectedSessionId,
      userId: session.user.id,
      name: session.user.name || 'Student',
      role: 'student' as const,
      onRoomState: (state: { tasks?: LiveTask[]; whiteboardData?: any }) => {
        if (state.tasks) {
          setTasks(state.tasks)
        }
        const tutorBoard = state?.whiteboardData?.tutorBoard
        if (tutorBoard?.pages && Array.isArray(tutorBoard.pages)) {
          setTutorBoardPages(tutorBoard.pages)
        }
        if (typeof tutorBoard?.pageIndex === 'number') {
          setTutorBoardPageIndex(tutorBoard.pageIndex)
        }
      },
    }
  }, [selectedSessionId, session?.user?.id, session?.user?.name])

  const { socket, error, isConnected } = useSocket(socketOptions)

  useEffect(() => {
    setTasks([])
    setActiveTaskId(null)
    setUnseenTaskIds([])
    setQuestionDrafts({})
    setMyBoardPages(createDefaultWhiteboardPages())
    setMyBoardPageIndex(0)
    setTutorBoardPages(createDefaultWhiteboardPages())
    setTutorBoardPageIndex(0)
    setChatMessages([])
  }, [selectedSessionId])

  // Refs to track notification IDs for tasks/homework so we can mark them as read
  const taskNotifMap = useRef<Map<string, string>>(new Map())
  const hwNotifMap = useRef<Map<string, string>>(new Map())

  // Load persistent notifications on mount to populate counters
  useEffect(() => {
    async function loadNotifications() {
      try {
        const res = await fetch('/api/notifications?unread=true&limit=100', {
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()
        const notifications = data.notifications || []
        const taskIds: string[] = []
        const hwIds: string[] = []

        for (const n of notifications) {
          // Only count notifications for the current session
          const notifSessionId = n.data?.roomId || n.data?.sessionId
          if (notifSessionId && notifSessionId !== selectedSessionId) continue

          const deployType = n.data?.deployType
          if (deployType === 'task' || deployType === 'assessment') {
            const taskId = n.data?.taskId || n.data?.itemId
            if (taskId) {
              taskNotifMap.current.set(taskId, n.notificationId)
              if (!taskIds.includes(taskId)) taskIds.push(taskId)
            }
          } else if (deployType === 'homework') {
            const hwId = n.data?.homeworkId || n.data?.itemId
            if (hwId) {
              hwNotifMap.current.set(hwId, n.notificationId)
              if (!hwIds.includes(hwId)) hwIds.push(hwId)
            }
          }
        }

        if (taskIds.length > 0) {
          setUnseenTaskIds(prev => [...new Set([...prev, ...taskIds])])
        }
        if (hwIds.length > 0) {
          setUnseenHomeworkIds(prev => [...new Set([...prev, ...hwIds])])
        }
      } catch (e) {
        console.error('Failed to load notifications:', e)
      }
    }
    loadNotifications()
  }, [selectedSessionId])

  // Fetch CSRF token helper
  const getCsrfToken = useCallback(async () => {
    try {
      const res = await fetch('/api/csrf', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      return data?.token ?? null
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    if (!selectedSessionId) return
    let cancelled = false
    const loadSession = async () => {
      try {
        const csrfToken = await getCsrfToken()
        const res = await fetch(`/api/class/rooms/${selectedSessionId}/join`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          console.error('Join API error:', res.status, err)
          toast.error(err.error || `Failed to join session (${res.status})`)
          return
        }
        const data = await res.json()
        if (cancelled) return
        setSessionContext({
          topic: data?.session?.topic ?? null,
          objectives: Array.isArray(data?.session?.objectives)
            ? data.session.objectives
            : data?.session?.objectives
              ? [data.session.objectives]
              : null,
          roomUrl: data?.roomUrl ?? null,
          token: data?.token ?? null,
          tutorId: data?.session?.tutorId ?? null,
          tutorUsername: data?.session?.tutor?.profile?.name || 'Tutor',
          courseCategory: data?.session?.category || 'General',
          courseId: data?.session?.courseId ?? null,
          courseName: data?.session?.course?.name ?? null,
          status: data?.session?.status ?? null,
          startedAt: data?.session?.startedAt ?? null,
          scheduledAt: data?.session?.scheduledAt ?? null,
          endedAt: data?.session?.endedAt ?? null,
        })
      } catch (err: any) {
        console.error('Join request failed:', err)
        toast.error(err?.message || 'Failed to load live session')
      }
    }
    loadSession()
    return () => {
      cancelled = true
    }
  }, [selectedSessionId, getCsrfToken])

  useEffect(() => {
    if (!socket) return
    const handleChatMessage = (message: ChatMessage) => {
      setChatMessages(prev => [...prev.slice(-19), message])
    }
    socket.on('chat_message', handleChatMessage)
    return () => {
      socket.off('chat_message', handleChatMessage)
    }
  }, [socket])

  useEffect(() => {
    if (!selectedSessionId || typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(`feedback-whiteboards:${selectedSessionId}`)
      if (!stored) return
      const parsed = JSON.parse(stored) as {
        my?: { pages?: WhiteboardPage[]; pageIndex?: number }
        tutor?: { pages?: WhiteboardPage[]; pageIndex?: number }
      }
      if (parsed.my?.pages) setMyBoardPages(parsed.my.pages)
      if (typeof parsed.my?.pageIndex === 'number') setMyBoardPageIndex(parsed.my.pageIndex)
      if (parsed.tutor?.pages) setTutorBoardPages(parsed.tutor.pages)
      if (typeof parsed.tutor?.pageIndex === 'number')
        setTutorBoardPageIndex(parsed.tutor.pageIndex)
    } catch {
      // Ignore malformed cache.
    }
  }, [selectedSessionId])

  useEffect(() => {
    if (!selectedSessionId || typeof window === 'undefined') return
    if (saveBoardsTimeoutRef.current) clearTimeout(saveBoardsTimeoutRef.current)
    saveBoardsTimeoutRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(
          `feedback-whiteboards:${selectedSessionId}`,
          JSON.stringify({
            my: { pages: myBoardPages, pageIndex: myBoardPageIndex },
            tutor: { pages: tutorBoardPages, pageIndex: tutorBoardPageIndex },
          })
        )
      } catch {
        // Ignore write errors (storage quota, etc).
      }
    }, 250)
    return () => {
      if (saveBoardsTimeoutRef.current) clearTimeout(saveBoardsTimeoutRef.current)
    }
  }, [selectedSessionId, myBoardPages, myBoardPageIndex, tutorBoardPages, tutorBoardPageIndex])

  const [activeTab, setActiveTab] = useState<string>('task')
  const [isMirroringToTutor, setIsMirroringToTutor] = useState<boolean>(true)
  const [followTutor, setFollowTutor] = useState<boolean>(true)
  const openVideoOverlay = useVideoOverlayStore(s => s.openOverlay)

  // Emit debounced full-board snapshot so tutors can see existing strokes
  // when they open the monitor (delta sync only carries new strokes).
  useEffect(() => {
    if (!socket || !selectedSessionId) return
    if (!isMirroringToTutor) return

    const MIN_INTERVAL_MS = 2500
    const DEBOUNCE_MS = 1500
    let cancelled = false
    let lastSentAt = 0
    let timeout: ReturnType<typeof setTimeout> | null = null

    const schedule = () => {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => {
        if (cancelled) return
        const now = Date.now()
        if (now - lastSentAt < MIN_INTERVAL_MS) {
          schedule()
          return
        }
        lastSentAt = now
        socket.emit('student:whiteboard:update', {
          roomId: selectedSessionId,
          board: { pages: myBoardPages, pageIndex: myBoardPageIndex, updatedAt: now },
        })
      }, DEBOUNCE_MS)
    }

    schedule()
    return () => {
      cancelled = true
      if (timeout) clearTimeout(timeout)
    }
  }, [socket, selectedSessionId, myBoardPages, myBoardPageIndex, isMirroringToTutor])

  // On join, request latest tutor + student board snapshots (fast hydration).
  useEffect(() => {
    if (!socket || !selectedSessionId) return
    socket.emit('whiteboard:state:request', { roomId: selectedSessionId, target: 'tutorBoard' })
    socket.emit('whiteboard:state:request', {
      roomId: selectedSessionId,
      target: 'studentBoard',
      studentId: session?.user?.id,
    })
  }, [socket, selectedSessionId, session?.user?.id])

  useEffect(() => {
    if (!selectedSessionId || typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(`student-follow-tutor:${selectedSessionId}`)
      if (raw === '0') setFollowTutor(false)
      if (raw === '1') setFollowTutor(true)
    } catch {
      // ignore
    }
  }, [selectedSessionId])

  useEffect(() => {
    if (!selectedSessionId || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        `student-follow-tutor:${selectedSessionId}`,
        followTutor ? '1' : '0'
      )
    } catch {
      // ignore
    }
  }, [selectedSessionId, followTutor])

  // Mirror to Tutor persistence
  useEffect(() => {
    if (!selectedSessionId || typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(`student-mirror-tutor:${selectedSessionId}`)
      if (raw === '0') setIsMirroringToTutor(false)
      if (raw === '1') setIsMirroringToTutor(true)
    } catch {
      // ignore
    }
  }, [selectedSessionId])

  useEffect(() => {
    if (!selectedSessionId || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        `student-mirror-tutor:${selectedSessionId}`,
        isMirroringToTutor ? '1' : '0'
      )
    } catch {
      // ignore
    }
  }, [selectedSessionId, isMirroringToTutor])

  // Sync Student state to Tutor (always, so tutor monitor can track presence)
  useEffect(() => {
    if (!socket || !selectedSessionId) return
    const payload = {
      activeTab,
      activeTaskId,
    }
    socket.emit('student:state_sync', { roomId: selectedSessionId, payload })
  }, [socket, selectedSessionId, activeTab, activeTaskId])

  useEffect(() => {
    if (!socket) return

    const handleTaskDeployed = (task: LiveTask) => {
      if (task.source === 'homework') {
        setLiveHomework(prev => {
          const exists = prev.some(item => item.id === task.id)
          if (exists) {
            return prev.map(item => (item.id === task.id ? { ...item, ...task } : item))
          }
          return [...prev, task]
        })
        setUnseenHomeworkIds(prev => (prev.includes(task.id) ? prev : [...prev, task.id]))
        toast.success(`New homework assigned: ${task.title}`)
      } else {
        setTasks(prev => {
          const exists = prev.some(item => item.id === task.id)
          if (exists) {
            return prev.map(item => (item.id === task.id ? { ...item, ...task } : item))
          }
          return [...prev, task]
        })
        setUnseenTaskIds(prev => (prev.includes(task.id) ? prev : [...prev, task.id]))
        toast.success(`New task deployed: ${task.title}`)
      }
    }

    const handleTaskUpdated = (payload: { task: LiveTask }) => {
      setTasks(prev => prev.map(item => (item.id === payload.task.id ? payload.task : item)))
    }

    const handleTaskSequence = (payload: { taskId: string; sequence: number }) => {
      setTasks(prev =>
        prev.map(item => {
          if (item.id === payload.taskId && !item.title.includes(`(s${payload.sequence})`)) {
            return { ...item, title: `${item.title} (s${payload.sequence})` }
          }
          return item
        })
      )
    }

    const handleInsightReceived = (payload: {
      type: string
      payload: { activeTab?: string; activeTaskId?: string | null }
    }) => {
      if (payload.type === 'tutor:state_sync') {
        if (!followTutor) return
        const state = payload.payload
        if (state.activeTab === 'whiteboards') {
          setActiveTab('tutor-board')
        } else if (state.activeTab === 'classroom') {
          setActiveTab('task')
        }
        // Only follow tutor to a task if it has been deployed in this session
        if (state.activeTaskId) {
          const isDeployed = tasks.some(t => t.id === state.activeTaskId)
          if (isDeployed) {
            setActiveTaskId(state.activeTaskId)
          }
        }
      }
    }

    const handleStudentDirectMessage = (payload: { targetStudentId: string; message: string }) => {
      if (payload.targetStudentId === session?.user?.id) {
        toast.message('Tutor Message', {
          description: payload.message,
          duration: 10000,
        })
      }
    }

    const handleHomeworkReceived = (hw: LiveTask) => {
      setLiveHomework(prev => {
        const exists = prev.some(item => item.id === hw.id)
        if (exists) {
          return prev.map(item => (item.id === hw.id ? { ...item, ...hw } : item))
        }
        return [...prev, hw]
      })
      setUnseenHomeworkIds(prev => (prev.includes(hw.id) ? prev : [...prev, hw.id]))
      toast.success(`New homework assigned: ${hw.title}`)
    }

    const handleTutorWhiteboardUpdate = (board: {
      pages?: any[]
      pageIndex?: number
      updatedAt?: number
    }) => {
      if (board?.pages && Array.isArray(board.pages)) {
        setTutorBoardPages(board.pages)
      }
      if (typeof board?.pageIndex === 'number') {
        setTutorBoardPageIndex(board.pageIndex)
      }
    }

    const handleWhiteboardStateResponse = (payload: any) => {
      if (!payload || payload.roomId !== selectedSessionId) return
      if (payload.target === 'tutorBoard' || payload.target === 'all') {
        const board = payload.tutorBoard
        if (board?.pages && Array.isArray(board.pages)) setTutorBoardPages(board.pages)
        if (typeof board?.pageIndex === 'number') setTutorBoardPageIndex(board.pageIndex)
      }
      if (payload.target === 'studentBoard' || payload.target === 'all') {
        const board = payload.studentBoard
        if (board?.pages && Array.isArray(board.pages)) setMyBoardPages(board.pages)
        if (typeof board?.pageIndex === 'number') setMyBoardPageIndex(board.pageIndex)
      }
    }

    socket.on('task:deployed', handleTaskDeployed)
    socket.on('task:updated', handleTaskUpdated)
    socket.on('task:deployed:sequence', handleTaskSequence)
    socket.on('insight:receive', handleInsightReceived)
    socket.on('student:direct_message', handleStudentDirectMessage)
    socket.on('homework:received', handleHomeworkReceived)
    socket.on('tutor:whiteboard:update', handleTutorWhiteboardUpdate)
    socket.on('whiteboard:state:response', handleWhiteboardStateResponse)

    return () => {
      socket.off('task:deployed', handleTaskDeployed)
      socket.off('task:updated', handleTaskUpdated)
      socket.off('task:deployed:sequence', handleTaskSequence)
      socket.off('insight:receive', handleInsightReceived)
      socket.off('student:direct_message', handleStudentDirectMessage)
      socket.off('homework:received', handleHomeworkReceived)
      socket.off('tutor:whiteboard:update', handleTutorWhiteboardUpdate)
      socket.off('whiteboard:state:response', handleWhiteboardStateResponse)
    }
  }, [socket, followTutor, selectedSessionId])

  useEffect(() => {
    if (!activeTaskId && tasks.length > 0) {
      setActiveTaskId(tasks[0].id)
    }
  }, [activeTaskId, tasks])

  const activeTask =
    tasks.find(task => task.id === activeTaskId) ||
    (selectedDirectoryItem?.id === activeTaskId ? selectedDirectoryItem : null) ||
    null
  const currentSession = sessions.find(s => s.id === selectedSessionId) || null
  const isScheduled = currentSession?.status === 'scheduled'
  const isPassedSession =
    isScheduled &&
    currentSession?.scheduledAt &&
    new Date(currentSession.scheduledAt).getTime() + 2 * 60 * 60 * 1000 < Date.now()

  const feedbackPolls = activeTask?.polls ?? []
  const feedbackQuestions = activeTask?.questions ?? []

  let latestInteractionType: 'poll' | 'question' | null = null
  let maxCreatedAt = 0

  feedbackPolls.forEach(p => {
    if (p.createdAt > maxCreatedAt) {
      maxCreatedAt = p.createdAt
      latestInteractionType = 'poll'
    }
  })

  feedbackQuestions.forEach(q => {
    if (q.createdAt > maxCreatedAt) {
      maxCreatedAt = q.createdAt
      latestInteractionType = 'question'
    }
  })

  const interactionsTitle =
    latestInteractionType === 'poll'
      ? 'Interactions: Poll'
      : latestInteractionType === 'question'
        ? 'Interactions: Question'
        : 'Interactions'

  const handleRequestMaterials = async (sessionId: string) => {
    setRequestingSessionId(sessionId)
    try {
      const res = await fetch(`/api/student/sessions/${sessionId}/request-materials`, {
        method: 'POST',
      })
      if (res.ok) {
        toast.success('Material request sent to tutor.')
      } else {
        toast.error('Failed to send request.')
      }
    } catch {
      toast.error('An error occurred while sending request.')
    } finally {
      setRequestingSessionId(null)
    }
  }

  const markNotificationsRead = useCallback(async (notifIds: string[]) => {
    if (notifIds.length === 0) return
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notificationIds: notifIds }),
      })
      if (!res.ok) console.error('Failed to mark notifications as read')
    } catch (e) {
      console.error('Error marking notifications as read:', e)
    }
  }, [])

  const handleSelectDirectoryItem = useCallback(
    (item: any) => {
      // Handle live tasks / homework (LiveTask objects from socket)
      if (item.source === 'task' || item.source === 'assessment' || item.source === 'homework') {
        setSelectedDirectoryItem(item)
        setActiveTaskId(item.id)
        setActiveCourseName(item.courseName || null)
        setUnseenTaskIds(prev => prev.filter(id => id !== item.id))
        setUnseenHomeworkIds(prev => prev.filter(id => id !== item.id))
        const notifId = taskNotifMap.current.get(item.id) || hwNotifMap.current.get(item.id)
        if (notifId) {
          void markNotificationsRead([notifId])
          taskNotifMap.current.delete(item.id)
          hwNotifMap.current.delete(item.id)
        }
        setShowTasksPanel(false)
        return
      }
      if (
        item.type === 'task' ||
        item.type === 'assessment' ||
        item.type === 'homework' ||
        item.type === 'recording'
      ) {
        try {
          const parsed = typeof item.content === 'string' ? JSON.parse(item.content) : item.content
          parsed.title = item.title
          parsed.id = item.itemId || item.id // Use itemId or fallback to id
          parsed.courseName = item.courseName

          setSelectedDirectoryItem(parsed)
          setActiveTaskId(parsed.id)
          setActiveCourseName(item.courseName || null)
          setUnseenTaskIds(prev => prev.filter(id => id !== parsed.id))
          setUnseenHomeworkIds(prev => prev.filter(id => id !== parsed.id))
          const notifId = taskNotifMap.current.get(parsed.id) || hwNotifMap.current.get(parsed.id)
          if (notifId) {
            void markNotificationsRead([notifId])
            taskNotifMap.current.delete(parsed.id)
            hwNotifMap.current.delete(parsed.id)
          }
          setShowTasksPanel(false)
        } catch (e) {
          console.error('Failed to parse task content', e)
        }
      }
    },
    [markNotificationsRead]
  )

  const handleSelectTask = (taskId: string) => {
    setActiveTaskId(taskId)
    setUnseenTaskIds(prev => prev.filter(id => id !== taskId))
    const notifId = taskNotifMap.current.get(taskId)
    if (notifId) {
      void markNotificationsRead([notifId])
      taskNotifMap.current.delete(taskId)
    }
    setShowTasksPanel(false)
  }

  const handlePollVote = (poll: LiveTaskPoll, value: number) => {
    if (!socket || !selectedSessionId || !activeTask) return
    socket.emit('insight:respond', {
      roomId: selectedSessionId,
      taskId: activeTask.id,
      type: 'poll',
      insightId: poll.id,
      value,
    })
  }

  const handleQuestionSend = (question: LiveTaskQuestion) => {
    const draft = questionDrafts[question.id]?.trim()
    if (!draft || !socket || !selectedSessionId || !activeTask) return
    socket.emit('insight:respond', {
      roomId: selectedSessionId,
      taskId: activeTask.id,
      type: 'question',
      insightId: question.id,
      answer: draft,
    })
    setQuestionDrafts(prev => ({ ...prev, [question.id]: '' }))
  }

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-gray-50">
      <div className="flex h-full w-full min-w-0 flex-1 flex-col bg-gray-50/50">
        <div className="w-full px-4 pt-4">
          <div className="flex w-full flex-col gap-4 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-[0_8px_20px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-semibold tracking-tight">
                    {pageTitle}
                    {(tutorHandleFromQuery || sessionContext?.tutorUsername) && (
                      <span className="ml-1.5 text-sm font-normal text-slate-500">
                        (Tutor@
                        {tutorHandleFromQuery || sessionContext?.tutorUsername})
                      </span>
                    )}
                  </h1>
                </div>
                {sessionContext && (
                  <div className="mt-0.5 flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                        sessionContext.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : sessionContext.status === 'scheduled'
                            ? 'bg-amber-100 text-amber-700'
                            : sessionContext.status === 'ended'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-gray-100 text-gray-600'
                      )}
                    >
                      {sessionContext.status === 'active'
                        ? '● Live'
                        : sessionContext.status === 'scheduled'
                          ? '⏳ Scheduled'
                          : sessionContext.status === 'ended'
                            ? '■ Ended'
                            : sessionContext.status || 'Unknown'}
                    </span>
                    {sessionTimer && (
                      <span className="font-mono text-xs text-slate-500">{sessionTimer}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end justify-between gap-4">
              <div className="mt-0 flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowTasksPanel(true)}
                  className="gap-2 font-medium text-slate-700 hover:text-slate-900"
                >
                  <ListTodo className="h-4 w-4" />
                  Lessons
                  {unseenTaskIds.length > 0 && (
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] text-white">
                      {unseenTaskIds.length}
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {sessionContext && (sessionContext.topic || sessionContext.objectives) && (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2 text-sm text-blue-900">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {sessionContext.topic && (
                  <span>
                    <span className="font-semibold">Lesson:</span> {sessionContext.topic}
                  </span>
                )}
              </div>
              {sessionContext.objectives && sessionContext.objectives.length > 0 && (
                <div className="mt-1 text-xs text-blue-800">
                  <span className="font-semibold">Objectives:</span>{' '}
                  {sessionContext.objectives.map((obj, idx) => (
                    <span key={idx}>
                      {idx + 1}) {obj}{' '}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div id="student-live-tabs-portal" ref={portalRef} className="mt-4 w-full" />
        </div>

        {/* Content Wrapper */}
        <div className="relative flex w-full flex-1 items-stretch gap-4 overflow-hidden px-4 pb-4 pt-4">
          {/* Floating collapsed/expanded pill */}
          <div
            className="absolute top-1/2 z-50 flex h-16 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-full border border-l-0 border-[#E5E7EB] bg-white shadow-[2px_0_8px_rgba(0,0,0,0.08)] transition-all hover:w-10 hover:bg-slate-50"
            style={{ left: leftPanelHidden ? 0 : leftPanelWidth - 16 }}
            onClick={() => setLeftPanelHidden(!leftPanelHidden)}
            title={leftPanelHidden ? 'Show directory' : 'Hide directory'}
          >
            {leftPanelHidden ? (
              <ChevronRight className="h-5 w-5 text-[#2B5FB8]" />
            ) : (
              <ChevronLeft className="h-5 w-5 text-[#2B5FB8]" />
            )}
          </div>

          {/* Left Panel */}
          {!leftPanelHidden && (
            <div
              className="relative z-40 flex h-full shrink-0 flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
              style={{ width: leftPanelWidth }}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
                <h2 className="text-sm font-semibold text-[#1F2933]">Directory</h2>
              </div>
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-1">
                  {directoryLoading ? (
                    <div className="flex justify-center px-2 py-8">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                    </div>
                  ) : directoryError ? (
                    <div className="rounded-lg bg-red-50 px-2 py-4 text-center">
                      <p className="text-xs font-medium text-red-700">Failed to load directory</p>
                      <p className="mt-1 text-[11px] text-red-600">{directoryError}</p>
                    </div>
                  ) : Object.keys(studentDirectory).length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-slate-500">
                      No enrolled courses found.
                    </div>
                  ) : (
                    <>
                      {directoryWarnings.length > 0 && (
                        <div className="mb-2 rounded-md bg-amber-50 p-2">
                          <p className="text-[11px] font-medium text-amber-800">
                            Some items couldn&apos;t load:
                          </p>
                          {directoryWarnings.map((w, i) => (
                            <p key={i} className="text-[10px] text-amber-700">
                              {w}
                            </p>
                          ))}
                        </div>
                      )}
                      {Object.entries(studentDirectory).map(([tutorUsername, coursesDict]) => {
                        const tutorKey = `tutor_${tutorUsername}`
                        const isTutorOpen = foldersOpen[tutorKey]

                        return (
                          <div key={tutorUsername}>
                            <button
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
                              onClick={() =>
                                setFoldersOpen(prev => ({ ...prev, [tutorKey]: !prev[tutorKey] }))
                              }
                            >
                              {isTutorOpen ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                              )}
                              <Folder
                                className="h-4 w-4 shrink-0 text-slate-400"
                                fill="currentColor"
                              />
                              <span className="truncate text-sm font-medium text-slate-700">
                                {tutorUsername}
                              </span>
                            </button>

                            {isTutorOpen && (
                              <div className="mt-1 flex flex-col gap-1 pl-4">
                                {Object.entries(coursesDict).map(([courseName, courseData]) => {
                                  const catKey = `cat_${tutorUsername}_${courseName}`
                                  const isCatOpen = foldersOpen[catKey]
                                  const isCurrentCategory =
                                    sessionContext?.courseName === courseName &&
                                    sessionContext?.tutorUsername &&
                                    tutorUsername ===
                                      `Tutor@${sessionContext.tutorUsername.replace(/\s+/g, '')}`

                                  return (
                                    <div key={courseName}>
                                      <button
                                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
                                        onClick={() =>
                                          setFoldersOpen(prev => ({
                                            ...prev,
                                            [catKey]: !prev[catKey],
                                          }))
                                        }
                                      >
                                        {isCatOpen ? (
                                          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                        ) : (
                                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                                        )}
                                        <Folder
                                          className="h-4 w-4 shrink-0 text-indigo-400"
                                          fill="currentColor"
                                        />
                                        <span className="truncate text-sm font-medium text-slate-700">
                                          {courseName}
                                        </span>
                                      </button>

                                      {isCatOpen && (
                                        <div className="mt-1 flex flex-col gap-1 pl-4">
                                          {/* 1. Tasks */}
                                          <div>
                                            <button
                                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
                                              onClick={() =>
                                                setFoldersOpen(prev => ({
                                                  ...prev,
                                                  tasks: !prev.tasks,
                                                }))
                                              }
                                            >
                                              {foldersOpen.tasks ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                                              )}
                                              <Folder
                                                className="h-4 w-4 shrink-0 text-blue-400"
                                                fill="currentColor"
                                              />
                                              <span className="text-sm font-medium text-slate-700">
                                                Tasks
                                              </span>
                                              {unseenTaskIds.length > 0 && (
                                                <span className="ml-auto rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] text-white">
                                                  {unseenTaskIds.length}
                                                </span>
                                              )}
                                            </button>
                                            {foldersOpen.tasks && (
                                              <div className="mt-1 flex flex-col gap-0.5 pl-6">
                                                {(!courseData.tasks ||
                                                  courseData.tasks.length === 0) && (
                                                  <span className="px-2 py-1 text-xs text-slate-500">
                                                    Empty folder
                                                  </span>
                                                )}
                                                {courseData.tasks &&
                                                  [...courseData.tasks].reverse().map(task => (
                                                    <button
                                                      key={task.id}
                                                      onClick={() =>
                                                        handleSelectDirectoryItem(task)
                                                      }
                                                      className={cn(
                                                        'group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                                                        activeTaskId === (task.itemId || task.id)
                                                          ? 'bg-blue-50 font-medium text-blue-700'
                                                          : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                                                      )}
                                                    >
                                                      <FileText className="h-3.5 w-3.5 shrink-0" />
                                                      <span className="truncate">{task.title}</span>
                                                      {unseenTaskIds.includes(
                                                        task.itemId || task.id
                                                      ) && (
                                                        <div className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                                                      )}
                                                    </button>
                                                  ))}
                                              </div>
                                            )}
                                          </div>

                                          {/* 2. Assessments */}
                                          <div>
                                            <button
                                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
                                              onClick={() =>
                                                setFoldersOpen(prev => ({
                                                  ...prev,
                                                  assessments: !prev.assessments,
                                                }))
                                              }
                                            >
                                              {foldersOpen.assessments ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                                              )}
                                              <Folder
                                                className="h-4 w-4 shrink-0 text-purple-400"
                                                fill="currentColor"
                                              />
                                              <span className="text-sm font-medium text-slate-700">
                                                Assessments
                                              </span>
                                            </button>
                                            {foldersOpen.assessments && (
                                              <div className="mt-1 flex flex-col gap-0.5 pl-6">
                                                {(!courseData.assessments ||
                                                  courseData.assessments.length === 0) && (
                                                  <span className="px-2 py-1 text-xs text-slate-500">
                                                    Empty folder
                                                  </span>
                                                )}
                                                {courseData.assessments &&
                                                  [...courseData.assessments]
                                                    .reverse()
                                                    .map(task => (
                                                      <button
                                                        key={task.id}
                                                        onClick={() =>
                                                          handleSelectDirectoryItem(task)
                                                        }
                                                        className={cn(
                                                          'group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                                                          activeTaskId === (task.itemId || task.id)
                                                            ? 'bg-purple-50 font-medium text-purple-700'
                                                            : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                                                        )}
                                                      >
                                                        <FileText className="h-3.5 w-3.5 shrink-0 text-purple-400" />
                                                        <span className="truncate">
                                                          {task.title}
                                                        </span>
                                                      </button>
                                                    ))}
                                              </div>
                                            )}
                                          </div>

                                          {/* 3. Homework */}
                                          <div>
                                            <button
                                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
                                              onClick={() => {
                                                setFoldersOpen(prev => ({
                                                  ...prev,
                                                  homework: !prev.homework,
                                                }))
                                                // Mark homework as seen when folder is opened
                                                setUnseenHomeworkIds([])
                                                const hwNotifIds = Array.from(
                                                  hwNotifMap.current.values()
                                                )
                                                if (hwNotifIds.length > 0) {
                                                  void markNotificationsRead(hwNotifIds)
                                                  hwNotifMap.current.clear()
                                                }
                                              }}
                                            >
                                              {foldersOpen.homework ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                                              )}
                                              <Folder
                                                className="h-4 w-4 shrink-0 text-emerald-400"
                                                fill="currentColor"
                                              />
                                              <span className="text-sm font-medium text-slate-700">
                                                Homework
                                              </span>
                                              {unseenHomeworkIds.length > 0 && (
                                                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">
                                                  {unseenHomeworkIds.length}
                                                </span>
                                              )}
                                            </button>
                                            {foldersOpen.homework && (
                                              <div className="mt-1 flex flex-col gap-0.5 pl-6">
                                                {(!courseData.homework ||
                                                  courseData.homework.length === 0) &&
                                                  liveHomework.length === 0 && (
                                                    <span className="px-2 py-1 text-xs text-slate-500">
                                                      Empty folder
                                                    </span>
                                                  )}
                                                {/* Directory homework */}
                                                {courseData.homework &&
                                                  [...courseData.homework].reverse().map(task => (
                                                    <button
                                                      key={task.id}
                                                      onClick={() =>
                                                        handleSelectDirectoryItem(task)
                                                      }
                                                      className={cn(
                                                        'group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                                                        activeTaskId === (task.itemId || task.id)
                                                          ? 'bg-emerald-50 font-medium text-emerald-700'
                                                          : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                                                      )}
                                                    >
                                                      <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                                      <span className="truncate">{task.title}</span>
                                                    </button>
                                                  ))}
                                                {/* Live homework from socket */}
                                                {liveHomework.map(hw => (
                                                  <button
                                                    key={hw.id}
                                                    onClick={() => handleSelectDirectoryItem(hw)}
                                                    className={cn(
                                                      'group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                                                      activeTaskId === hw.id
                                                        ? 'bg-emerald-50 font-medium text-emerald-700'
                                                        : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                                                    )}
                                                  >
                                                    <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                                    <span className="truncate">{hw.title}</span>
                                                    {unseenHomeworkIds.includes(hw.id) && (
                                                      <div className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                                    )}
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>

                                          {/* 4. Reports */}
                                          <div>
                                            <button
                                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
                                              onClick={() =>
                                                setFoldersOpen(prev => ({
                                                  ...prev,
                                                  reports: !prev.reports,
                                                }))
                                              }
                                            >
                                              {foldersOpen.reports ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                                              )}
                                              <Folder
                                                className="h-4 w-4 shrink-0 text-orange-400"
                                                fill="currentColor"
                                              />
                                              <span className="text-sm font-medium text-slate-700">
                                                Reports
                                              </span>
                                            </button>
                                            {foldersOpen.reports && (
                                              <div className="mt-1 flex flex-col gap-0.5 pl-6">
                                                {(!courseData.reports ||
                                                  courseData.reports.length === 0) && (
                                                  <div className="flex flex-col gap-2 px-2 py-2">
                                                    <span className="text-xs text-slate-500">
                                                      No reports yet.
                                                    </span>
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      className="h-7 w-full justify-start text-xs"
                                                      onClick={async () => {
                                                        const cId =
                                                          sessionContext?.courseId ||
                                                          searchParams?.get('courseId') ||
                                                          courseData.tasks?.[0]?.courseId ||
                                                          courseData.recordedSessions?.[0]?.courseId
                                                        if (!cId) {
                                                          toast.error(
                                                            'Could not determine course. Please try again.'
                                                          )
                                                          return
                                                        }
                                                        try {
                                                          const res = await fetch(
                                                            '/api/student/reports/request',
                                                            {
                                                              method: 'POST',
                                                              headers: {
                                                                'Content-Type': 'application/json',
                                                              },
                                                              body: JSON.stringify({
                                                                courseId: cId,
                                                                type: 'master',
                                                              }),
                                                            }
                                                          )
                                                          if (res.ok)
                                                            toast.success(
                                                              'Report request sent to tutor'
                                                            )
                                                          else
                                                            toast.error('Failed to request report')
                                                        } catch (e) {
                                                          toast.error('An error occurred')
                                                        }
                                                      }}
                                                    >
                                                      Request Report
                                                    </Button>
                                                  </div>
                                                )}
                                                {courseData.reports &&
                                                  [...courseData.reports]
                                                    .reverse()
                                                    .map(
                                                      (report: {
                                                        id: string
                                                        title?: string
                                                        status?: string
                                                        score?: number
                                                        content?: any
                                                        createdAt?: string
                                                      }) => (
                                                        <button
                                                          key={report.id}
                                                          onClick={() => {
                                                            setSelectedReport(report)
                                                            setReportModalOpen(true)
                                                          }}
                                                          className="flex w-full items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-100"
                                                        >
                                                          <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                          <span className="truncate text-xs font-medium text-slate-600">
                                                            {report.title}
                                                          </span>
                                                        </button>
                                                      )
                                                    )}
                                              </div>
                                            )}
                                          </div>

                                          {/* 5. Recorded Sessions */}
                                          <div>
                                            <button
                                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
                                              onClick={() =>
                                                setFoldersOpen(prev => ({
                                                  ...prev,
                                                  recordedSessions: !prev.recordedSessions,
                                                }))
                                              }
                                            >
                                              {foldersOpen.recordedSessions ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                                              )}
                                              <Folder
                                                className="h-4 w-4 shrink-0 text-rose-400"
                                                fill="currentColor"
                                              />
                                              <span className="text-sm font-medium text-slate-700">
                                                Recorded sessions
                                              </span>
                                            </button>
                                            {foldersOpen.recordedSessions && (
                                              <div className="mt-1 flex flex-col gap-0.5 pl-6">
                                                {(!courseData.recordedSessions ||
                                                  courseData.recordedSessions.length === 0) && (
                                                  <span className="px-2 py-1 text-xs text-slate-500">
                                                    Empty folder
                                                  </span>
                                                )}
                                                {courseData.recordedSessions &&
                                                  [...courseData.recordedSessions]
                                                    .reverse()
                                                    .map(session => (
                                                      <button
                                                        key={session.id}
                                                        onClick={() =>
                                                          handleSelectDirectoryItem(session)
                                                        }
                                                        className={cn(
                                                          'group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                                                          activeTaskId ===
                                                            (session.itemId || session.id)
                                                            ? 'bg-rose-50 font-medium text-rose-700'
                                                            : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                                                        )}
                                                      >
                                                        <Video className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                                                        <span className="truncate">
                                                          {session.title}
                                                        </span>
                                                      </button>
                                                    ))}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </>
                  )}
                  {/* Legacy Assets Mapping - Fallback to Course Category root for now */}
                  {courseAssets.length > 0 && (
                    <div className="mt-4 flex flex-col gap-0.5">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Shared Assets
                      </div>
                      {assetsLoading ? (
                        <span className="flex items-center gap-2 px-2 py-1 text-xs text-slate-500">
                          <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                        </span>
                      ) : (
                        courseAssets.map(asset => (
                          <a
                            key={asset.resourceId}
                            href={asset.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                            title={asset.name}
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{asset.name}</span>
                          </a>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div
                className="absolute bottom-0 right-0 top-0 w-2 cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/40"
                onMouseDown={e => {
                  setLeftPanelResizing(true)
                  leftResizeStartX.current = e.clientX
                  leftResizeStartW.current = leftPanelWidth
                }}
              />
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex h-full min-h-0 flex-1 flex-col"
            >
              {(() => {
                const controlRow = (
                  <div className="sticky top-3 z-50 w-full px-4">
                    <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur-md">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setFollowTutor(!followTutor)}
                          className={cn(
                            'h-8 rounded-full px-3 text-xs font-semibold shadow-sm',
                            followTutor
                              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          )}
                        >
                          <div
                            className={cn(
                              'mr-2 h-2 w-2 rounded-full',
                              followTutor ? 'animate-pulse bg-white' : 'bg-slate-500'
                            )}
                          />
                          {followTutor ? 'Following Tutor' : 'Follow Tutor'}
                        </Button>

                        <div
                          className={cn(
                            'flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold',
                            isConnected
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : error
                                ? 'border-red-200 bg-red-50 text-red-700'
                                : 'border-slate-200 bg-slate-50 text-slate-700'
                          )}
                        >
                          <div
                            className={cn(
                              'h-2 w-2 rounded-full',
                              isConnected ? 'bg-emerald-500' : error ? 'bg-red-500' : 'bg-slate-400'
                            )}
                          />
                          {isConnected ? 'Connected' : error ? 'Disconnected' : 'Connecting'}
                        </div>

                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setIsMirroringToTutor(!isMirroringToTutor)}
                          className={cn(
                            'h-8 rounded-full px-3 text-xs font-semibold shadow-sm',
                            isMirroringToTutor
                              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          )}
                        >
                          <div
                            className={cn(
                              'mr-2 h-2 w-2 rounded-full',
                              isMirroringToTutor ? 'bg-white' : 'bg-slate-500'
                            )}
                          />
                          {isMirroringToTutor ? 'Mirroring On' : 'Mirror to Tutor'}
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!sessionContext?.roomUrl}
                          onClick={() => {
                            if (!sessionContext?.roomUrl) return
                            openVideoOverlay({
                              roomUrl: sessionContext.roomUrl,
                              token: sessionContext.token,
                              autoRecord: false,
                            })
                          }}
                          className="h-8 gap-2 rounded-full px-3 text-xs font-semibold shadow-sm"
                        >
                          <Video className="h-4 w-4" />
                          Video
                        </Button>
                      </div>

                      <TabsList
                        className={cn(
                          'flex h-8 items-center gap-2 border-0 bg-transparent p-0 shadow-none transition-opacity',
                          followTutor && 'pointer-events-none opacity-40'
                        )}
                        title={followTutor ? 'Unfollow tutor to switch tabs manually' : undefined}
                      >
                        <TabsTrigger
                          value="task"
                          className="h-8 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all data-[state=active]:bg-white data-[state=active]:text-[#1F2933] data-[state=inactive]:text-[#1F2933]"
                        >
                          Classroom
                        </TabsTrigger>
                        <TabsTrigger
                          value="my-board"
                          className="h-8 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all data-[state=active]:bg-white data-[state=active]:text-[#1F2933] data-[state=inactive]:text-[#1F2933]"
                        >
                          My Board
                        </TabsTrigger>
                        <TabsTrigger
                          value="tutor-board"
                          className="h-8 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all data-[state=active]:bg-white data-[state=active]:text-[#1F2933] data-[state=inactive]:text-[#1F2933]"
                        >
                          Tutor Board
                        </TabsTrigger>
                      </TabsList>
                    </div>
                  </div>
                )

                return portalTarget ? createPortal(controlRow, portalTarget) : controlRow
              })()}

              <TabsContent
                value="task"
                padding="none"
                className="flex h-full min-h-0 flex-1 flex-col outline-none"
              >
                {/* Classroom viewer */}
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-[rgba(241,118,35,0.5)] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)] transition-all duration-200 hover:shadow-[0_12px_32px_rgba(31,41,51,0.14)]">
                  <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-center">
                    <span className="rounded-b-md bg-[rgba(241,118,35,0.5)] px-3 py-0.5 text-[11px] font-medium text-white">
                      Classroom
                    </span>
                  </div>

                  <div className="flex-1 overflow-hidden p-4 pt-6">
                    {activeTask ? (
                      <div
                        className="h-full w-full"
                        style={{ zoom: viewerZoom } as React.CSSProperties}
                      >
                        {activeTask.sourceDocument || activeTask.content ? (
                          <div className="h-full w-full overflow-y-auto">
                            {activeTask.sourceDocument ? (
                              <div className="h-full w-full">
                                {activeTask.sourceDocument.mimeType === 'application/pdf' ||
                                !activeTask.sourceDocument.mimeType ? (
                                  <div className="h-full w-full overflow-hidden">
                                    <iframe
                                      src={
                                        activeTask.sourceDocument.fileUrl.includes('#')
                                          ? `${activeTask.sourceDocument.fileUrl}&toolbar=0&navpanes=0`
                                          : `${activeTask.sourceDocument.fileUrl}#toolbar=0&navpanes=0`
                                      }
                                      title={activeTask.sourceDocument.fileName}
                                      className="h-full w-full"
                                    />
                                  </div>
                                ) : activeTask.sourceDocument.mimeType.startsWith('image/') ? (
                                  <div className="flex h-full items-center justify-center">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={activeTask.sourceDocument.fileUrl}
                                      alt={activeTask.sourceDocument.fileName}
                                      className="max-h-full max-w-full object-contain"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex h-full flex-col items-center justify-center gap-2">
                                    <FileText className="h-8 w-8 text-blue-600" />
                                    <a
                                      href={activeTask.sourceDocument.fileUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-sm text-blue-600 underline"
                                    >
                                      Open {activeTask.sourceDocument.fileName}
                                    </a>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap text-sm text-gray-700">
                                {activeTask.content}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center" />
                        )}
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center" />
                    )}
                  </div>

                  {/* Floating zoom controls */}
                  <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1 rounded-full bg-white/90 p-1 shadow-md backdrop-blur-sm">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full text-slate-600 hover:bg-slate-100"
                      onClick={() => setViewerZoom(z => Math.min(2, z + 0.1))}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full text-slate-600 hover:bg-slate-100"
                      onClick={() => setViewerZoom(z => Math.max(0.5, z - 0.1))}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Input row */}
                <div className="mt-3 flex items-center gap-3">
                  <div className="relative flex-1">
                    <Input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          if (chatInput.trim() && socket) {
                            socket.emit('chat_message', { text: chatInput.trim() })
                            setChatInput('')
                          }
                        }
                      }}
                      className="h-11 w-full rounded-xl border-slate-200 pr-10 text-sm focus-visible:ring-[rgba(241,118,35,0.5)]"
                    />
                    <Button
                      size="icon"
                      className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg bg-slate-400 text-white hover:bg-slate-500 disabled:opacity-30"
                      disabled={!chatInput.trim() || !socket}
                      onClick={() => {
                        if (chatInput.trim() && socket) {
                          socket.emit('chat_message', { text: chatInput.trim() })
                          setChatInput('')
                        }
                      }}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    className="h-11 rounded-xl bg-[#F17623] px-5 text-sm font-semibold text-white hover:bg-[#d9651a]"
                    disabled={!activeTaskId || !socket}
                    onClick={() => {
                      if (!activeTaskId || !socket || !selectedSessionId) return
                      socket.emit('task:complete', {
                        roomId: selectedSessionId,
                        taskId: activeTaskId,
                      })
                      toast.success('Task marked complete')
                    }}
                  >
                    Task Complete
                  </Button>
                </div>
              </TabsContent>

              <TabsContent
                value="my-board"
                padding="none"
                className="flex h-full min-h-0 flex-1 flex-col outline-none"
              >
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <EnhancedWhiteboard
                    pages={myBoardPages}
                    currentPageIndex={myBoardPageIndex}
                    onPagesChange={setMyBoardPages}
                    onPageIndexChange={setMyBoardPageIndex}
                    socket={socket}
                    roomId={selectedSessionId ?? undefined}
                    userId={session?.user?.id ?? undefined}
                    userName={session?.user?.name || 'Student'}
                    userColor={stringToColor(session?.user?.id || '')}
                  />
                </div>
              </TabsContent>

              <TabsContent
                value="tutor-board"
                padding="none"
                className="flex h-full min-h-0 flex-1 flex-col outline-none"
              >
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <EnhancedWhiteboard
                    readOnly
                    pages={tutorBoardPages}
                    currentPageIndex={tutorBoardPageIndex}
                    onPagesChange={setTutorBoardPages}
                    onPageIndexChange={setTutorBoardPageIndex}
                    socket={socket}
                    roomId={selectedSessionId ?? undefined}
                    filterByUserId={sessionContext?.tutorId ?? undefined}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Persistent Right Panel */}
          <div className="relative flex h-full w-[340px] shrink-0 flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)] transition-all sm:w-[380px] lg:w-[400px]">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="flex w-full items-center gap-2 rounded-lg bg-gray-100 p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRightPanelTab('interactions')}
                  className={cn(
                    'h-8 flex-1 rounded-md px-3 text-xs font-medium transition-all',
                    rightPanelTab === 'interactions'
                      ? 'bg-white text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.08)]'
                      : 'text-gray-500 hover:text-gray-900'
                  )}
                >
                  Interact
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRightPanelTab('dmi')}
                  className={cn(
                    'h-8 flex-1 rounded-md px-3 text-xs font-medium transition-all',
                    rightPanelTab === 'dmi'
                      ? 'bg-white text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.08)]'
                      : 'text-gray-500 hover:text-gray-900'
                  )}
                >
                  DMI
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRightPanelTab('board')}
                  className={cn(
                    'h-8 flex-1 rounded-md px-3 text-xs font-medium transition-all',
                    rightPanelTab === 'board'
                      ? 'bg-white text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.08)]'
                      : 'text-gray-500 hover:text-gray-900'
                  )}
                >
                  Board
                </Button>
              </div>
            </div>

            <div className={cn('flex-1', rightPanelTab === 'board' ? 'overflow-hidden' : 'overflow-y-auto p-4')}>
              {rightPanelTab === 'dmi' ? (
                <div className="space-y-4">
                  <div className="mb-4 border-b border-gray-100 pb-2">
                    <h2 className="text-base font-bold text-gray-900">DMI</h2>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500">
                      Digital Marking Interface
                    </p>
                  </div>
                  {!activeTask || !activeTask.dmiItems || activeTask.dmiItems.length === 0 ? (
                    <p className="text-sm text-gray-500">No DMI available for this task.</p>
                  ) : (
                    <div className="space-y-3">
                      {activeTask.dmiItems.map(item => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                        >
                          <p className="mb-1.5 text-xs font-bold text-blue-600">
                            Q{item.questionNumber}
                          </p>
                          <p className="text-sm font-medium text-gray-800">{item.questionText}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : rightPanelTab === 'board' ? (
                <div className="flex h-full min-h-0 flex-col overflow-hidden">
                  <EnhancedWhiteboard
                    pages={myBoardPages}
                    currentPageIndex={myBoardPageIndex}
                    onPagesChange={setMyBoardPages}
                    onPageIndexChange={setMyBoardPageIndex}
                    socket={socket}
                    roomId={selectedSessionId ?? undefined}
                    userId={session?.user?.id ?? undefined}
                    userName={session?.user?.name || 'Student'}
                    userColor={stringToColor(session?.user?.id || '')}
                  />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="mb-2 border-b border-gray-100 pb-2">
                    <h2 className="text-base font-bold text-gray-900">{interactionsTitle}</h2>
                  </div>
                  {!activeTask && (
                    <p className="text-sm text-gray-500">Select a task to see feedback prompts.</p>
                  )}
                  {activeTask && (
                    <div className="space-y-6">
                      {feedbackPolls.length > 0 && (
                        <div className="space-y-3">
                          {feedbackPolls.map(poll => {
                            const selectedValue = poll.responses.find(
                              response => response.studentId === session?.user?.id
                            )?.value
                            return (
                              <div key={poll.id} className="rounded-lg border bg-white p-4">
                                <p className="text-sm font-medium text-gray-900">{poll.question}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {poll.options.map(option => (
                                    <Button
                                      key={`${poll.id}-${option}`}
                                      variant={selectedValue === option ? 'default' : 'outline'}
                                      size="sm"
                                      disabled={poll.status === 'closed'}
                                      onClick={() => handlePollVote(poll, option)}
                                    >
                                      {option}
                                    </Button>
                                  ))}
                                </div>
                                {poll.status === 'closed' && (
                                  <p className="mt-2 text-xs text-gray-500">Poll closed</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {feedbackQuestions.length > 0 && (
                        <div className="space-y-3">
                          {feedbackQuestions.map(question => (
                            <div key={question.id} className="rounded-lg border bg-white p-4">
                              <p className="text-sm font-medium text-gray-900">{question.prompt}</p>
                              <div className="mt-3">
                                <AutoTextarea
                                  placeholder="Type your answer..."
                                  className="min-h-[72px]"
                                  value={questionDrafts[question.id] || ''}
                                  onChange={event =>
                                    setQuestionDrafts(prev => ({
                                      ...prev,
                                      [question.id]: event.target.value,
                                    }))
                                  }
                                />
                                <div className="mt-2 flex justify-end">
                                  <Button
                                    size="sm"
                                    onClick={() => handleQuestionSend(question)}
                                    disabled={!questionDrafts[question.id]?.trim()}
                                  >
                                    Send
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {feedbackPolls.length === 0 && feedbackQuestions.length === 0 && (
                        <p className="text-sm text-gray-500">
                          Waiting for tutor insights to appear here.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <Sheet open={showTasksPanel} onOpenChange={setShowTasksPanel}>
            <SheetContent side="right" className="w-[340px] sm:w-[380px]">
              <SheetHeader>
                <SheetTitle>Tasks & Assessments</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-2">
                {tasks.length === 0 && (
                  <p className="text-sm text-gray-500">No tasks deployed yet.</p>
                )}
                {[...tasks].reverse().map(task => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => handleSelectTask(task.id)}
                    className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                      activeTaskId === task.id
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-100 hover:bg-blue-50/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900">{task.title}</span>
                      {unseenTaskIds.includes(task.id) && (
                        <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] text-white">
                          New
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      Deployed {new Date(task.deployedAt).toLocaleTimeString()}
                    </span>
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          {/* Report Modal */}
          <Dialog open={reportModalOpen} onOpenChange={setReportModalOpen}>
            <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-indigo-600" />
                  {selectedReport?.title}
                </DialogTitle>
                <DialogDescription>
                  Sent on{' '}
                  {selectedReport?.deployedAt
                    ? new Date(selectedReport.deployedAt).toLocaleDateString()
                    : 'Unknown date'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                {selectedReport?.content?.strengths &&
                  selectedReport.content.strengths.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-green-700">
                        Strengths
                      </h4>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                        {selectedReport.content.strengths.map((s: string, i: number) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                {selectedReport?.content?.weaknesses &&
                  selectedReport.content.weaknesses.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-amber-700">
                        Areas for Improvement
                      </h4>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                        {selectedReport.content.weaknesses.map((s: string, i: number) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                {selectedReport?.content?.overallComments && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-indigo-700">
                      Tutor Comments
                    </h4>
                    <div className="rounded-lg bg-indigo-50 p-4 text-sm text-gray-800">
                      {selectedReport.content.overallComments}
                    </div>
                  </div>
                )}

                {selectedReport?.content?.score !== undefined &&
                  selectedReport.content.score !== null && (
                    <div className="flex items-center justify-between border-t pt-4">
                      <span className="font-semibold text-gray-700">Overall Score</span>
                      <span className="text-xl font-bold text-indigo-600">
                        {selectedReport.content.score}%
                      </span>
                    </div>
                  )}
              </div>
              <div className="flex justify-end px-0 pb-0 pt-2">
                <Button variant="outline" onClick={() => setReportModalOpen(false)}>
                  Close
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}
