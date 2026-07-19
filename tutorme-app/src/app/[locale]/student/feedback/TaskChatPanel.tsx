'use client'

/**
 * TaskChatPanel — the chat-based answer flow for a deployed TASK (no DMI).
 *
 * The student chats their answers, clicks "Task complete", and the AI responds
 * to each answer grounded in the task's PCI; afterwards they can ask about the
 * task/their answers and the AI explains per the PCI. All grading/PCI lives
 * server-side (see /api/student/assignments/[taskId]/task-chat).
 */

import { useEffect, useRef, useState } from 'react'
import { Send, Loader2, CheckCircle2, Sparkles } from 'lucide-react'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { TaskDocumentCard, type TaskDocumentSource } from '@/components/task/TaskDocumentCard'
import { toast } from 'sonner'

interface ChatMsg {
  role: 'student' | 'ai'
  content: string
  /** For an AI response: the student answer it addresses. */
  re?: string
}

export function TaskChatPanel({
  taskId,
  taskTitle,
  sourceDocument,
  onCompleted,
  previewMode = false,
  onInteract,
}: {
  taskId: string
  taskTitle?: string
  /** The task's document (PDF/image). Shown full until the first message, then
   *  collapsed into a pinned, re-expandable "document" card in the chat. */
  sourceDocument?: TaskDocumentSource | null
  /** Fired after the task is completed, with the student's answers — the page
   *  uses it to broadcast the live "completed" tick to the tutor. */
  onCompleted?: (answers: string[]) => void
  /** Tutor-facing preview: hides the student-only "Task complete" action (tutors
   *  test tasks in the course-builder Test tab, not here). The box still shows
   *  exactly what the student gets. */
  previewMode?: boolean
  /** Fired when the student starts answering (first chat message). Used by the
   *  live session to stop auto-following the tutor. */
  onInteract?: () => void
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState('')
  const [completed, setCompleted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  // The task document shows full until the student sends their first message,
  // then auto-collapses into a pinned card (see TaskDocumentCard). Keep it
  // collapsed until the prior-chat check resolves so a returning (already
  // completed) student doesn't see it flash open then slam shut.
  const hasSentMessage = messages.some(m => m.role === 'student')

  // Restore a prior chat: if the student already completed this task, rebuild the
  // transcript (their answers, each AI response, and any follow-ups) and drop
  // straight into follow-up mode instead of showing a blank panel.
  useEffect(() => {
    let active = true
    fetch(`/api/student/assignments/${taskId}`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!active) return
        if (data?.alreadySubmitted) {
          const answersObj =
            data.existingAnswers && typeof data.existingAnswers === 'object'
              ? (data.existingAnswers as Record<string, string>)
              : {}
          const answers = Object.keys(answersObj)
            .sort((a, b) => Number(a) - Number(b))
            .map(k => String(answersObj[k]))
          const aiItems: Array<{ explanation?: string }> = data.existingAiFeedback?.items ?? []
          const followUps: Array<{ question?: string; answer?: string }> = Array.isArray(
            data.existingFollowUps
          )
            ? data.existingFollowUps
            : []
          const restored: ChatMsg[] = []
          answers.forEach(a => restored.push({ role: 'student', content: a }))
          aiItems.forEach((it, i) =>
            restored.push({ role: 'ai', content: it.explanation ?? '', re: answers[i] })
          )
          followUps.forEach(f => {
            if (f.question) restored.push({ role: 'student', content: f.question })
            if (f.answer) restored.push({ role: 'ai', content: f.answer })
          })
          if (restored.length > 0) {
            setMessages(restored)
            setCompleted(true)
          }
        }
        setLoaded(true)
      })
      .catch(() => active && setLoaded(true))
    return () => {
      active = false
    }
  }, [taskId])

  const studentAnswers = messages.filter(m => m.role === 'student').map(m => m.content)

  const post = (body: unknown) =>
    fetchWithCsrf(`/api/student/assignments/${taskId}/task-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  const addAnswer = () => {
    const a = draft.trim()
    if (!a || busy) return
    onInteract?.()
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
      if (!res.ok) throw new Error(data?.error || 'Failed to complete the task')
      const responses: Array<{ answer: string; response: string }> = Array.isArray(data.responses)
        ? data.responses
        : []
      setMessages(prev => [
        ...prev,
        ...responses.map(r => ({ role: 'ai' as const, content: r.response, re: r.answer })),
      ])
      setCompleted(true)
      onCompleted?.(answers)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to complete the task')
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
      const res = await post({ question: q, history })
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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[rgba(241,118,35,0.4)] bg-white">
      <div className="flex items-center gap-2 border-b border-orange-100 bg-orange-50/60 px-4 py-2">
        <Sparkles className="h-4 w-4 text-[#F17623]" />
        <span className="text-sm font-semibold text-gray-800">
          {completed ? 'Ask about this task' : 'Answer by chat'}
        </span>
        {completed && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Completed
          </span>
        )}
      </div>

      {/* Task document — full until the student's first message, then a pinned,
          re-expandable "document" card (kept collapsed until the prior-chat
          check resolves so a returning student doesn't see it flash). */}
      <TaskDocumentCard sourceDocument={sourceDocument} autoOpen={loaded && !hasSentMessage} />

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {!loaded && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        )}
        {loaded && messages.length === 0 && (
          <p className="text-sm leading-relaxed text-gray-500">
            {taskTitle ? <span className="font-medium text-gray-700">{taskTitle}. </span> : null}
            {previewMode ? (
              <>
                This is how the student answers this task — by chat. They send each answer, click{' '}
                <span className="font-medium text-[#9a4a12]">Task complete</span>, and the AI
                responds to each per your marking policy.
              </>
            ) : (
              <>
                Chat your answer(s) below — send each one, then click{' '}
                <span className="font-medium text-[#9a4a12]">Task complete</span>. Your tutor’s AI
                will respond to each answer, and then you can ask about anything you got wrong.
              </>
            )}
          </p>
        )}
        {messages.map((m, i) =>
          m.role === 'student' ? (
            <div key={i} className="flex justify-end">
              <span className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#F17623] px-3 py-2 text-sm text-white">
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
            {completed ? 'Thinking…' : 'Checking your answers…'}
          </div>
        )}
      </div>

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
            placeholder={completed ? 'Ask about this task or your answers…' : 'Type your answer…'}
            className="max-h-28 min-h-[40px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#F17623]"
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
        {!completed && !previewMode && (
          <button
            type="button"
            onClick={complete}
            disabled={busy || (studentAnswers.length === 0 && !draft.trim())}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#F17623] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#d9631a] disabled:opacity-50"
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
