'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Bot, User, Loader2 } from 'lucide-react'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { toast } from 'sonner'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

interface SupportAiAssistantProps {
  role: 'student' | 'tutor'
}

export function SupportAiAssistant({ role }: SupportAiAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Hi! I'm your support assistant. Ask me anything about the platform and I'll do my best to help.",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMessage: Message = { id: String(Date.now()), role: 'user', text }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const conversation = messages
        .filter(m => m.id !== 'welcome')
        .concat(userMessage)
        .map(m => ({ role: m.role, content: m.text }))

      const endpoint =
        role === 'student' ? '/api/student/support/ai-assistant' : '/api/tutor/support/ai-assistant'

      const res = await fetchWithCsrf(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messages: conversation }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const errorId = data.errorId ? ` [${data.errorId}]` : ''
        throw new Error(data.error || `Request failed (${res.status})${errorId}`)
      }

      const data = await res.json()
      const reply = typeof data.reply === 'string' ? data.reply : 'Sorry, I had trouble with that.'

      setMessages(prev => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          text: reply,
        },
      ])

      if (Array.isArray(data.guardrailWarnings) && data.guardrailWarnings.length > 0) {
        console.warn('[support-ai-assistant] guardrail warnings:', data.guardrailWarnings)
      }
    } catch (err) {
      console.error('Support AI assistant error:', err)
      toast.error('Could not reach the support assistant. Please try again.')
      setMessages(prev => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          text: 'Sorry, I could not generate a response right now. Please try again in a moment.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-12 shrink-0 items-center gap-2 rounded-t-2xl border-b border-[#E5E7EB] bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] px-4">
        <Bot className="h-5 w-5 text-white" />
        <h3 className="text-sm font-semibold text-white">AI Assistant</h3>
      </div>

      <ScrollArea className="min-h-0 flex-1 p-4">
        <div className="flex flex-col gap-3">
          {messages.map(message => (
            <div
              key={message.id}
              className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  message.role === 'user'
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-orange-100 text-orange-600'
                }`}
              >
                {message.role === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div
                className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-100 bg-white text-slate-700 shadow-sm'
                }`}
              >
                {message.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="flex shrink-0 items-center gap-2 border-t border-[#E5E7EB] bg-white p-3">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Ask a question..."
          disabled={loading}
          className="flex-1"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="bg-[#2563EB] hover:bg-[#1D4ED8]"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
