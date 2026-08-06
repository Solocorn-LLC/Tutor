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

export function useAiAssistant(options: UseAiAssistantOptions): UseAiAssistantReturn {
  const { mode, sessionId, sessionType, courseId, context } = options

  const [messages, setMessages] = useState<AiAssistantMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return

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

        setMessages(prev => [...prev, { role: 'assistant', content: data?.reply?.trim() || '' }])
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Something went wrong'
        setError(message)
        toast.error(message)
      } finally {
        setIsLoading(false)
      }
    },
    [mode, sessionId, courseId, context, messages, isLoading]
  )

  const resetMessages = useCallback(() => setMessages([]), [])

  return { messages, isLoading, error, sendMessage, resetMessages }
}
