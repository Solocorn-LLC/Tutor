'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
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
  /** Whether the Analytics tab is currently active — triggers the intro animation */
  isActive?: boolean
}

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  id: string
}

export function AiAssistantPanel({
  sessionId,
  courseName,
  sessions = [],
  studentsCount = 0,
  liveSubmissions = [],
  isActive = true,
}: AiAssistantPanelProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isAnimating, setIsAnimating] = useState(false)
  const hasAnimatedRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Build course info message blocks
  const buildCourseInfoMessages = useCallback((): string[] => {
    const blocks: string[] = []

    if (courseName) {
      blocks.push(`Course Name: ${courseName}`)
    }

    if (sessions.length > 0) {
      const sorted = [...sessions].sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      )
      const firstSession = sorted[0]
      if (firstSession?.scheduledAt) {
        const date = new Date(firstSession.scheduledAt)
        blocks.push(
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
        blocks.push(`Schedule:\n${scheduleItems}`)
      }

      const now = Date.now()
      const upcoming = sorted.filter(s => new Date(s.scheduledAt).getTime() > now)
      if (upcoming.length > 0) {
        const next = upcoming[0]
        const date = new Date(next.scheduledAt)
        blocks.push(
          `Next Session: ${next.title} — ${date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}`
        )
      } else {
        blocks.push('Next Session: No upcoming sessions')
      }
    }

    blocks.push(`Students Enrolled: ${studentsCount}`)

    const totalSubmissions = liveSubmissions.length
    const completedSubmissions = liveSubmissions.filter(s => s.submittedAt).length
    const completionRate =
      totalSubmissions > 0 ? Math.round((completedSubmissions / totalSubmissions) * 100) : 0
    blocks.push(`Task Completion Rate: ${completionRate}%`)

    return blocks
  }, [courseName, sessions, studentsCount, liveSubmissions])

  // Animate course info messages in one at a time from the bottom
  useEffect(() => {
    if (!isActive || hasAnimatedRef.current) return

    const infoBlocks = buildCourseInfoMessages()
    if (infoBlocks.length === 0) return

    hasAnimatedRef.current = true
    setIsAnimating(true)

    // Add messages one at a time with staggered delay
    infoBlocks.forEach((text, index) => {
      setTimeout(() => {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', text, id: `info-${index}-${Date.now()}` },
        ])
        // Scroll to bottom after each message
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 50)

        // Clear animating flag after last message
        if (index === infoBlocks.length - 1) {
          setTimeout(() => setIsAnimating(false), 500)
        }
      }, index * 400)
    })
  }, [isActive, buildCourseInfoMessages])

  const handleSend = () => {
    if (!input.trim()) return
    const userMsg: ChatMessage = { role: 'user', text: input.trim(), id: `user-${Date.now()}` }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    // TODO: wire to AI backend — for now simulate assistant response
    setTimeout(() => {
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        text: 'I received your message. AI integration coming soon.',
        id: `assistant-${Date.now()}`,
      }
      setMessages(prev => [...prev, assistantMsg])
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 50)
    }, 1000)
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Chat messages — scrollable area */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white/80 p-3 shadow-sm">
        {messages.length === 0 && !isAnimating ? (
          <p className="text-sm text-gray-400">Ask the AI Assistant anything.</p>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {messages.map(m => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 60 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className={`max-w-[90%] whitespace-pre-line rounded-lg px-3 py-2 text-sm ${
                    m.role === 'user'
                      ? 'ml-auto bg-blue-50 text-blue-900'
                      : 'mr-auto bg-gray-50 text-gray-900'
                  }`}
                >
                  {m.text}
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input — fixed at bottom */}
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
