'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, Loader2, Bot } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { cn } from '@/lib/utils'
import { useAiAssistant } from '@/hooks/use-ai-assistant'
import type { CourseBuilderMode } from '@/lib/ai/guardrails'
import type { CourseBuilderContext } from '@/lib/ai/course-builder-assistant'

interface SessionInfo {
  id: string
  title: string
  scheduledAt: string
  status: string
}

interface AiAssistantPanelProps {
  mode?: CourseBuilderMode
  sessionId?: string | null
  sessionType?: string | null
  courseId?: string | null
  courseName?: string
  sessions?: SessionInfo[]
  studentsCount?: number
  liveSubmissions?: Array<{ taskId: string; studentId: string; submittedAt?: string | number }>
  context?: CourseBuilderContext
  /** Whether the AI Assistant tab is currently active — triggers the intro animation */
  isActive?: boolean
}

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  id: string
}

function modeGreeting(
  mode: CourseBuilderMode,
  context?: CourseBuilderContext,
  sessionType?: string | null
): string {
  const courseName = context?.courseName?.trim() || 'this course'
  const isDemo = sessionType === 'GO_LIVE_DEMO'

  switch (mode) {
    case 'first-course':
      return `Welcome! I'm here to help you build your first course, ${courseName}. Let's start with a clear goal and your first lesson.`
    case 'new-course':
      return `Let's build ${courseName}. I can suggest a structure, outline lessons, and help you add tasks and assessments.`
    case 'no-course':
      return `This course is empty. Let's add your first lesson and a task or assessment to get started.`
    case 'edit':
      return `You're editing ${courseName}. Ask me to refine lessons, tasks, or assessments.`
    case 'test':
      return `You're testing ${courseName}. I can review the task or assessment from a student perspective and suggest improvements.`
    case 'classroom':
      return isDemo
        ? `Demo class ready. Ask me about the demo content, student progress, or submission summaries.`
        : `Live session ready. Ask me about student progress, completion rates, or session summaries.`
    default:
      return `How can I help with ${courseName}?`
  }
}

export function AiAssistantPanel({
  mode = 'edit',
  sessionId,
  sessionType,
  courseId,
  courseName,
  sessions = [],
  studentsCount = 0,
  liveSubmissions = [],
  context,
  isActive = true,
}: AiAssistantPanelProps) {
  const [input, setInput] = useState('')
  const [introMessages, setIntroMessages] = useState<ChatMessage[]>([])
  const [isAnimating, setIsAnimating] = useState(false)
  const hasAnimatedRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isDemoSession = sessionType === 'GO_LIVE_DEMO'

  const {
    messages: assistantMessages,
    isLoading,
    sendMessage,
    resetMessages,
  } = useAiAssistant({
    mode,
    sessionId,
    sessionType,
    courseId,
    context,
  })

  // Build course info message blocks for classroom mode
  const buildCourseInfoMessages = useCallback((): string[] => {
    const blocks: string[] = []

    if (courseName) {
      blocks.push(`Course Name: ${courseName}`)
    }

    if (sessions.length > 0) {
      const sorted = [...sessions].sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      )

      if (!isDemoSession) {
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
    }

    blocks.push(`Students Enrolled: ${studentsCount}`)

    const totalSubmissions = liveSubmissions.length
    const completedSubmissions = liveSubmissions.filter(s => s.submittedAt).length
    const completionRate =
      totalSubmissions > 0 ? Math.round((completedSubmissions / totalSubmissions) * 100) : 0
    blocks.push(`Task Completion Rate: ${completionRate}%`)

    return blocks
  }, [courseName, sessions, studentsCount, liveSubmissions, isDemoSession])

  const introTextBlocks = useMemo(() => {
    if (mode === 'classroom') {
      return buildCourseInfoMessages()
    }
    return [modeGreeting(mode, context, sessionType)]
  }, [mode, context, sessionType, buildCourseInfoMessages])

  // Animate intro messages in one at a time from the bottom
  useEffect(() => {
    if (!isActive || hasAnimatedRef.current) return

    const infoBlocks = introTextBlocks
    if (infoBlocks.length === 0) return

    hasAnimatedRef.current = true
    setIsAnimating(true)

    // Add messages one at a time with staggered delay
    infoBlocks.forEach((text, index) => {
      setTimeout(() => {
        setIntroMessages(prev => [
          ...prev,
          { role: 'assistant', text, id: `info-${index}-${Date.now()}` },
        ])

        // Clear animating flag after last message
        if (index === infoBlocks.length - 1) {
          setTimeout(() => setIsAnimating(false), 500)
        }
      }, index * 400)
    })
  }, [isActive, introTextBlocks])

  // Reset intro animation when mode/course/session changes so the greeting stays relevant
  useEffect(() => {
    hasAnimatedRef.current = false
    setIntroMessages([])
    resetMessages()
  }, [mode, courseId, sessionType, resetMessages])

  // Scroll to bottom whenever new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [introMessages, assistantMessages])

  const handleSend = async () => {
    if (!input.trim()) return
    const text = input.trim()
    setInput('')
    await sendMessage(text)
  }

  const displayMessages: ChatMessage[] = [
    ...introMessages,
    ...assistantMessages.map((m, index) => ({
      role: m.role,
      text: m.content,
      id: `assistant-msg-${index}-${m.role}`,
    })),
  ]

  const isBusy = isAnimating || isLoading

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Chat messages — scrollable area */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-white/80 p-3 shadow-sm">
        {displayMessages.length === 0 && !isBusy ? (
          <p className="text-sm text-gray-400">Ask the AI Assistant anything.</p>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {displayMessages.map(m => (
                <div
                  key={m.id}
                  className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {m.role === 'assistant' && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center self-end rounded-full bg-orange-100 text-orange-700">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <motion.div
                    initial={{ opacity: 0, y: 60, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    style={{ originY: 1 }}
                    className={`max-w-[80%] whitespace-pre-line rounded-lg px-3 py-2 text-sm ${
                      m.role === 'user' ? 'bg-blue-50 text-blue-900' : 'bg-gray-50 text-gray-900'
                    }`}
                  >
                    {m.text}
                  </motion.div>
                </div>
              ))}
            </AnimatePresence>
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                AI Assistant is thinking…
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input — fixed at bottom */}
      <div className="shrink-0 rounded-xl bg-white p-2 shadow-sm">
        <div className="relative">
          <AutoTextarea
            placeholder="Ask the AI Assistant..."
            className="min-h-[60px] border-0 bg-transparent pr-10 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            value={input}
            disabled={isBusy}
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
            className="absolute bottom-2 right-2 h-8 w-8 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={handleSend}
            disabled={isBusy || !input.trim()}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
