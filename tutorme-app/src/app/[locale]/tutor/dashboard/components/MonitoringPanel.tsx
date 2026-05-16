import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { HandHeart, MonitorPlay, Sparkles, Send, Loader2, X } from 'lucide-react'
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

type MonitoringPanelProps = {
  socket: Socket
  sessionId: string
  tutorId?: string // Optional: exclude tutor from participant list
  students?: any[] // Optional: pass the room's student list if available
  selectedStudentId?: string | null
  onNavigateToWhiteboard?: (studentId: string, studentName: string) => void
  onOpenWhiteboard?: (studentId: string, studentName: string) => void
}

export function MonitoringPanel({
  socket,
  sessionId,
  tutorId,
  students,
  selectedStudentId,
  onNavigateToWhiteboard,
  onOpenWhiteboard,
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
  const rosterStudents: { id: string; name: string; status: string | null }[] = (students || [])
    .map((s: any) => ({
      id: (s as any)?.id ?? (s as any)?.studentId ?? (s as any)?.userId,
      name: (s as any)?.name ?? (s as any)?.studentName ?? 'Student',
      status: (s as any)?.status ?? null,
    }))
    .filter((s: any) => !!s.id && s.id !== tutorId)

  const displayStudents =
    rosterStudents.length > 0
      ? rosterStudents
      : activeStudents.map(s => ({
          id: s.studentId,
          name: s.studentName,
          status: null as string | null,
        }))

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

  return (
    <div className="animate-in fade-in relative h-full w-full duration-300">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {displayStudents.map((student: any) => {
          const stateUpdate = studentStates[student.id]
          const activeTab = stateUpdate?.payload?.activeTab
          const activeTaskId = stateUpdate?.payload?.activeTaskId
          const isWhiteboard = activeTab === 'my-board' || activeTab === 'tutor-board'
          const isOnline = !!stateUpdate || student.status === 'online'

          return (
            <Card
              key={student.id}
              onClick={() => onNavigateToWhiteboard?.(student.id, student.name)}
              className={cn(
                'cursor-pointer overflow-hidden border-slate-200 bg-white/50 backdrop-blur-sm transition-all hover:shadow-md',
                selectedStudentId === student.id && 'ring-2 ring-indigo-200'
              )}
            >
              <CardHeader className="border-b bg-slate-50/50 px-4 py-3">
                <CardTitle className="flex min-w-0 items-center justify-between gap-2 text-base">
                  <span className="min-w-0 truncate font-semibold text-slate-800">
                    {student.name}
                  </span>
                  <span
                    className={cn(
                      'flex h-2 w-2 rounded-full',
                      isOnline ? 'animate-pulse bg-green-500' : 'bg-slate-300'
                    )}
                    title="Live"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-4">
                  <div className="rounded-lg bg-slate-50 p-3 text-sm">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <span className="flex-shrink-0 text-slate-500">Current View:</span>
                      <span className="min-w-0 font-medium capitalize text-indigo-600">
                        {activeTab?.replace('-', ' ') || 'No data yet'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <span className="flex-shrink-0 text-slate-500">Activity:</span>
                      <span
                        className="min-w-0 max-w-[120px] truncate font-medium text-slate-700"
                        title={activeTaskId || 'None'}
                      >
                        {isWhiteboard
                          ? 'Drawing'
                          : activeTaskId
                            ? 'Reading Task'
                            : isOnline
                              ? 'Idle'
                              : 'Offline'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={e => {
                        e.stopPropagation()
                        onOpenWhiteboard?.(student.id, student.name)
                      }}
                      variant="outline"
                      className="min-w-[100px] flex-1 gap-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                    >
                      <MonitorPlay className="h-4 w-4 flex-shrink-0" />
                      Whiteboard
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
