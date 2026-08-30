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

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { Send, Loader2, X } from 'lucide-react'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { TaskDocumentCard } from '@/components/task/TaskDocumentCard'
import { ChatMessageBubble } from '@/components/classroom/chat-message-bubble'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { LinkPreviewItem } from '@/lib/link-preview/types'
import type { AudioPlayerTrack } from '@/components/task/AudioPlayer'

export interface TestTaskChatMsg {
  role: 'student' | 'ai' | 'tutor'
  content: string
  re?: string
  timestamp?: number
  /** Display name for this message sender (e.g. "Test Student 1" in classroom view). */
  name?: string
  /** User id of the sender, when known (used to filter out self-echoed socket messages). */
  userId?: string
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

export interface TestTaskChatProps {
  pci?: string
  pciSpec?: unknown
  questionText?: string
  /** The task's document — shown as a thumbnail in the chat stream. */
  sourceDocument?: TaskDocumentSource | null
  /** Display title for the document card; falls back to sourceDocument.fileName. */
  documentTitle?: string | null
  /** Original HTML content for documents auto-generated from typed text. */
  htmlContent?: string
  /** Visual link-preview cards overlaid on the slide canvas. */
  linkPreviews?: LinkPreviewItem[]
  /** True when the backing document was auto-generated from typed text. */
  generatedFromText?: boolean
  /** Optional audio track played alongside the task. */
  audioTrack?: AudioPlayerTrack | null
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
  /** Border/focus accent for the classroom input. */
  accent?: 'orange' | 'violet'
  /** Tutor avatar URL — shown on tutor messages. */
  tutorAvatarUrl?: string | null
  /** Student avatar URL — shown on student messages. */
  studentAvatarUrl?: string | null
  /** Called when the test-grade endpoint returns a tutor-only note. */
  onTutorNote?: (note: string) => void
  /** Called when a student submits a sample answer (Test mode only). */
  onAddAnswer?: (answer: string) => void
  /** Called when a student asks a follow-up question after completing the task (Test mode only). */
  onAsk?: (question: string) => void
  /** Called when the student clicks "Task complete" (Test mode only). */
  onComplete?: (answers: string[]) => void
  /** Optional callback fired whenever the internal grading busy state changes. */
  onBusyChange?: (busy: boolean) => void
  /** Optional callback fired whenever the internal completed state changes. */
  onCompletedChange?: (completed: boolean) => void
  /** Optional grading request handler. When provided, complete/ask POST through this instead of /api/tutor/task-chat-preview. */
  onGrade?: (body: Record<string, unknown>) => Promise<Response>
  /** Task id used by the default preview endpoint. Required when onGrade is not provided. */
  taskId?: string
}

export interface TestTaskChatRef {
  /** Trigger the same submission flow as the internal "Task complete" button. */
  submit: () => void
}

export const TestTaskChat = forwardRef<TestTaskChatRef, TestTaskChatProps>(function TestTaskChat(
  {
    pci,
    pciSpec,
    questionText,
    sourceDocument,
    htmlContent,
    linkPreviews,
    generatedFromText,
    audioTrack,
    initialState,
    onPersist,
    onBroadcast,
    onReset,
    incomingMessages,
    mode = 'test-student',
    tutorAvatarUrl,
    studentAvatarUrl,
    onTutorNote,
    onAddAnswer,
    onAsk,
    onComplete,
    onBusyChange,
    onCompletedChange,
    onGrade,
    taskId,
    accent = 'orange',
    documentTitle,
  }: TestTaskChatProps,
  ref
) {
  const [messages, setMessages] = useState<ChatMsg[]>(initialState?.messages ?? [])
  const [draft, setDraft] = useState(initialState?.draft ?? '')
  const [completed, setCompleted] = useState(initialState?.completed ?? false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  useEffect(() => {
    onCompletedChange?.(completed)
  }, [completed, onCompletedChange])
  const [pdfPopupOpen, setPdfPopupOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastIncomingLen = useRef(0)
  const isClassroom = mode === 'classroom'

  // Allow the parent to trigger the internal completion flow from an external
  // "Task Complete" button (used in the student classroom viewport).
  useImperativeHandle(ref, () => ({ submit: complete }))

  // Re-initialize the chat whenever the parent provides a new initialState. This
  // prevents a previous task's answers/AI feedback from surviving when the
  // component remounts for a newly deployed task before the new task's history
  // has loaded. The parent should clear initialState synchronously on task
  // change so we reset to an empty state first, then to the fetched history.
  useEffect(() => {
    setMessages(initialState?.messages ?? [])
    setDraft(initialState?.draft ?? '')
    setCompleted(initialState?.completed ?? false)
    lastIncomingLen.current = 0
  }, [initialState])

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

  // In classroom mode, avoid rendering the fallback question-text bubble if the
  // chat already contains a tutor message with the same task content.
  const hasTutorTaskBubble =
    isClassroom &&
    messages.some(
      m => m.role === 'tutor' && questionText && m.content.trim() === questionText.trim()
    )

  // Build the proxied document URL (same logic as TaskDocumentCard)
  const rawUrl = sourceDocument?.fileUrl || ''
  const loadable =
    !!sourceDocument?.fileKey || (!!rawUrl && !rawUrl.startsWith('blob:') && rawUrl.length > 0)

  const post = (extra: Record<string, unknown>) => {
    if (onGrade) return onGrade(extra)
    return fetchWithCsrf('/api/tutor/task-chat-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, pci, pciSpec, questionText, ...extra }),
    })
  }

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
    setPdfPopupOpen(false)
    onPersist?.({ messages: nextMessages, draft: '', completed })
    onBroadcast?.(msg)
    onAddAnswer?.(a)
  }

  const complete = async () => {
    if (busy) return
    const pending = draft.trim()
    const answers = pending ? [...studentAnswers, pending] : studentAnswers
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
      setPdfPopupOpen(false)
      onPersist?.({ messages: nextMessages, draft: '', completed })
      onBroadcast?.(pendingMsg)
    }
    onComplete?.(answers)
    // Visual slides may have no answers. In that case just mark the task
    // complete locally without calling a grading endpoint that requires answers.
    if (answers.length === 0) {
      setCompleted(true)
      onPersist?.({ messages: nextMessages, draft: '', completed: true })
      return
    }
    setBusy(true)
    try {
      const res = await post({ answers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to grade')
      const responses: Array<{
        answer: string
        studentFeedback?: string | null
        response?: string | null
        tutorNote?: string | null
        score?: number | null
        hasBasis?: boolean
      }> = Array.isArray(data.responses) ? data.responses : []
      const aiMsgs: ChatMsg[] = []
      responses.forEach(r => {
        if (r.tutorNote) {
          onTutorNote?.(r.tutorNote)
        }
        const feedback = r.studentFeedback || r.response
        if (feedback) {
          aiMsgs.push({
            role: 'tutor' as const,
            content: feedback,
            re: r.answer,
            timestamp: Date.now(),
          })
        }
      })
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
      role: 'student',
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
    onAsk?.(q)
    setBusy(true)
    try {
      const history = messages.slice(-6).map(m => ({
        role: m.role === 'tutor' || m.role === 'ai' ? 'assistant' : 'user',
        content: m.content,
      }))
      const res = await post({ question: q, history, answers: studentAnswers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to answer')
      if (data.tutorNote) {
        onTutorNote?.(data.tutorNote)
      }
      const aiMsg: ChatMsg | null = data.answer
        ? {
            role: 'ai',
            content: data.answer,
            timestamp: Date.now(),
          }
        : null
      if (aiMsg) {
        const finalMessages = [...nextMessages, aiMsg]
        setMessages(finalMessages)
        onBroadcast?.(aiMsg)
        onPersist?.({ messages: finalMessages, draft: '', completed })
      }
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

  const sendTutorMessage = () => {
    const text = draft.trim()
    if (!text || busy) return
    const msg: ChatMsg = {
      role: 'tutor',
      content: text,
      timestamp: Date.now(),
    }
    setDraft('')
    onBroadcast?.(msg)
    onPersist?.({ messages, draft: '', completed })
  }

  const onSend = () => {
    if (isClassroom) {
      sendTutorMessage()
    } else {
      completed ? ask() : addAnswer()
    }
  }

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
            Use the original array index as the React key so keys stay stable when
            new messages are appended. */}
        {[...messages]
          .map((m, originalIdx) => ({ m, originalIdx }))
          .reverse()
          .map(({ m, originalIdx }) => {
            const defaultAiName = isClassroom ? 'SAI' : 'AI'
            return (
              <ChatMessageBubble
                key={originalIdx}
                sender={m.role}
                name={
                  m.name ||
                  (m.role === 'student' ? 'Student' : m.role === 'ai' ? defaultAiName : 'Tutor')
                }
                content={m.content}
                avatarUrl={
                  m.role === 'student'
                    ? studentAvatarUrl
                    : m.role === 'ai'
                      ? undefined
                      : tutorAvatarUrl
                }
                re={m.re}
                timestamp={m.timestamp ? new Date(m.timestamp) : undefined}
                isClassroom={isClassroom}
                studentOnRight
                aiOnRight={isClassroom}
              />
            )
          })}

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
            documentTitle={documentTitle}
            onDocumentClick={() => loadable && setPdfPopupOpen(true)}
            isClassroom={isClassroom}
            studentOnRight
          />
        )}

        {/* Text-only task: show the question text as the initial tutor message. */}
        {!sourceDocument && questionText?.trim() && !hasTutorTaskBubble && (
          <ChatMessageBubble
            sender="tutor"
            name="Tutor"
            content={questionText}
            avatarUrl={tutorAvatarUrl}
            isClassroom={isClassroom}
            studentOnRight
          />
        )}

        {/* Document popup — overlay within chat panel, no header, X on right */}
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
            {/* Document viewer — shared renderer so generated-text tasks show clickable HTML. */}
            <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
              <TaskDocumentCard
                sourceDocument={sourceDocument}
                htmlContent={htmlContent}
                linkPreviews={linkPreviews}
                generatedFromText={generatedFromText}
                audioTrack={audioTrack}
                alwaysOpen
                accent={isClassroom ? 'orange' : 'violet'}
              />
            </div>
          </div>
        )}
      </div>

      {/* Input area — chat composer for both classroom and student tabs.
          The send button sits inside the bottom-right corner of the rounded textarea/pill. */}
      <div className="border-t border-gray-100 px-2 pb-0 pt-2">
        <div className="relative">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (isClassroom) {
                  sendTutorMessage()
                } else {
                  onSend()
                }
              }
            }}
            disabled={busy}
            rows={2}
            placeholder={
              isClassroom
                ? 'Send a message to students…'
                : completed
                  ? 'Ask a follow-up…'
                  : 'Type a sample answer…'
            }
            className={cn(
              'max-h-28 min-h-[72px] w-full resize-none rounded-xl border bg-white py-2.5 pl-3 pr-11 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-1',
              accent === 'violet'
                ? 'border-[#8B5CF6] focus:ring-[#8B5CF6]'
                : 'border-[#F4A9A0] focus:ring-[#F4A9A0]'
            )}
          />
          <button
            type="button"
            onClick={isClassroom ? sendTutorMessage : onSend}
            disabled={busy || !draft.trim()}
            title={isClassroom ? 'Send' : completed ? 'Send' : 'Add answer'}
            className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-lg bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
})
