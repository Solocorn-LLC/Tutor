'use client'

import { useCallback, useState } from 'react'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { toast } from 'sonner'

export interface AnalyticsAssistantMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface UseAnalyticsAssistantReturn {
  messages: AnalyticsAssistantMessage[]
  isLoading: boolean
  error: string | null
  sendMessage: (text: string) => Promise<void>
}

export function useAnalyticsAssistant(
  sessionId: string | null | undefined
): UseAnalyticsAssistantReturn {
  const [messages, setMessages] = useState<AnalyticsAssistantMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendMessage = useCallback(
    async (text: string) => {
      if (!sessionId || !text.trim() || isLoading) return

      setIsLoading(true)
      setError(null)

      const userMsg: AnalyticsAssistantMessage = {
        role: 'user',
        content: text.trim(),
      }
      const nextMessages = [...messages, userMsg]
      setMessages(nextMessages)

      try {
        const res = await fetchWithCsrf('/api/tutor/analytics/assistant', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, messages: nextMessages }),
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
    [sessionId, messages, isLoading]
  )

  return { messages, isLoading, error, sendMessage }
}
