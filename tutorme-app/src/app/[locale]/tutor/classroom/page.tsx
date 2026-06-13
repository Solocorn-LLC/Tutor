'use client'

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  Suspense,
  type ComponentProps,
} from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSocket } from '@/hooks/use-socket'
import { useVideoOverlayStore } from '@/stores/video-overlay-store'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Loader2,
  Users,
  Send,
  Video,
  ArrowLeft,
  StopCircle,
  BookOpen,
  Monitor,
  BarChart2,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EnhancedWhiteboard } from '@/components/class/enhanced-whiteboard'
import type { LiveTask, ChatMessage } from '@/lib/socket'

type WhiteboardPages = NonNullable<ComponentProps<typeof EnhancedWhiteboard>['pages']>
type WhiteboardPage = WhiteboardPages[number]

const defaultWhiteboardPages = (): WhiteboardPages => [
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

interface Participant {
  studentId: string
  name: string | null
  email: string | null
  joinedAt: string | null
}

interface BuilderTask {
  taskId: string
  title: string
  type: string
  status: string
  content?: string | null
}

interface SessionDetails {
  sessionId: string
  title: string
  status: string
  roomUrl: string | null
  tutorToken: string | null
  courseId: string | null
  courseName: string | null
  scheduledAt: string | null
  startedAt: string | null
}

export default function TutorClassroomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <TutorClassroomContent />
    </Suspense>
  )
}

