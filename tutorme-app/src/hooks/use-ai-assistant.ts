'use client'

import { useCallback, useState } from 'react'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { toast } from 'sonner'
import type { CourseBuilderMode } from '@/lib/ai/guardrails'
import type { CourseBuilderContext } from '@/lib/ai/course-builder-assistant'

export interface AiAssistantMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface UseAiAssistantOptions {
  mode: CourseBuilderMode
  sessionId?: string | null
  sessionType?: string | null
  courseId?: string | null
  context?: CourseBuilderContext
}

export interface UseAiAssistantReturn {
  messages: AiAssistantMessage[]
  isLoading: boolean
  error: string | null
  sendMessage: (text: string) => Promise<void>
  resetMessages: () => void
}

const VALID_MODES: CourseBuilderMode[] = [
  'edit',
  'test',
  'classroom',
  'first-course',
  'new-course',
  'no-course',
]

export function useAiAssistant(options: UseAiAssistantOptions): UseAiAssistantReturn {
  const { mode, sessionId, sessionType, courseId, context } = options

  const [messages, setMessages] = useState<AiAssistantMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return

      if (!VALID_MODES.includes(mode)) {
        const message = 'AI Assistant is not available in this mode.'
        setError(message)
        toast.error(message)
        return
      }

      if (!context || typeof context !== 'object') {
        const message = 'Course context is not ready. Try again in a moment.'
        setError(message)
        toast.error(message)
        return
      }

      setIsLoading(true)
      setError(null)

      const userMsg: AiAssistantMessage = {
        role: 'user',
        content: text.trim(),
      }
      const nextMessages = [...messages, userMsg]
      setMessages(nextMessages)

      try {
        const res = await fetchWithCsrf('/api/tutor/ai-assistant', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            sessionId,
            sessionType,
            courseId,
            context,
            messages: nextMessages,
          }),
        })

        const data = (await res.json().catch(() => null)) as {
          reply?: string
          error?: string
        } | null

        if (!res.ok) {
          throw new Error(data?.error || 'Failed to get a response')
        }

        const reply = data?.reply?.trim() || ''
        if (!reply) {
          throw new Error('The assistant returned an empty response.')
        }

        // Guardrail: do not append an assistant reply that is identical to the
        // previous assistant reply. This prevents duplicate consecutive messages.
        const lastAssistant = nextMessages
          .slice()
          .reverse()
          .find(m => m.role === 'assistant')
        if (lastAssistant && lastAssistant.content.trim() === reply) {
          console.warn('[useAiAssistant] Discarded duplicate consecutive assistant message.')
          return
        }

        setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Something went wrong'
        setError(message)
        toast.error(message)
      } finally {
        setIsLoading(false)
      }
    },
    [mode, sessionId, sessionType, courseId, context, messages, isLoading]
  )

  const resetMessages = useCallback(() => setMessages([]), [])

  return { messages, isLoading, error, sendMessage, resetMessages }
}
