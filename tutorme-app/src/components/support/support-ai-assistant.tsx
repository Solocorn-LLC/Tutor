'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Bot, User } from 'lucide-react'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export function SupportAiAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Hi! I'm your support assistant. Ask me anything about the platform and I'll do my best to help.",
    },
  ])
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const handleSend = () => {
    const text = input.trim()
    if (!text) return

    setMessages(prev => [...prev, { id: String(Date.now()), role: 'user', text }])
    setInput('')

    // Placeholder response — wire this to your AI endpoint later.
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          text: "Thanks for your question. I'm looking into that for you — this is a placeholder response you can replace with a real AI call.",
        },
      ])
    }, 600)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#E5E7EB] bg-gradient-to-br from-[#F97316] to-[#EA580C] px-4">
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
          className="flex-1"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!input.trim()}
          className="bg-[#F97316] hover:bg-[#EA580C]"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
