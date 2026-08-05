import { useState, useEffect, useRef, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  HandHeart,
  MonitorPlay,
  Sparkles,
  Send,
  Loader2,
  X,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { Socket } from 'socket.io-client'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type StudentState = {
  activeTab?: string
  activeTaskId?: string | null
}

type StudentUpdate = {
  studentId: string
  studentName: string
  payload: StudentState
}

type LiveTaskLite = { id?: string; completedBy?: string[] }

type MonitoringPanelProps = {
  socket: Socket
  sessionId: string
  tutorId?: string // Optional: exclude tutor from participant list
  students?: any[] // Optional: pass the room's student list if available
  liveTasks?: LiveTaskLite[] // Deployed tasks, for per-student completion progress
  selectedStudentIds?: string[] // Students currently open in the multi-whiteboard view
  onToggleWhiteboardSelection?: (studentId: string, studentName: string) => void
  onOpenWhiteboards?: (studentId: string, studentName: string) => void
}

export function MonitoringPanel({
  socket,
  sessionId,
  tutorId,
  students,
  liveTasks,
  selectedStudentIds = [],
  onToggleWhiteboardSelection,
  onOpenWhiteboards,
}: MonitoringPanelProps) {
  const [studentStates, setStudentStates] = useState<Record<string, StudentUpdate>>({})

  // Solocorn Assistant State
  const [isAIOpen, setIsAIOpen] = useState(false)
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>(
    []
  )
  const [aiInput, setAiInput] = useState('')
  const [isAILoading, setIsAILoading] = useState(false)
  const [isTranscriptionStarting, setIsTranscriptionStarting] = useState(false)
  const [liveSummary, setLiveSummary] = useState<string | null>(null)
  const [liveTranscriptStatus, setLiveTranscriptStatus] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Roster controls — keep the tutor from being overwhelmed by hundreds of cards.
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'attention' | 'on_track' | 'idle'>('all')
  const [sortBy, setSortBy] = useState<'attention' | 'name' | 'engagement' | 'understanding'>(
    'attention'
  )
  const [page, setPage] = useState(0)
  const [observeId, setObserveId] = useState<string | null>(null)
  const PAGE_SIZE = 24
  // Reset to the first page whenever the filter/search/sort changes.
  useEffect(() => {
    setPage(0)
  }, [query, statusFilter, sortBy])

  useEffect(() => {
    if (!socket) return
    const handleStudentStateUpdate = (update: StudentUpdate) => {
      setStudentStates(prev => ({
        ...prev,
        [update.studentId]: update,
      }))
    }

    socket.on('student:state_update', handleStudentStateUpdate)
    return () => {
      socket.off('student:state_update', handleStudentStateUpdate)
    }
  }, [socket])

  // Per-student comprehension from real task-submission correctness. Polled, and
  // refetched when a student completes a task (scores arrive as work is graded).
  const [comprehension, setComprehension] = useState<
    Record<
      string,
      { understanding: number | null; scored: number; total: number; needsReview?: number }
    >
  >({})
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/tutor/live-sessions/${sessionId}/comprehension`, {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        if (!cancelled && data?.comprehension) setComprehension(data.comprehension)
      } catch {
        // ignore
      }
    }
    load()
    const id = setInterval(load, 20_000)
    // The completion broadcast races the server-side live auto-grade write, so
    // refetch immediately and again shortly after the score has landed.
    const timers: ReturnType<typeof setTimeout>[] = []
    const onCompleted = () => {
      load()
      timers.push(setTimeout(load, 2_500))
    }
    socket?.on('task:completed', onCompleted)
    return () => {
      cancelled = true
      clearInterval(id)
      timers.forEach(clearTimeout)
      socket?.off('task:completed', onCompleted)
    }
  }, [sessionId, socket])

  const handleSendHelp = (studentId: string, studentName: string, customMessage?: string) => {
    if (!socket) {
      toast.error('Socket not connected')
      return
    }
    const msg =
      customMessage ||
      `Hi ${studentName}, I noticed you might be stuck. Do you need any help with this step?`
    socket.emit('tutor:direct_message', {
      roomId: sessionId,
      studentId,
      message: msg,
    })
    toast.success(`Message sent to ${studentName}`)
  }

  const handleAIChat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!aiInput.trim() || isAILoading) return

    const userMessage = aiInput.trim()
    setAiInput('')
    setAiMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsAILoading(true)

    try {
      // Build context of what students are doing right now
      const context = Object.values(studentStates).map(s => ({
        name: s.studentName,
        view: s.payload.activeTab,
        taskId: s.payload.activeTaskId,
      }))

      const res = await fetch('/api/ai/monitor-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          context: {
            activeStudents: context,
            totalConnected: context.length,
          },
        }),
      })

      if (!res.ok) throw new Error('Failed to get AI response')
      const data = await res.json()

      setAiMessages(prev => [...prev, { role: 'assistant', content: data.response }])
    } catch (err) {
      toast.error('Solocorn Assistant encountered an error.')
      setAiMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error connecting to the brain.' },
      ])
    } finally {
      setIsAILoading(false)
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      }, 100)
    }
  }

  const refreshLiveSummary = async () => {
    if (!sessionId) return
    try {
      const res = await fetch(`/api/tutor/live-sessions/${sessionId}/transcription/status`, {
        method: 'GET',
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = await res.json()
      const artifact = data?.artifact
      setLiveSummary(artifact?.summary || null)
      setLiveTranscriptStatus(artifact?.status || null)
    } catch {}
  }

  const startLiveTranscription = async () => {
    if (!sessionId || isTranscriptionStarting) return
    setIsTranscriptionStarting(true)
    try {
      const res = await fetch(`/api/tutor/live-sessions/${sessionId}/transcription/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.message || 'Failed to start transcription')
        return
      }
      toast.success('Transcription started')
      void refreshLiveSummary()
    } catch {
      toast.error('Failed to start transcription')
    } finally {
      setIsTranscriptionStarting(false)
    }
  }

  useEffect(() => {
    if (!isAIOpen) return
    void refreshLiveSummary()
    const id = setInterval(() => {
      void refreshLiveSummary()
    }, 30_000)
    return () => clearInterval(id)
  }, [isAIOpen, sessionId])

  const activeStudents = Object.values(studentStates)
  const num = (v: unknown): number | null => (typeof v === 'number' && !Number.isNaN(v) ? v : null)
  const totalTasks = Array.isArray(liveTasks) ? liveTasks.length : 0
  const completedTaskCount = (id: string) =>
    Array.isArray(liveTasks)
      ? liveTasks.filter(t => Array.isArray(t.completedBy) && t.completedBy.includes(id)).length
      : 0
  const minutesSince = (joinedAt: unknown): number | null => {
    const t =
      typeof joinedAt === 'number'
        ? joinedAt
        : joinedAt
          ? new Date(joinedAt as string).getTime()
          : NaN
    if (Number.isNaN(t)) return null
    return Math.max(0, Math.round((Date.now() - t) / 60000))
  }

  type RosterStudent = {
    id: string
    name: string
    status: string | null
    engagement: number | null
    understanding: number | null
    frustration: number | null
    joinedAt: unknown
    currentActivity: string | null
  }
  const rosterStudents: RosterStudent[] = (students || [])
    .map((s: any) => ({
      id: s?.id ?? s?.studentId ?? s?.userId,
      name: s?.name ?? s?.studentName ?? 'Student',
      status: s?.status ?? null,
      engagement: num(s?.engagement) ?? num(s?.engagementScore),
      understanding: num(s?.understanding),
      frustration: num(s?.frustration),
      joinedAt: s?.joinedAt ?? null,
      currentActivity: typeof s?.currentActivity === 'string' ? s.currentActivity : null,
    }))
    .filter((s: RosterStudent) => !!s.id && s.id !== tutorId)

  const displayStudents: RosterStudent[] =
    rosterStudents.length > 0
      ? rosterStudents
      : activeStudents.map(s => ({
          id: s.studentId,
          name: s.studentName,
          status: null,
          engagement: null,
          understanding: null,
          frustration: null,
          joinedAt: null,
          currentActivity: null,
        }))

  // Map the server's student status to a small colored badge.
  const statusBadge = (status: string | null): { label: string; cls: string } | null => {
    switch (status) {
      case 'needs_help':
        return { label: 'Needs help', cls: 'bg-amber-100 text-amber-700' }
      case 'struggling':
        return { label: 'Struggling', cls: 'bg-red-100 text-red-700' }
      case 'idle':
        return { label: 'Idle', cls: 'bg-slate-100 text-slate-500' }
      case 'on_track':
        return { label: 'On track', cls: 'bg-emerald-100 text-emerald-700' }
      default:
        return null
    }
  }

  // Attention-first ordering: struggling and needs-help float to the top so a tutor
  // sees who needs them first, even with hundreds of students.
  const attentionRank = (status: string | null): number => {
    switch (status) {
      case 'struggling':
        return 0
      case 'needs_help':
        return 1
      case 'idle':
        return 3
      case 'on_track':
        return 4
      default:
        return 2
    }
  }
  const needsAttention = (status: string | null) =>
    status === 'struggling' || status === 'needs_help'

  const attentionCount = displayStudents.filter(s => needsAttention(s.status)).length

  const visibleStudents = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = displayStudents.filter(s => {
      if (q && !s.name.toLowerCase().includes(q)) return false
      if (statusFilter === 'attention') return needsAttention(s.status)
      if (statusFilter === 'on_track') return s.status === 'on_track'
      if (statusFilter === 'idle')
        return s.status === 'idle' || s.status === 'offline' || s.status == null
      return true
    })
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'engagement':
          return (b.engagement ?? -1) - (a.engagement ?? -1)
        case 'understanding':
          return (b.understanding ?? -1) - (a.understanding ?? -1)
        case 'attention':
        default:
          return attentionRank(a.status) - attentionRank(b.status) || a.name.localeCompare(b.name)
      }
    })
    return filtered
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayStudents, query, statusFilter, sortBy])

  const filteredCount = visibleStudents.length
  const pageCount = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageStudents = visibleStudents.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const observedStudent = observeId ? displayStudents.find(s => s.id === observeId) || null : null

  if (displayStudents.length === 0) {
    return (
      <div className="animate-in fade-in zoom-in-95 flex h-full flex-col items-center justify-center space-y-4 p-8 text-center duration-300">
        <div className="rounded-full bg-slate-100 p-4">
          <MonitorPlay className="h-8 w-8 text-slate-400" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900">Waiting for Students</h3>
          <p className="max-w-sm text-sm text-slate-500">
            Students will appear here once they join the session and start sharing their screen.
          </p>
        </div>
      </div>
    )
  }

  const filterChips: { key: typeof statusFilter; label: string }[] = [
    { key: 'all', label: `All (${displayStudents.length})` },
    { key: 'attention', label: `Needs attention (${attentionCount})` },
    { key: 'on_track', label: 'On track' },
    { key: 'idle', label: 'Idle' },
  ]

  return (
    <div className="animate-in fade-in relative h-full w-full duration-300">
      {/* Roster controls: search + status filter + sort. Keeps large classes manageable. */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search students…"
              className="h-9 pl-8 text-sm text-slate-900"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filterChips.map(chip => (
              <button
                key={chip.key}
                onClick={() => setStatusFilter(chip.key)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  statusFilter === chip.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Sort</label>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <option value="attention">Needs attention first</option>
            <option value="name">Name (A–Z)</option>
            <option value="engagement">Engagement</option>
            <option value="understanding">Understanding</option>
          </select>
        </div>
      </div>

      {/* Summary line */}
      <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          Showing {pageStudents.length} of {filteredCount}
          {filteredCount !== displayStudents.length ? ` (of ${displayStudents.length})` : ''}{' '}
          students
        </span>
        {attentionCount > 0 && (
          <span className="font-medium text-amber-600">{attentionCount} need attention</span>
        )}
      </div>

      {filteredCount === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 py-12 text-center">
          <MonitorPlay className="h-6 w-6 text-slate-300" />
          <p className="text-sm text-slate-500">No students match your search or filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pageStudents.map((student: RosterStudent) => {
            const stateUpdate = studentStates[student.id]
            const activeTab = stateUpdate?.payload?.activeTab
            const activeTaskId = stateUpdate?.payload?.activeTaskId
            const isWhiteboard = activeTab === 'my-board' || activeTab === 'tutor-board'
            // The roster only contains currently-present students (departed ones
            // are removed), so anyone here is online unless explicitly 'offline'.
            const isOnline = student.status !== 'offline'
            const isViewing = selectedStudentIds.includes(student.id)
            const badge = statusBadge(student.status)
            const activityLabel =
              student.currentActivity ||
              (isWhiteboard
                ? 'Drawing'
                : activeTaskId
                  ? 'Working on a task'
                  : isOnline
                    ? 'Idle'
                    : 'Offline')
            const mins = minutesSince(student.joinedAt)
            const done = completedTaskCount(student.id)

            return (
              <Card
                key={student.id}
                onClick={() => {
                  socket.emit('whiteboard:state:request', {
                    roomId: sessionId,
                    target: 'studentBoard',
                    studentId: student.id,
                  })
                  onToggleWhiteboardSelection?.(student.id, student.name)
                }}
                className={cn(
                  'cursor-pointer overflow-hidden border-slate-200 bg-white/50 backdrop-blur-sm transition-all hover:shadow-md',
                  isViewing && 'ring-2 ring-indigo-300'
                )}
              >
                <CardHeader className="border-b bg-slate-50/50 px-4 py-3">
                  <CardTitle className="flex min-w-0 items-center justify-between gap-2 text-base">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          'flex h-2 w-2 flex-shrink-0 rounded-full',
                          isOnline ? 'animate-pulse bg-green-500' : 'bg-slate-300'
                        )}
                        title={isOnline ? 'Online' : 'Offline'}
                      />
                      <span className="min-w-0 truncate font-semibold text-slate-800">
                        {student.name}
                      </span>
                    </span>
                    {badge && (
                      <span
                        className={cn(
                          'flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          badge.cls
                        )}
                      >
                        {badge.label}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                      <Row
                        label="Current view"
                        value={activeTab?.replace('-', ' ') || '—'}
                        valueClass="capitalize text-indigo-600"
                      />
                      <Row
                        label="Activity"
                        value={activityLabel}
                        title={activeTaskId || undefined}
                      />
                      <Row label="In session" value={mins != null ? `${mins} min` : '—'} />
                      <Row
                        label="Tasks done"
                        value={totalTasks > 0 ? `${done}/${totalTasks}` : '—'}
                      />
                    </div>

                    {student.engagement != null && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>Engagement</span>
                          <span className="font-medium text-slate-700">
                            {Math.round(student.engagement)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              student.engagement >= 66
                                ? 'bg-emerald-500'
                                : student.engagement >= 33
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                            )}
                            style={{
                              width: `${Math.min(100, Math.max(0, student.engagement))}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {(() => {
                      const compr = comprehension[student.id]
                      const u = compr?.understanding
                      const needsReview = compr?.needsReview ?? 0
                      const reviewNote =
                        needsReview > 0 ? (
                          <div className="text-[11px] font-medium text-amber-600">
                            {needsReview} answer{needsReview === 1 ? '' : 's'} need review
                          </div>
                        ) : null
                      if (u == null) {
                        if (needsReview > 0) return reviewNote
                        return compr && compr.total > 0 ? (
                          <div className="text-[11px] text-slate-400">
                            Understanding: awaiting grading
                          </div>
                        ) : null
                      }
                      return (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Understanding{compr ? ` (${compr.scored} graded)` : ''}</span>
                            <span className="font-medium text-slate-700">{u}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                u >= 66 ? 'bg-emerald-500' : u >= 33 ? 'bg-amber-500' : 'bg-red-500'
                              )}
                              style={{ width: `${Math.min(100, Math.max(0, u))}%` }}
                            />
                          </div>
                          {reviewNote}
                        </div>
                      )
                    })()}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={e => {
                          e.stopPropagation()
                          socket.emit('whiteboard:state:request', {
                            roomId: sessionId,
                            target: 'studentBoard',
                            studentId: student.id,
                          })
                          onOpenWhiteboards?.(student.id, student.name)
                        }}
                        variant={isViewing ? 'default' : 'outline'}
                        className={cn(
                          'min-w-[110px] flex-1 gap-2',
                          isViewing
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                        )}
                      >
                        <MonitorPlay className="h-4 w-4 flex-shrink-0" />
                        {isViewing ? 'Viewing' : 'View board'}
                      </Button>
                      <Button
                        onClick={e => {
                          e.stopPropagation()
                          setObserveId(student.id)
                        }}
                        variant="outline"
                        className="min-w-[90px] flex-1 gap-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                        title="Enter this student's classroom read-only"
                      >
                        <Eye className="h-4 w-4 flex-shrink-0" />
                        Observe
                      </Button>
                      <Button
                        onClick={e => {
                          e.stopPropagation()
                          handleSendHelp(student.id, student.name)
                        }}
                        variant="outline"
                        className="min-w-[80px] flex-1 gap-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        <HandHeart className="h-4 w-4 flex-shrink-0" />
                        Help
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Pagination — only render one page of cards at a time so hundreds of students
          never mount at once. */}
      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <span className="text-xs text-slate-500">
            Page {safePage + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            className="gap-1"
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Observe drawer — read-only spectator view of one student. */}
      {observedStudent &&
        (() => {
          const st = studentStates[observedStudent.id]
          const tab = st?.payload?.activeTab
          const taskId = st?.payload?.activeTaskId
          const online = observedStudent.status !== 'offline'
          const mins = minutesSince(observedStudent.joinedAt)
          const done = completedTaskCount(observedStudent.id)
          const compr = comprehension[observedStudent.id]
          const metric = (label: string, value: string) => (
            <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-500">{label}</span>
              <span className="font-medium text-slate-800">{value}</span>
            </div>
          )
          return (
            <div
              className="animate-in fade-in fixed inset-0 z-[60] flex justify-end bg-black/30 duration-200"
              onClick={() => setObserveId(null)}
            >
              <div
                className="animate-in slide-in-from-right flex h-full w-full max-w-sm flex-col bg-white shadow-2xl duration-200"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-indigo-600" />
                    <span className="font-semibold text-slate-900">
                      Observing {observedStudent.name}
                    </span>
                  </div>
                  <button
                    onClick={() => setObserveId(null)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <ScrollArea className="flex-1">
                  <div className="space-y-3 p-4">
                    <div className="rounded-md border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-700">
                      Read-only — the student is not notified and your view does not interfere with
                      their work.
                    </div>
                    {metric('Status', online ? 'Online' : 'Offline')}
                    {metric('Current view', tab ? tab.replace('-', ' ') : '—')}
                    {metric(
                      'Activity',
                      observedStudent.currentActivity ||
                        (taskId ? 'Working on a task' : online ? 'Idle' : 'Offline')
                    )}
                    {metric('In session', mins != null ? `${mins} min` : '—')}
                    {metric('Tasks done', totalTasks > 0 ? `${done}/${totalTasks}` : '—')}
                    {observedStudent.engagement != null &&
                      metric('Engagement', `${observedStudent.engagement}%`)}
                    {compr?.understanding != null &&
                      metric('Understanding', `${Math.round(compr.understanding)}%`)}
                    <Button
                      onClick={() => {
                        socket.emit('whiteboard:state:request', {
                          roomId: sessionId,
                          target: 'studentBoard',
                          studentId: observedStudent.id,
                        })
                        onOpenWhiteboards?.(observedStudent.id, observedStudent.name)
                        setObserveId(null)
                      }}
                      className="w-full gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      <MonitorPlay className="h-4 w-4" /> Open their board
                    </Button>
                  </div>
                </ScrollArea>
              </div>
            </div>
          )
        })()}

      {/* Solocorn Assistant Floating Widget */}
      <div
        className={cn(
          'fixed bottom-24 right-6 z-50 flex flex-col items-end transition-all duration-300',
          isAIOpen ? 'w-[360px]' : 'w-auto'
        )}
      >
        {isAIOpen && (
          <Card className="animate-in slide-in-from-bottom-4 mb-4 flex h-[480px] w-full flex-col overflow-hidden border-indigo-100 shadow-2xl">
            <CardHeader className="border-b bg-gradient-to-r from-indigo-500 to-purple-600 p-3 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-100" />
                  <CardTitle className="text-sm font-medium">Solocorn Assistant</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-indigo-100 hover:bg-white/20 hover:text-white"
                  onClick={() => setIsAIOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="flex flex-col space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Live Transcript
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {liveTranscriptStatus ? `Status: ${liveTranscriptStatus}` : 'Not started'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={startLiveTranscription}
                        disabled={isTranscriptionStarting}
                      >
                        {isTranscriptionStarting ? 'Starting…' : 'Start'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={refreshLiveSummary}
                      >
                        Refresh
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                    {liveSummary || 'Summary will appear here once transcript text is available.'}
                  </div>
                </div>

                {aiMessages.length === 0 ? (
                  <div className="mt-4 space-y-2 text-center text-sm text-slate-500">
                    <p>Hi! I'm monitoring the classroom.</p>
                    <p>
                      Ask me to analyze what students are doing, or ask me to draft a personalized
                      message for a student!
                    </p>
                  </div>
                ) : (
                  aiMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                        msg.role === 'user'
                          ? 'self-end rounded-br-sm bg-indigo-100 text-indigo-900'
                          : 'self-start rounded-bl-sm bg-slate-100 text-slate-800'
                      )}
                    >
                      {msg.content}
                    </div>
                  ))
                )}
                {isAILoading && (
                  <div className="self-start rounded-xl rounded-bl-sm bg-slate-100 px-3 py-2 text-slate-800">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="border-t bg-slate-50 p-3">
              <form onSubmit={handleAIChat} className="flex gap-2">
                <Input
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  placeholder="Ask for an analysis or a message..."
                  className="h-9 bg-white text-sm focus-visible:ring-indigo-500"
                  disabled={isAILoading}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-9 w-9 bg-indigo-600 hover:bg-indigo-700"
                  disabled={isAILoading || !aiInput.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </Card>
        )}

        <Button
          onClick={() => setIsAIOpen(!isAIOpen)}
          size="icon"
          className="h-14 w-14 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 shadow-xl transition-all hover:scale-105 hover:shadow-indigo-500/25"
        >
          <Sparkles className="h-6 w-6 text-white" />
        </Button>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  valueClass,
  title,
}: {
  label: string
  value: string
  valueClass?: string
  title?: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
      <span className="flex-shrink-0 text-slate-500">{label}:</span>
      <span
        className={cn('min-w-0 max-w-[150px] truncate font-medium text-slate-700', valueClass)}
        title={title}
      >
        {value}
      </span>
    </div>
  )
}
