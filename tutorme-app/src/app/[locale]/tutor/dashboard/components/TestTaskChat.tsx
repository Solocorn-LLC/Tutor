'use client'

/**
 * TestTaskChat — previews the student's chat-based TASK flow inside the "Test"
 * tab, using the IN-BUILDER PCI (via /api/tutor/test-grade). It mirrors what a
 * student gets: chat answers → "Task complete" → the AI responds to each answer
 * per the PCI → ask follow-ups.
 *
 * The task document (PDF/image) is shown as a thumbnail card inside the chat
 * stream. Clicking it opens a popup overlay within the chat panel showing the
 * PDF fit-to-screen with an X close button in the top-right corner.
 *
 * State can be persisted by the parent: pass `initialState` to seed the chat and
 * `onPersist` to mirror every change into a store, so switching Test-tab
 * students (which remounts this component) doesn't lose the conversation.
 */

import { useEffect, useRef, useState } from 'react'
import { Send, Loader2, CheckCircle2, Sparkles, FileText, X, ImageIcon } from 'lucide-react'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { PDFViewer } from '@/components/pdf/PDFViewer'
import { PDFThumbnail } from '@/components/pdf/PDFThumbnail'
import { ChatMessageBubble } from '@/components/classroom/chat-message-bubble'
import { toast } from 'sonner'

export interface TestTaskChatMsg {
  role: 'student' | 'ai' | 'tutor'
  content: string
  re?: string
  timestamp?: number
}

export interface TestTaskChatState {
  messages: TestTaskChatMsg[]
  draft: string
  completed: boolean
}

type ChatMsg = TestTaskChatMsg

export interface TaskDocumentSource {
  fileName?: string | null
  fileUrl?: string | null
  fileKey?: string | null
  mimeType?: string | null
}

