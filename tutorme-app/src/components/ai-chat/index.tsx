'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageSquare, X, Send, Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAIChat, type Message } from './use-ai-chat'

interface AIChatProps {
  context?: {
    videoTitle?: string
    currentTimestamp?: number
    subject?: string
  }
  className?: string
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function AIChat({ context, className }: AIChatProps) {
  const [isOpen, setIsOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { messages, input, setInput, isLoading, sendMessage, handleKeyPress } = useAIChat(context)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className={cn('fixed bottom-4 right-4 z-50', className)}>
      {isOpen && (
        <Card className="mb-4 flex h-[500px] w-96 flex-col border-2 border-blue-200 shadow-2xl">
          <div className="flex items-center justify-between rounded-t-lg border-b bg-blue-500 p-4 text-white">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <div>
                <h3 className="font-semibold">AI Tutor</h3>
                <p className="text-xs text-blue-100">{context?.subject || 'general'} Help</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-blue-600"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map(message => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && <LoadingBubble />}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className="border-t p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Ask your question..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
                className="flex-1"
              />
              <Button onClick={sendMessage} disabled={!input.trim() || isLoading} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-center text-xs text-gray-500">
              AI uses Socratic method - guiding you to answers
            </p>
          </div>
        </Card>
      )}

      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'h-14 w-14 rounded-full shadow-lg transition-all',
          isOpen
            ? 'bg-gray-600 hover:bg-[#1F2933] hover:text-white hover:outline hover:outline-1 hover:outline-white'
            : 'bg-blue-500 hover:bg-blue-600'
        )}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </Button>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  return (
    <div className={cn('flex gap-2', message.role === 'user' ? 'justify-end' : 'justify-start')}>
      {message.role === 'assistant' && (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
          <Bot className="h-4 w-4 text-blue-600" />
        </div>
      )}

      <div
        className={cn(
          'max-w-[80%] rounded-lg p-3',
          message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'
        )}
      >
        <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        {message.hintType && (
          <span
            className={cn(
              'mt-2 inline-block rounded-full px-2 py-0.5 text-xs',
              message.hintType === 'socratic' && 'bg-purple-100 text-purple-700',
              message.hintType === 'encouragement' && 'bg-green-100 text-green-700',
              message.hintType === 'direct' && 'bg-orange-100 text-orange-700',
              message.hintType === 'clarification' && 'bg-blue-100 text-blue-700'
            )}
          >
            {message.hintType === 'socratic' && '💡 Socratic'}
            {message.hintType === 'encouragement' && '⭐ Encouragement'}
            {message.hintType === 'direct' && '📖 Direct'}
            {message.hintType === 'clarification' && '❓ Clarification'}
          </span>
        )}
        {message.relevantConcepts && message.relevantConcepts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.relevantConcepts.map((concept, idx) => (
              <span key={idx} className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                {concept}
              </span>
            ))}
          </div>
        )}
        <p
          className={cn(
            'mt-1 text-xs',
            message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
          )}
        >
          {formatTime(message.timestamp)}
        </p>
      </div>

      {message.role === 'user' && (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200">
          <User className="h-4 w-4 text-gray-600" />
        </div>
      )}
    </div>
  )
}

function LoadingBubble() {
  return (
    <div className="flex justify-start gap-2">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
        <Bot className="h-4 w-4 text-blue-600" />
      </div>
      <div className="rounded-lg bg-gray-100 p-3">
        <div className="flex gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500 delay-100" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500 delay-200" />
        </div>
      </div>
    </div>
  )
}
