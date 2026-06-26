'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'

interface AiAssistantPanelProps {
  sessionId?: string | null
}

export function AiAssistantPanel({ sessionId }: AiAssistantPanelProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([])

  const handleSend = () => {
    if (!input.trim()) return
    setMessages(prev => [...prev, { role: 'user', text: input.trim() }])
    setInput('')
    // TODO: wire to AI backend
  }

  return (
    <div className="flex h-full flex-col gap-3 px-1 pb-0">
      {/* Chat display */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white/80 p-3 shadow-sm">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-400">Ask the AI Assistant anything.</p>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
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