export function TestTaskChat({
  pci,
  pciSpec,
  questionText,
  sourceDocument,
  initialState,
  onPersist,
  mode = 'test-student',
}: {
  pci?: string
  pciSpec?: unknown
  questionText?: string
  /** The task's document — shown as a thumbnail in the chat stream. */
  sourceDocument?: TaskDocumentSource | null
  initialState?: TestTaskChatState
  onPersist?: (state: TestTaskChatState) => void
  /** Which preview mode this is rendering in. */
  mode?: 'classroom' | 'test-student'
}) {
  const [messages, setMessages] = useState<ChatMsg[]>(initialState?.messages ?? [])
  const [draft, setDraft] = useState(initialState?.draft ?? '')
  const [completed, setCompleted] = useState(initialState?.completed ?? false)
  const [busy, setBusy] = useState(false)
  const [pdfPopupOpen, setPdfPopupOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  // Mirror state to the parent's store so a remount (switching Test students)
  // can rehydrate it. Cheap; runs only when the persisted fields change.
  useEffect(() => {
    onPersist?.({ messages, draft, completed })
  }, [messages, draft, completed, onPersist])

  const studentAnswers = messages.filter(m => m.role === 'student').map(m => m.content)

  // Build the proxied document URL (same logic as TaskDocumentCard)
  const rawUrl = sourceDocument?.fileUrl || ''
  const docUrl = sourceDocument?.fileKey
    ? `/api/proxy-file?key=${encodeURIComponent(sourceDocument.fileKey)}`
    : rawUrl
  const loadable =
    !!sourceDocument?.fileKey || (!!rawUrl && !rawUrl.startsWith('blob:') && rawUrl.length > 0)
  const docName = sourceDocument?.fileName || 'Task document'
  const isPdf =
    sourceDocument?.mimeType === 'application/pdf' ||
    (!sourceDocument?.mimeType && /\.pdf($|\?|#)/i.test(sourceDocument?.fileName || rawUrl))
  const isImage = !!sourceDocument?.mimeType?.startsWith('image/')

  const post = (extra: Record<string, unknown>) =>
    fetchWithCsrf('/api/tutor/test-grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pci, pciSpec, questionText, ...extra }),
    })

  const addAnswer = () => {
    const a = draft.trim()
    if (!a || busy) return
    setMessages(prev => [...prev, { role: 'student', content: a, timestamp: Date.now() }])
    setDraft('')
  }

  const complete = async () => {
    if (busy) return
    const pending = draft.trim()
    const answers = pending ? [...studentAnswers, pending] : studentAnswers
    if (answers.length === 0) {
      toast.info('Type at least one answer first.')
      return
    }
    if (pending) {
      setMessages(prev => [...prev, { role: 'student', content: pending, timestamp: Date.now() }])
      setDraft('')
    }
    setBusy(true)
    try {
      const res = await post({ answers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to grade')
      const responses: Array<{ answer: string; response: string }> = Array.isArray(data.responses)
        ? data.responses
        : []
      setMessages(prev => [
        ...prev,
        ...responses.map(r => ({
          role: 'ai' as const,
          content: r.response,
          re: r.answer,
          timestamp: Date.now(),
        })),
      ])
      setCompleted(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to grade')
    } finally {
      setBusy(false)
    }
  }

  const ask = async () => {
    const q = draft.trim()
    if (!q || busy) return
    setMessages(prev => [...prev, { role: 'student', content: q, timestamp: Date.now() }])
    setDraft('')
    setBusy(true)
    try {
      const history = messages
        .slice(-6)
        .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }))
      const res = await post({ question: q, history, answers: studentAnswers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to answer')
      setMessages(prev => [
        ...prev,
        { role: 'ai', content: data.answer || '…', timestamp: Date.now() },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'ai',
          content: 'Sorry — I could not answer that. Please try again.',
          timestamp: Date.now(),
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  const onSend = () => (completed ? ask() : addAnswer())

  const reset = () => {
    setMessages([])
    setDraft('')
    setCompleted(false)
  }

  const isClassroom = mode === 'classroom'
  const accentColor = isClassroom ? 'text-[#F17623]' : 'text-violet-600'
  const accentBg = isClassroom ? 'bg-orange-50/60' : 'bg-violet-50/60'
  const accentBorder = isClassroom ? 'border-orange-100' : 'border-violet-100'
  const accentBorderStrong = isClassroom ? 'border-[rgba(241,118,35,0.4)]' : 'border-violet-300'
  const sendButtonBg = isClassroom ? 'bg-[#F17623]' : 'bg-violet-600'
  const taskCompleteBg = isClassroom ? 'bg-[#F17623]' : 'bg-violet-600'
  const taskCompleteHover = isClassroom ? 'hover:bg-[#d9631a]' : 'hover:bg-violet-700'

  return (
    <div
      className={`relative flex h-full min-h-[320px] flex-col overflow-hidden rounded-2xl border ${accentBorderStrong} bg-white`}
    >
      {/* Header bar */}
      <div className={`flex items-center gap-2 border-b ${accentBorder} ${accentBg} px-4 py-2`}>
        <Sparkles className={`h-4 w-4 ${accentColor}`} />
        <span className="text-sm font-semibold text-gray-800">
          {completed ? 'Ask about this task' : 'Answer by chat'}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {completed && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Completed
            </span>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className={`text-xs font-medium ${accentColor} hover:opacity-80`}
            >
              Restart
            </button>
          )}
        </span>
      </div>

      {/* Unified chat stream — document thumbnail + messages scroll together */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* Document as first tutor message */}
        {sourceDocument && !pdfPopupOpen && (
          <ChatMessageBubble
            sender="tutor"
            name="Tutor"
            content=""
            isDocument
            document={sourceDocument}
            onDocumentClick={() => loadable && setPdfPopupOpen(true)}
            isClassroom={isClassroom}
          />
        )}

        {/* PDF Popup — overlay within chat panel, no header, X on right */}
        {pdfPopupOpen && loadable && (
          <div className="absolute inset-0 z-10 flex flex-col bg-white">
            {/* X close button — top right, no header bar */}
            <div className="flex justify-end px-3 py-2">
              <button
                type="button"
                onClick={() => setPdfPopupOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100"
                aria-label="Close document"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* PDF viewer — fit to screen, no scrolling needed */}
            <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
              {isPdf ? (
                <PDFViewer
                  fileUrl={docUrl}
                  fileKey={sourceDocument?.fileKey ?? undefined}
                  fitToScreen
                  className="h-full w-full"
                />
              ) : isImage ? (
                <div className="flex h-full items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={docUrl}
                    alt={docName}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3">
                  <FileText className="h-12 w-12 text-blue-600" />
                  <a
                    href={docUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-blue-600 underline"
                  >
                    Open document
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.map((m, i) => (
          <ChatMessageBubble
            key={i}
            sender={m.role}
            name={m.role === 'student' ? 'Student' : m.role === 'ai' ? 'Tutor' : 'Tutor'}
            content={m.content}
            re={m.re}
            timestamp={m.timestamp ? new Date(m.timestamp) : undefined}
            isClassroom={isClassroom}
          />
        ))}

        {busy && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {completed ? 'Thinking…' : 'Checking the answers…'}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-100 p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            disabled={busy}
            rows={1}
            placeholder={completed ? 'Ask about this task…' : 'Type a sample answer…'}
            className="max-h-28 min-h-[40px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-violet-400"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={busy || !draft.trim()}
            title={completed ? 'Send' : 'Add answer'}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-400 text-white transition-colors hover:bg-slate-500 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        {/* Task Complete button — only shown in test-student mode, not classroom */}
        {!completed && !isClassroom && (
          <button
            type="button"
            onClick={complete}
            disabled={busy || (studentAnswers.length === 0 && !draft.trim())}
            className={`mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg ${taskCompleteBg} px-3 py-2 text-sm font-semibold text-white transition-colors ${taskCompleteHover} disabled:opacity-50`}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Task complete
          </button>
        )}
      </div>
    </div>
  )
}
