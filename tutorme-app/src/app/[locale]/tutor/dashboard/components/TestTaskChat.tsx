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
import {
  Send,
  Loader2,
  CheckCircle2,
  Sparkles,
  FileText,
  X,
  ImageIcon,
  RotateCcw,
} from 'lucide-react'
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
  /** Display name for this message sender (e.g. "Test Student 1" in classroom view). */
  name?: string
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
  onBroadcast,
  onReset,
  incomingMessages,
  mode = 'test-student',
  tutorAvatarUrl,
  studentAvatarUrl,
}: {
  pci?: string
  pciSpec?: unknown
  questionText?: string
  /** The task's document — shown as a thumbnail in the chat stream. */
  sourceDocument?: TaskDocumentSource | null
  initialState?: TestTaskChatState
  onPersist?: (state: TestTaskChatState) => void
  /** Called when a new message is sent from this tab so the parent can relay it to other tabs. */
  onBroadcast?: (msg: TestTaskChatMsg) => void
  /** Called when the user clicks the reset/restart button. Parent should clear all persisted data. */
  onReset?: () => void
  /** Messages injected from outside (e.g. from other tabs via the parent). Appended to the chat. */
  incomingMessages?: TestTaskChatMsg[]
  /** Which preview mode this is rendering in. */
  mode?: 'classroom' | 'test-student'
  /** Tutor avatar URL — shown on tutor/AI messages. */
  tutorAvatarUrl?: string | null
  /** Student avatar URL — shown on student messages. */
  studentAvatarUrl?: string | null
}) {
  const [messages, setMessages] = useState<ChatMsg[]>(initialState?.messages ?? [])
  const [draft, setDraft] = useState(initialState?.draft ?? '')
  const [completed, setCompleted] = useState(initialState?.completed ?? false)
  const [busy, setBusy] = useState(false)
  const [pdfPopupOpen, setPdfPopupOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastIncomingLen = useRef(0)
  const isClassroom = mode === 'classroom'

  // In classroom mode, sync messages directly from incomingMessages.
  // This ensures messages persist when switching tabs (component remounts).
  useEffect(() => {
    if (isClassroom && incomingMessages) {
      setMessages(incomingMessages)
    }
  }, [incomingMessages, isClassroom])

  useEffect(() => {
    const el = scrollRef.current
    // flex-col-reverse: scrollTop = 0 is the bottom (newest messages).
    // Scroll to bottom on new messages by setting scrollTop to 0.
    if (el) el.scrollTop = 0
  }, [messages, busy])

  // Append any new incoming messages from the parent (cross-tab relay).
  // Only used for non-classroom mode (student tabs).
  useEffect(() => {
    if (isClassroom) return
    const len = incomingMessages?.length ?? 0
    if (len > lastIncomingLen.current) {
      const newMsgs = incomingMessages!.slice(lastIncomingLen.current)
      setMessages(prev => [...prev, ...newMsgs])
      lastIncomingLen.current = len
    }
  }, [incomingMessages, isClassroom])

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
    const msg: ChatMsg = {
      role: 'student',
      content: a,
      timestamp: Date.now(),
    }
    const nextMessages = isClassroom ? messages : [...messages, msg]
    if (!isClassroom) {
      setMessages(nextMessages)
    }
    setDraft('')
    onPersist?.({ messages: nextMessages, draft: '', completed })
    onBroadcast?.(msg)
  }

  const complete = async () => {
    if (busy) return
    const pending = draft.trim()
    const answers = pending ? [...studentAnswers, pending] : studentAnswers
    if (answers.length === 0) {
      toast.info('Type at least one answer first.')
      return
    }
    let nextMessages = messages
    if (pending) {
      const pendingMsg: ChatMsg = {
        role: 'student',
        content: pending,
        timestamp: Date.now(),
      }
      nextMessages = isClassroom ? messages : [...messages, pendingMsg]
      if (!isClassroom) {
        setMessages(nextMessages)
      }
      setDraft('')
      onPersist?.({ messages: nextMessages, draft: '', completed })
      onBroadcast?.(pendingMsg)
    }
    setBusy(true)
    try {
      const res = await post({ answers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to grade')
      const responses: Array<{ answer: string; response: string }> = Array.isArray(data.responses)
        ? data.responses
        : []
      const aiMsgs: ChatMsg[] = responses.map(r => ({
        role: 'ai' as const,
        content: r.response,
        re: r.answer,
        timestamp: Date.now(),
      }))
      const finalMessages = [...nextMessages, ...aiMsgs]
      setMessages(finalMessages)
      aiMsgs.forEach(m => onBroadcast?.(m))
      setCompleted(true)
      onPersist?.({ messages: finalMessages, draft: '', completed: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to grade')
    } finally {
      setBusy(false)
    }
  }

  const ask = async () => {
    const q = draft.trim()
    if (!q || busy) return
    const questionMsg: ChatMsg = {
      role: isClassroom ? 'tutor' : 'student',
      content: q,
      timestamp: Date.now(),
    }
    const nextMessages = isClassroom ? messages : [...messages, questionMsg]
    if (!isClassroom) {
      setMessages(nextMessages)
    }
    setDraft('')
    onPersist?.({ messages: nextMessages, draft: '', completed })
    onBroadcast?.(questionMsg)
    setBusy(true)
    try {
      const history = messages
        .slice(-6)
        .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }))
      const res = await post({ question: q, history, answers: studentAnswers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to answer')
      const aiMsg: ChatMsg = {
        role: 'ai',
        content: data.answer || '…',
        timestamp: Date.now(),
      }
      const finalMessages = [...nextMessages, aiMsg]
      setMessages(finalMessages)
      onBroadcast?.(aiMsg)
      onPersist?.({ messages: finalMessages, draft: '', completed })
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
    const emptyState: TestTaskChatState = { messages: [], draft: '', completed: false }
    setMessages([])
    setDraft('')
    setCompleted(false)
    onPersist?.(emptyState)
    onReset?.()
  }

  const accentColor = isClassroom ? 'text-[#F17623]' : 'text-violet-600'
  const accentBg = isClassroom ? 'bg-orange-50/60' : 'bg-violet-50/60'
  const accentBorder = isClassroom ? 'border-orange-100' : 'border-violet-100'
  const sendButtonBg = isClassroom ? 'bg-[#F17623]' : 'bg-violet-600'
  const taskCompleteBg = isClassroom ? 'bg-[#F17623]' : 'bg-violet-600'
  const taskCompleteHover = isClassroom ? 'hover:bg-[#d9631a]' : 'hover:bg-violet-700'

  return (
    <div
      className={`relative flex h-full min-h-[320px] flex-col overflow-hidden rounded-2xl bg-white`}
    >
      {/* Unified chat stream — document thumbnail + messages scroll together.
          flex-col-reverse so new messages appear at the bottom and push older ones up. */}
      <div
        ref={scrollRef}
        className="relative flex min-h-0 flex-1 flex-col-reverse gap-4 overflow-y-auto p-4"
      >
        {/* Chat messages — render in reverse so flex-col-reverse shows newest at bottom.
            In classroom mode, filter out student messages (tutor view only). */}
        {[...messages]
          .reverse()
          .filter(m => !isClassroom || m.role !== 'student')
          .map((m, i) => (
            <ChatMessageBubble
              key={i}
              sender={m.role}
              name={
                m.name || (m.role === 'student' ? 'Student' : m.role === 'ai' ? 'Tutor' : 'Tutor')
              }
              content={m.content}
              avatarUrl={m.role === 'student' ? studentAvatarUrl : tutorAvatarUrl}
              re={m.re}
              timestamp={m.timestamp ? new Date(m.timestamp) : undefined}
              isClassroom={isClassroom}
              studentOnRight
            />
          ))}

        {busy && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {completed ? 'Thinking…' : 'Checking the answers…'}
          </div>
        )}

        {/* Document as first tutor message — rendered at the end so it appears at top */}
        {sourceDocument && !pdfPopupOpen && (
          <ChatMessageBubble
            sender="tutor"
            name="Tutor"
            content=""
            avatarUrl={tutorAvatarUrl}
            isDocument
            document={sourceDocument}
            onDocumentClick={() => loadable && setPdfPopupOpen(true)}
            isClassroom={isClassroom}
            studentOnRight
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
          {isClassroom && (
            <button
              type="button"
              onClick={reset}
              title="Restart"
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 text-white transition-colors hover:opacity-80 ${isClassroom ? 'border-[#F17623] bg-[#F17623]' : 'border-violet-600 bg-violet-600'}`}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
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
