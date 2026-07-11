'use client'

/**
 * TestTaskChat — previews the student's chat-based TASK flow inside the "Test"
 * tab, using the IN-BUILDER PCI (via /api/tutor/test-grade). It mirrors what a
 * student gets: chat answers → "Task complete" → the AI responds to each answer
 * per the PCI → ask follow-ups.
 *
 * The task document (PDF/image) is shown as a thumbnail card inside the chat
 * stream, like an uploaded document in an LLM chat. Clicking it opens a full-
 * screen viewer with fit-to-screen scaling.
 *
 * State can be persisted by the parent: pass `initialState` to seed the chat and
 * `onPersist` to mirror every change into a store, so switching Test-tab
 * students (which remounts this component) doesn't lose the conversation.
 */

import { useEffect, useRef, useState } from 'react'
import { Send, Loader2, CheckCircle2, Sparkles, FileText, X, ImageIcon } from 'lucide-react'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { PDFViewer } from '@/components/pdf/PDFViewer'
import { toast } from 'sonner'

export interface TestTaskChatMsg {
  role: 'student' | 'ai'
  content: string
  re?: string
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
}: {
  pci?: string
  pciSpec?: unknown
  questionText?: string
  /** The task's document — shown as a thumbnail in the chat stream. */
  sourceDocument?: TaskDocumentSource | null
  initialState?: TestTaskChatState
  onPersist?: (state: TestTaskChatState) => void
}) {
  const [messages, setMessages] = useState<ChatMsg[]>(initialState?.messages ?? [])
  const [draft, setDraft] = useState(initialState?.draft ?? '')
  const [completed, setCompleted] = useState(initialState?.completed ?? false)
  const [busy, setBusy] = useState(false)
  const [pdfFullscreen, setPdfFullscreen] = useState(false)
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
    setMessages(prev => [...prev, { role: 'student', content: a }])
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
      setMessages(prev => [...prev, { role: 'student', content: pending }])
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
        ...responses.map(r => ({ role: 'ai' as const, content: r.response, re: r.answer })),
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
    setMessages(prev => [...prev, { role: 'student', content: q }])
    setDraft('')
    setBusy(true)
    try {
      const history = messages
        .slice(-6)
        .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }))
      const res = await post({ question: q, history, answers: studentAnswers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to answer')
      setMessages(prev => [...prev, { role: 'ai', content: data.answer || '…' }])
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'ai', content: 'Sorry — I could not answer that. Please try again.' },
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

  return (
    <div className="flex h-full min-h-[320px] flex-col overflow-hidden rounded-2xl border border-violet-300 bg-white">
      {/* Header bar */}
      <div className="flex items-center gap-2 border-b border-violet-100 bg-violet-50/60 px-4 py-2">
        <Sparkles className="h-4 w-4 text-violet-600" />
        <span className="text-sm font-semibold text-gray-800">
          Preview: {completed ? 'ask about this task' : 'answer by chat'}
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
              className="text-xs font-medium text-violet-600 hover:text-violet-700"
            >
              Restart
            </button>
          )}
        </span>
      </div>

      {/* Unified chat stream — document thumbnail + messages scroll together */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {/* Document thumbnail — persistent first message in the stream */}
        {sourceDocument && (
          <div className="flex items-start">
            <button
              type="button"
              onClick={() => loadable && setPdfFullscreen(true)}
              disabled={!loadable}
              className="max-w-[85%] cursor-pointer rounded-xl border border-violet-200 bg-violet-50/50 px-4 py-3 text-left transition-colors hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-center gap-2.5">
                {isImage ? (
                  <ImageIcon className="h-5 w-5 shrink-0 text-violet-600" />
                ) : (
                  <FileText className="h-5 w-5 shrink-0 text-violet-600" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">{docName}</p>
                  <p className="text-xs text-gray-500">
                    {loadable
                      ? 'Click to view full document'
                      : 'This document is unavailable. Re-upload it.'}
                  </p>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Empty state — shown when no messages yet */}
        {messages.length === 0 && (
          <p className="text-sm leading-relaxed text-gray-500">
            This is exactly what students see for a task. Chat sample answers, click{' '}
            <span className="font-medium text-violet-700">Task complete</span>, and the AI responds
            to each answer using your PCI — then ask a follow-up to check how it explains mistakes.
          </p>
        )}

        {/* Chat messages */}
        {messages.map((m, i) =>
          m.role === 'student' ? (
            <div key={i} className="flex justify-end">
              <span className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-violet-600 px-3 py-2 text-sm text-white">
                {m.content}
              </span>
            </div>
          ) : (
            <div key={i} className="flex flex-col items-start">
              {m.re && (
                <span className="mb-0.5 max-w-[85%] truncate rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                  Re: {m.re}
                </span>
              )}
              <span className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-800">
                {m.content}
              </span>
            </div>
          )
        )}

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
        {!completed && (
          <button
            type="button"
            onClick={complete}
            disabled={busy || (studentAnswers.length === 0 && !draft.trim())}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
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

      {/* Full-screen PDF viewer overlay */}
      {pdfFullscreen && loadable && (
        <div className="fixed inset-0 z-50 bg-black/80">
          <div className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-xl bg-white">
            {/* Overlay header */}
            <div className="flex items-center gap-3 border-b px-4 py-2">
              <button
                type="button"
                onClick={() => setPdfFullscreen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100"
                aria-label="Close document viewer"
              >
                <X className="h-5 w-5" />
              </button>
              <FileText className="h-4 w-4 text-violet-600" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
                {docName}
              </span>
            </div>
            {/* PDF viewer — fit to screen */}
            <div className="flex-1 overflow-hidden">
              {isPdf ? (
                <PDFViewer
                  fileUrl={docUrl}
                  fileKey={sourceDocument?.fileKey ?? undefined}
                  fitToScreen
                  className="h-full w-full"
                />
              ) : isImage ? (
                <div className="flex h-full items-center justify-center bg-gray-100 p-4">
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
        </div>
      )}
    </div>
  )
}