function TutorClassroomContent() {
  const { data: authSession } = useSession()
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get('sessionId') ?? ''

  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [availableTasks, setAvailableTasks] = useState<BuilderTask[]>([])
  const [deployedTasks, setDeployedTasks] = useState<LiveTask[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [activeTab, setActiveTab] = useState<'whiteboard' | 'classroom'>('classroom')
  const [rightTab, setRightTab] = useState<'participants' | 'tasks' | 'polls'>('participants')
  const [sessionTimer, setSessionTimer] = useState('')
  const [loading, setLoading] = useState(true)
  const [ending, setEnding] = useState(false)
  const [leftPanelHidden, setLeftPanelHidden] = useState(false)
  const [leftPanelWidth, setLeftPanelWidth] = useState(280)
  const leftResizeStartX = useRef(0)
  const leftResizeStartW = useRef(280)
  const [leftPanelResizing, setLeftPanelResizing] = useState(false)
  const [whiteboardPages, setWhiteboardPages] = useState<WhiteboardPage[]>(defaultWhiteboardPages)
  const [whiteboardPageIndex, setWhiteboardPageIndex] = useState(0)

  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])

  const openVideoOverlay = useVideoOverlayStore(s => s.openOverlay)

  const getCsrfToken = useCallback(async () => {
    try {
      const res = await fetch('/api/csrf', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      return data?.token ?? null
    } catch {
      return null
    }
  }, [])

  // Load session details
  useEffect(() => {
    if (!sessionId) return
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/tutor/classes/${sessionId}`, { credentials: 'include' })
        if (!res.ok) {
          toast.error('Session not found or you do not have access.')
          return
        }
        const data = await res.json()
        setSessionDetails(data.session ?? null)
        setParticipants(data.participants ?? [])
      } catch (err: unknown) {
        toast.error((err as Error)?.message || 'Failed to load session')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [sessionId])

  // Load available builder tasks for the course
  useEffect(() => {
    const courseId = sessionDetails?.courseId
    if (!courseId) return
    const load = async () => {
      try {
        const res = await fetch(`/api/tutor/courses/${courseId}/submissions-tree`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (res.ok) {
          const data = await res.json()
          setAvailableTasks(data.tasks ?? [])
        }
      } catch {
        // non-fatal
      }
    }
    load()
  }, [sessionDetails?.courseId])

  // Session timer
  useEffect(() => {
    if (!sessionDetails) return
    const update = () => {
      if (sessionDetails.status === 'active' && sessionDetails.startedAt) {
        const elapsed = Math.max(0, Date.now() - new Date(sessionDetails.startedAt).getTime())
        const mins = Math.floor(elapsed / 60000)
        const secs = Math.floor((elapsed % 60000) / 1000)
        setSessionTimer(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`)
      } else if (sessionDetails.scheduledAt) {
        const diff = new Date(sessionDetails.scheduledAt).getTime() - Date.now()
        if (diff > 0) {
          const mins = Math.floor(diff / 60000)
          const secs = Math.floor((diff % 60000) / 1000)
          setSessionTimer(
            `Starts in ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
          )
        } else {
          setSessionTimer('Starting soon')
        }
      }
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [sessionDetails])

  // Left panel resize
  useEffect(() => {
    if (!leftPanelResizing) return
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - leftResizeStartX.current
      setLeftPanelWidth(Math.max(200, Math.min(480, leftResizeStartW.current + delta)))
    }
    const onUp = () => setLeftPanelResizing(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [leftPanelResizing])

  const socketOptions = useMemo(() => {
    if (!sessionId || !authSession?.user?.id) return undefined
    return {
      roomId: sessionId,
      userId: authSession.user.id,
      name: authSession.user.name || 'Tutor',
      role: 'tutor' as const,
      onStudentJoined: (student: { userId: string; name: string; email?: string }) => {
        setParticipants(prev => {
          if (prev.some(p => p.studentId === student.userId)) return prev
          return [
            ...prev,
            {
              studentId: student.userId,
              name: student.name,
              email: student.email ?? null,
              joinedAt: new Date().toISOString(),
            },
          ]
        })
        toast.info(`${student.name || 'A student'} joined`)
      },
      onStudentLeft: (userId: string) => {
        setParticipants(prev => prev.filter(p => p.studentId !== userId))
      },
      onChatMessage: (msg: ChatMessage) => {
        setChatMessages(prev => [...prev.slice(-49), msg])
      },
      onRoomState: (state: {
        students?: { userId: string; name: string }[]
        chatHistory?: ChatMessage[]
        tasks?: LiveTask[]
        whiteboardData?: { tutorBoard?: { pages?: WhiteboardPage[]; pageIndex?: number } }
      }) => {
        if (state.students) {
          setParticipants(prev => {
            const existing = new Set(prev.map(p => p.studentId))
            const incoming = state
              .students!.filter(s => !existing.has(s.userId))
              .map(s => ({ studentId: s.userId, name: s.name, email: null, joinedAt: null }))
            return [...prev, ...incoming]
          })
        }
        if (state.chatHistory) setChatMessages(state.chatHistory)
        if (state.tasks) setDeployedTasks(state.tasks)
        if (state.whiteboardData?.tutorBoard?.pages) {
          setWhiteboardPages(state.whiteboardData.tutorBoard.pages)
        }
        if (typeof state.whiteboardData?.tutorBoard?.pageIndex === 'number') {
          setWhiteboardPageIndex(state.whiteboardData.tutorBoard.pageIndex)
        }
      },
    }
  }, [sessionId, authSession?.user?.id, authSession?.user?.name])

  const { socket, isConnected, error } = useSocket(socketOptions)

  const deployTask = useCallback(
    (task: BuilderTask) => {
      if (!socket || !sessionId) return
      socket.emit('task:deploy', { roomId: sessionId, task })
      setDeployedTasks(prev => {
        const exists = prev.some(t => t.id === task.taskId)
        if (exists) return prev
        return [
          ...prev,
          {
            id: task.taskId,
            title: task.title,
            content: task.content ?? '',
            source: 'task' as const,
            deployedAt: Date.now(),
            polls: [],
            questions: [],
            dmiItems: [],
          },
        ]
      })
      toast.success(`Task deployed: ${task.title}`)
    },
    [socket, sessionId]
  )

  const sendChat = useCallback(() => {
    if (!chatInput.trim() || !socket) return
    socket.emit('chat_message', { text: chatInput.trim() })
    setChatInput('')
  }, [chatInput, socket])

  const createPoll = useCallback(() => {
    if (!socket || !sessionId || !pollQuestion.trim()) return
    const options = pollOptions.filter(o => o.trim())
    if (options.length < 2) {
      toast.error('Add at least 2 options')
      return
    }
    socket.emit('poll:create', { roomId: sessionId, question: pollQuestion.trim(), options })
    setPollQuestion('')
    setPollOptions(['', ''])
    toast.success('Poll sent to students')
  }, [socket, sessionId, pollQuestion, pollOptions])

  const endSession = useCallback(async () => {
    if (!sessionId || ending) return
    setEnding(true)
    try {
      const csrfToken = await getCsrfToken()
      const res = await fetch(`/api/tutor/classes/${sessionId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
      })
      if (res.ok) {
        toast.success('Session ended')
        router.push('/tutor/classes')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to end session')
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message || 'Failed to end session')
    } finally {
      setEnding(false)
    }
  }, [sessionId, ending, getCsrfToken, router])

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!sessionId) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <p className="text-gray-500">No session ID provided.</p>
      </div>
    )
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="w-full px-4 pt-2">
        <div className="flex w-full items-center gap-4 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.08)]">
          <Button variant="ghost" size="icon" onClick={() => router.push('/tutor/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex flex-1 flex-col justify-center">
            <h1 className="text-base font-semibold tracking-tight">
              {sessionDetails?.title || sessionDetails?.courseName || 'Live Classroom'}
            </h1>
            <div className="mt-0.5 flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'text-[11px]',
                  sessionDetails?.status === 'active'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : sessionDetails?.status === 'scheduled'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                )}
              >
                {sessionDetails?.status === 'active'
                  ? '● Live'
                  : sessionDetails?.status === 'scheduled'
                    ? '⏳ Scheduled'
                    : (sessionDetails?.status ?? 'Unknown')}
              </Badge>
              {sessionTimer && (
                <span className="font-mono text-xs text-slate-500">{sessionTimer}</span>
              )}
              <div
                className={cn(
                  'ml-2 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  isConnected
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : error
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                )}
              >
                <div
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    isConnected ? 'bg-emerald-500' : error ? 'bg-red-500' : 'bg-slate-400'
                  )}
                />
                {isConnected ? 'Connected' : error ? 'Disconnected' : 'Connecting'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 rounded-full px-3 text-xs"
              disabled={!sessionDetails?.roomUrl}
              onClick={() => {
                if (!sessionDetails?.roomUrl) return
                openVideoOverlay({
                  roomUrl: sessionDetails.roomUrl,
                  token: sessionDetails.tutorToken,
                  autoRecord: true,
                })
              }}
            >
              <Video className="h-3.5 w-3.5" />
              Video
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 gap-1.5 rounded-full px-3 text-xs"
              disabled={ending}
              onClick={() => {
                if (confirm('End this session for all participants?')) void endSession()
              }}
            >
              {ending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <StopCircle className="h-3.5 w-3.5" />
              )}
              End Session
            </Button>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="relative flex w-full flex-1 items-stretch gap-4 overflow-hidden px-4 pb-4 pt-2">
        {/* Left panel collapse toggle */}
        <div
          className="absolute top-1/2 z-50 flex h-16 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-full border border-l-0 border-[#E5E7EB] bg-white shadow-[2px_0_8px_rgba(0,0,0,0.08)] transition-all hover:w-10 hover:bg-slate-50"
          style={{ left: leftPanelHidden ? 0 : leftPanelWidth - 16 }}
          onClick={() => setLeftPanelHidden(v => !v)}
        >
          {leftPanelHidden ? (
            <ChevronRight className="h-5 w-5 text-blue-600" />
          ) : (
            <ChevronLeft className="h-5 w-5 text-blue-600" />
          )}
        </div>

        {/* Left: Deployed tasks + Chat */}
        {!leftPanelHidden && (
          <div
            className="relative z-40 flex h-full shrink-0 flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
            style={{ width: leftPanelWidth }}
          >
            <div className="shrink-0 border-b border-[#E5E7EB] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#1F2933]">Deployed Tasks</h2>
            </div>
            <ScrollArea className="flex-1 p-3">
              {deployedTasks.length === 0 ? (
                <p className="text-xs text-gray-400">
                  No tasks deployed yet. Deploy from the Tasks panel.
                </p>
              ) : (
                <div className="space-y-2">
                  {deployedTasks.map(task => (
                    <div
                      key={task.id}
                      className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-gray-800">{task.title}</p>
                      <p className="text-xs text-gray-400">
                        Deployed {new Date(task.deployedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Chat */}
            <div className="shrink-0 border-t border-[#E5E7EB]">
              <div className="max-h-40 overflow-y-auto px-3 py-2">
                {chatMessages.length === 0 ? (
                  <p className="text-xs text-gray-400">No messages yet.</p>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div key={i} className="mb-1 text-xs">
                      <span className="font-medium text-blue-700">{msg.name ?? 'Student'}: </span>
                      <span className="text-gray-700">{msg.text}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2">
                <Input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendChat()
                    }
                  }}
                  className="h-8 text-xs"
                  placeholder="Message to students..."
                />
                <Button
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  disabled={!chatInput.trim() || !socket}
                  onClick={sendChat}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Resize handle */}
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

        {/* Center: Whiteboard / Classroom tabs */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={v => setActiveTab(v as 'whiteboard' | 'classroom')}
            className="flex h-full min-h-0 flex-1 flex-col"
          >
            <div className="flex shrink-0 items-start px-4 pt-0">
              <TabsList className="grid h-[48px] w-full grid-cols-2 gap-2 border-0 bg-transparent p-0 shadow-none">
                <TabsTrigger
                  value="classroom"
                  className="flex items-center justify-center gap-2 rounded-full border-0 px-4 py-2.5 text-sm font-semibold shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all data-[state=inactive]:bg-white data-[state=active]:bg-[linear-gradient(145deg,rgba(18,20,22,0.82),rgba(62,68,75,0.62))] data-[state=active]:text-white data-[state=inactive]:text-[#1F2933]"
                >
                  <BookOpen className="h-4 w-4" />
                  Classroom
                </TabsTrigger>
                <TabsTrigger
                  value="whiteboard"
                  className="flex items-center justify-center gap-2 rounded-full border-0 px-4 py-2.5 text-sm font-semibold shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all data-[state=inactive]:bg-white data-[state=active]:bg-[linear-gradient(145deg,rgba(18,20,22,0.82),rgba(62,68,75,0.62))] data-[state=active]:text-white data-[state=inactive]:text-[#1F2933]"
                >
                  <Monitor className="h-4 w-4" />
                  Whiteboard
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="shrink-0 px-4 pb-3" />

            <TabsContent
              value="classroom"
              padding="none"
              className="flex h-full min-h-0 flex-1 flex-col outline-none"
            >
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-blue-200 bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]">
                <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-center">
                  <span className="rounded-b-md bg-blue-500 px-3 py-0.5 text-[11px] font-medium text-white">
                    Live Classroom
                  </span>
                </div>
                <div className="flex flex-1 items-center justify-center p-6 pt-8">
                  <div className="text-center text-gray-400">
                    <BookOpen className="mx-auto mb-3 h-12 w-12 opacity-30" />
                    <p className="text-sm">
                      Deploy a task from the Tasks panel to display it here for students.
                    </p>
                    <p className="mt-1 text-xs text-gray-300">
                      Students see the active task in their classroom view.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="whiteboard"
              padding="none"
              className="flex h-full min-h-0 flex-1 flex-col outline-none"
            >
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-[#1e3a5f] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]">
                <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-center">
                  <span className="rounded-b-md bg-[#1e3a5f] px-3 py-0.5 text-[11px] font-medium text-white">
                    Tutor Board (broadcast to students)
                  </span>
                </div>
                <div className="flex-1 overflow-hidden pt-5">
                  <EnhancedWhiteboard
                    pages={whiteboardPages}
                    currentPageIndex={whiteboardPageIndex}
                    onPagesChange={setWhiteboardPages}
                    onPageIndexChange={setWhiteboardPageIndex}
                    socket={socket}
                    roomId={sessionId}
                    userId={authSession?.user?.id ?? undefined}
                    userName={authSession?.user?.name || 'Tutor'}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right panel: Participants / Tasks / Polls */}
        <div className="flex h-full w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]">
          <div className="shrink-0 border-b border-gray-200 px-4 py-3">
            <div className="flex w-full items-center gap-1 rounded-lg bg-gray-100 p-1">
              {(['participants', 'tasks', 'polls'] as const).map(tab => (
                <Button
                  key={tab}
                  variant="ghost"
                  size="sm"
                  onClick={() => setRightTab(tab)}
                  className={cn(
                    'h-7 flex-1 rounded-md px-2 text-xs font-medium capitalize transition-all',
                    rightTab === tab
                      ? 'bg-white text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.08)]'
                      : 'text-gray-500 hover:text-gray-900'
                  )}
                >
                  {tab === 'participants' ? (
                    <Users className="mr-1 h-3 w-3" />
                  ) : tab === 'tasks' ? (
                    <BookOpen className="mr-1 h-3 w-3" />
                  ) : (
                    <BarChart2 className="mr-1 h-3 w-3" />
                  )}
                  {tab}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {rightTab === 'participants' && (
              <div className="space-y-2">
                <p className="mb-2 text-xs font-medium text-gray-400">
                  {participants.length} connected
                </p>
                {participants.length === 0 ? (
                  <p className="text-xs text-gray-400">No students have joined yet.</p>
                ) : (
                  participants.map(p => (
                    <Card key={p.studentId} className="shadow-none">
                      <CardContent className="flex items-center gap-2 px-3 py-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                          {(p.name ?? p.email ?? '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">
                            {p.name ?? p.email ?? 'Student'}
                          </p>
                          {p.joinedAt && (
                            <p className="text-xs text-gray-400">
                              Joined {new Date(p.joinedAt).toLocaleTimeString()}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}

            {rightTab === 'tasks' && (
              <div className="space-y-2">
                <p className="mb-2 text-xs font-medium text-gray-400">
                  Select a task to deploy to students
                </p>
                {availableTasks.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    No tasks found for this course. Build tasks in the Course Builder.
                  </p>
                ) : (
                  availableTasks
                    .filter(t => t.status === 'published')
                    .map(task => (
                      <Card
                        key={task.taskId}
                        className="cursor-pointer shadow-none transition-shadow hover:shadow-sm"
                      >
                        <CardContent className="flex items-center justify-between gap-2 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-800">
                              {task.title}
                            </p>
                            <Badge variant="outline" className="mt-0.5 text-[10px]">
                              {task.type}
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 shrink-0 text-xs"
                            onClick={() => deployTask(task)}
                          >
                            Deploy
                          </Button>
                        </CardContent>
                      </Card>
                    ))
                )}
              </div>
            )}

            {rightTab === 'polls' && (
              <div className="space-y-4">
                <Card className="shadow-none">
                  <CardHeader className="px-3 py-2">
                    <CardTitle className="text-sm">Create Poll</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-3 pb-3">
                    <Input
                      placeholder="Poll question..."
                      value={pollQuestion}
                      onChange={e => setPollQuestion(e.target.value)}
                      className="h-8 text-sm"
                    />
                    {pollOptions.map((opt, i) => (
                      <Input
                        key={i}
                        placeholder={`Option ${i + 1}`}
                        value={opt}
                        onChange={e =>
                          setPollOptions(prev =>
                            prev.map((o, idx) => (idx === i ? e.target.value : o))
                          )
                        }
                        className="h-8 text-sm"
                      />
                    ))}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setPollOptions(prev => [...prev, ''])}
                        disabled={pollOptions.length >= 6}
                      >
                        + Option
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 flex-1 text-xs"
                        onClick={createPoll}
                        disabled={!pollQuestion.trim() || !socket}
                      >
                        Send Poll
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
