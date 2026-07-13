'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Sparkles, Loader2, Send } from 'lucide-react'

interface AIAssistAgentProps {
  isOpen: boolean
  onClose: () => void
  context: 'task' | 'assessment'
  content: string
  pci: string
  title: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  setMessages: React.Dispatch<
    React.SetStateAction<{ role: 'user' | 'assistant'; content: string }[]>
  >
  onApplyContent: (content: string) => void
  onApplyPci: (pci: string) => void
}

export function AIAssistAgent({
  isOpen,
  onClose,
  context,
  content,
  pci,
  title,
  messages,
  setMessages,
  onApplyContent,
  onApplyPci,
}: AIAssistAgentProps) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Initial system message
      setMessages([
        {
          role: 'assistant',
          content: `Hello! I'm your AI Course Builder Assistant. I can help you with this ${context === 'task' ? 'Task' : 'Assessment'}: "${title}".\n\nI have access to:\n📄 **Content Tab**: The questions/content${content ? ' (currently has content)' : ' (currently empty)'}\n⚙️ **PCI Tab**: Instructions on how to process the content${pci ? ' (currently has instructions)' : ' (currently empty)'}\n\nHow can I help you today?`,
        },
      ])
    }
  }, [isOpen, context, title, content, pci, messages.length, setMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const generatePrompt = (userInput: string) => {
    return `You are an AI Course Builder Assistant helping a tutor create educational content.

CURRENT CONTEXT:
- Type: ${context === 'task' ? 'Task' : 'Assessment'}
- Title: ${title}

CONTENT TAB (Questions/Content to work with):
${content || '(empty)'}

PCI TAB (Instructions for processing):
${pci || '(empty - you can suggest instructions based on the content)'}

USER REQUEST:
${userInput}

Please respond helpfully. You can:
1. Answer questions about the content
2. Suggest improvements to the PCI instructions
3. Analyze the questions and provide feedback
4. Generate additional content following the PCI pattern
5. If the user asks to apply something to Content or PCI, indicate that clearly

Format your response clearly and concisely.`
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      // Call the AI orchestrator
      const prompt = generatePrompt(userMessage)
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          assistant: 'tutor_assist',
        }),
      })

      if (!response.ok) throw new Error('Failed to get AI response')

      const data = await response.json()
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.response || 'I apologize, but I was unable to process your request.',
        },
      ])
    } catch (error) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, there was an error processing your request. Please try again.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            AI Assist Agent - {context === 'task' ? 'Task' : 'Assessment'} Builder
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 pt-4">
          <div className="max-h-[420px] min-h-[300px] space-y-4 overflow-y-auto rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white p-4 text-[#1F2933] shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 text-sm ${
                    msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-3">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
                  <span className="text-sm text-slate-600">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-white/15 pt-4">
          <div className="relative flex gap-2">
            <Textarea
              value={input}
              onChange={(e: any) => setInput(e.target.value)}
              placeholder="Ask me anything about your content or PCI instructions..."
              className="min-h-[80px] flex-1 rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white pr-12 text-[#1F2933]"
              onKeyDown={(e: any) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              className="absolute bottom-2 right-2 h-9 w-9 shrink-0 rounded-full"
              onClick={handleSend}
              disabled={!input.trim() || loading}
              aria-label="Send"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
