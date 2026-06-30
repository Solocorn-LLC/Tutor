'use client'

import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'

interface SessionInfo {
  id: string
  title: string
  scheduledAt: string
  status: string
}

interface AiAssistantPanelProps {
  sessionId?: string | null
  courseName?: string
  sessions?: SessionInfo[]
  studentsCount?: number
  liveSubmissions?: Array<{ taskId: string; studentId: string; submittedAt?: string | number }>
}

export function AiAssistantPanel({
  sessionId,
  courseName,
  sessions = [],
  studentsCount = 0,
  liveSubmissions = [],
}: AiAssistantPanelProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([])
  const hasLoadedRef = useRef(false)

  // Load course data once on mount
  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    const lines: string[] = []

    if (courseName) {
      lines.push(`Course Name: ${courseName}`)
    }

    // Commencement Date - first session date
    if (sessions.length > 0) {
      const sorted = [...sessions].sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      )
      const firstSession = sorted[0]
      if (firstSession?.scheduledAt) {
        const date = new Date(firstSession.scheduledAt)
        lines.push(
          `Commencement Date: ${date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}`
        )
      }

      // Schedule - list all sessions
      const scheduleItems = sorted
        .map(s => {
          const date = new Date(s.scheduledAt)
          return `  • ${s.title} — ${date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })} (${s.status})`
        })
        .join('\n')
      if (scheduleItems) {
        lines.push(`Schedule:\n${scheduleItems}`)
      }

      // Next Session - upcoming session
      const now = Date.now()
      const upcoming = sorted.filter(s => new Date(s.scheduledAt).getTime() > now)
      if (upcoming.length > 0) {
        const next = upcoming[0]
        const date = new Date(next.scheduledAt)
        lines.push(
          `Next Session: ${next.title} — ${date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}`
        )
      } else {
        lines.push('Next Session: No upcoming sessions')
      }
    }

    // Students Enrolled
    lines.push(`Students Enrolled: ${studentsCount}`)

    // Task Completion Rate
    const totalSubmissions = liveSubmissions.length
    const completedSubmissions = liveSubmissions.filter(s => s.submittedAt).length
    const completionRate =
      totalSubmissions > 0 ? Math.round((completedSubmissions / totalSubmissions) * 100) : 0
    lines.push(`Task Completion Rate: ${completionRate}%`)

    if (lines.length > 0) {
      setMessages([{ role: 'assistant', text: lines.join('\n\n') }])
    }
  }, [courseName, sessions, studentsCount, liveSubmissions])

  const handleSend = () => {
    if (!input.trim()) return
    setMessages(prev => [...prev, { role: 'user', text: input.trim() }])
    setInput('')
    // TODO: wire to AI backend
  }

  return (
    <div className="flex flex-1 flex-col gap-3 px-1 pb-0">
      {/* Chat display */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white/80 p-3 shadow-sm">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-400">Ask the AI Assistant anything.</p>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[90%] whitespace-pre-line rounded-lg px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'ml-auto bg-blue-50 text-blue-900'
                    : 'mr-auto bg-gray-50 text-gray-900'
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
        <div className="relative">
          <AutoTextarea
            placeholder="Ask the AI Assistant..."
            className="min-h-[60px] border-0 bg-transparent pr-10 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <Button
            size="icon"
            className="absolute bottom-2 right-2 h-8 w-8 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            onClick={handleSend}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
