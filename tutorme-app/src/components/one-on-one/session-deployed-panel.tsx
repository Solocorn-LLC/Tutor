'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { X, FileText, Loader2, CheckCircle2, ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import { TaskDocumentCard } from '@/components/task/TaskDocumentCard'
import { normalizeDmiQuestionType } from '@/lib/assessment/question-types'
import type { StudentDmiItem } from '@/lib/assessment/student-dmi'

interface SourceDocument {
  fileName: string
  fileUrl: string
  fileKey?: string
  mimeType: string
}

interface DeployedTask {
  id: string
  title: string
  content?: string
  source?: string
  dmiItems?: StudentDmiItem[]
  sourceDocument?: SourceDocument
}

/**
 * Both-sides panel showing what the tutor has deployed into the session, live.
 * Listens to the same `task:deployed` / `task:updated` room events the course
 * classroom uses (already broadcast for any session id), so it needs no course.
 *
 * For a deployed task that carries structured questions (`dmiItems`), students
 * get answer fields and a Submit that emits `task:complete` — the same event the
 * course classroom uses, which the server auto-grades against the answer key it
 * reloads by taskId (never sent to the client). Tutors see the questions
 * read-only (they authored them).
 */
export function SessionDeployedPanel({
  sessionId,
  socket,
  isTutor,
  onClose,
}: {
  sessionId: string
  socket: Socket | null
  isTutor?: boolean
  onClose: () => void
}) {
  const [deployed, setDeployed] = useState<DeployedTask[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (!socket) return
    const upsert = (task: DeployedTask) =>
      setDeployed(prev =>
        prev.some(t => t.id === task.id)
          ? prev.map(t => (t.id === task.id ? { ...t, ...task } : t))
          : [...prev, task]
      )
    const onDeployed = (task: DeployedTask) => {
      if (!task?.id) return
      upsert(task)
      setActiveId(task.id)
    }
    const onUpdated = (payload: { task: DeployedTask }) => {
      if (payload?.task?.id) upsert(payload.task)
    }
    socket.on('task:deployed', onDeployed)
    socket.on('task:updated', onUpdated)
    return () => {
      socket.off('task:deployed', onDeployed)
      socket.off('task:updated', onUpdated)
    }
  }, [socket])

  const active = deployed.find(t => t.id === activeId) ?? null

  return (
    <div className="pointer-events-auto flex h-full w-96 flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Materials</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {deployed.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-slate-500">
          Nothing shared yet. When the tutor deploys a task or material, it appears here.
        </div>
      ) : (
        <>
          {/* Tabs of deployed items */}
          <div className="flex flex-wrap gap-1.5 border-b p-2">
            {deployed.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ' +
                  (t.id === activeId
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                }
              >
                {t.dmiItems && t.dmiItems.length > 0 ? (
                  <ListChecks className="h-3 w-3" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                <span className="max-w-[8rem] truncate">{t.title}</span>
              </button>
            ))}
          </div>

          {/* Active item */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {active ? (
              <>
                <p className="mb-3 text-sm font-semibold text-slate-900">{active.title}</p>
                {active.sourceDocument ? (
                  <div className="h-[60vh] w-full">
                    <TaskDocumentCard sourceDocument={active.sourceDocument} alwaysOpen />
                  </div>
                ) : active.content ? (
                  <div
                    className="prose prose-sm mb-4 max-w-none text-slate-700"
                    // Tutor-authored task content, shown to their own session.
                    dangerouslySetInnerHTML={{ __html: active.content }}
                  />
                ) : null}

                {active.dmiItems && active.dmiItems.length > 0 ? (
                  <DeployedQuestions
                    key={active.id}
                    sessionId={sessionId}
                    taskId={active.id}
                    items={active.dmiItems}
                    socket={socket}
                    isTutor={isTutor}
                  />
                ) : !active.sourceDocument && !active.content ? (
                  <p className="text-xs text-slate-400">This item has no preview.</p>
                ) : null}
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The answer sheet for a deployed task's structured questions. Students fill it
 * in and submit once; tutors see the same prompts read-only. Answer encoding
 * mirrors the course-classroom feedback page so the server's auto-grader (which
 * compares by item id) scores it the same way.
 */
function DeployedQuestions({
  sessionId,
  taskId,
  items,
  socket,
  isTutor,
}: {
  sessionId: string
  taskId: string
  items: StudentDmiItem[]
  socket: Socket | null
  isTutor?: boolean
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const answeredCount = useMemo(
    () => items.filter(it => (answers[it.id] ?? '').trim().length > 0).length,
    [answers, items]
  )

  const submit = () => {
    if (!socket) {
      toast.error('Still connecting — try again in a moment.')
      return
    }
    // Only send non-empty answers, keyed by item id (the grader matches by id).
    const payload: Record<string, string> = {}
    for (const it of items) {
      const v = (answers[it.id] ?? '').trim()
      if (v.length > 0) payload[it.id] = v
    }
    if (Object.keys(payload).length === 0) {
      toast.error('Answer at least one question before submitting.')
      return
    }
    setSubmitting(true)
    socket
      .timeout(20000)
      .emit(
        'task:complete',
        { roomId: sessionId, taskId, answers: payload },
        (err: unknown, resp?: { ok: boolean; error?: string }) => {
          setSubmitting(false)
          if (err || !resp?.ok) {
            toast.error(resp?.error || 'Could not submit — please try again.')
            return
          }
          setSubmitted(true)
          toast.success('Answers submitted')
        }
      )
  }

  if (isTutor) {
    return (
      <div className="space-y-4">
        {items.map((it, idx) => (
          <QuestionBlock key={it.id} item={it} index={idx}>
            <p className="text-[11px] italic text-slate-400">
              Students answer this live; you’ll see responses in your grading views.
            </p>
          </QuestionBlock>
        ))}
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        <p className="text-sm font-semibold text-emerald-800">Submitted</p>
        <p className="text-xs text-emerald-700">
          Your tutor has your answers. They’ll appear in your feedback.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((it, idx) => (
        <QuestionBlock key={it.id} item={it} index={idx}>
          <SessionDmiAnswerField
            item={it}
            value={answers[it.id] ?? ''}
            onValueChange={next => setAnswers(prev => ({ ...prev, [it.id]: next }))}
          />
        </QuestionBlock>
      ))}

      <div className="sticky bottom-0 -mx-4 border-t bg-white/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Submit answers
              <span className="text-xs font-normal text-blue-100">
                ({answeredCount}/{items.length})
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function QuestionBlock({
  item,
  index,
  children,
}: {
  item: StudentDmiItem
  index: number
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1 text-[11px] font-semibold text-slate-600">
          {item.questionLabel || item.questionNumber || index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-800">{item.questionText}</p>
          {typeof item.marks === 'number' && item.marks > 0 ? (
            <p className="mt-0.5 text-[11px] text-slate-400">
              {item.marks} mark{item.marks === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  )
}

/**
 * A single answer field. Encoding matches the course-classroom feedback page so
 * the shared server auto-grader scores it identically:
 *   - mcq → the option LETTER (A, B, …)
 *   - true_false → the option text ('True' / 'False')
 *   - multiple_response → JSON array string of selected option texts
 *   - short / fill_blank / long / other → raw text
 */
function SessionDmiAnswerField({
  item,
  value,
  onValueChange,
}: {
  item: StudentDmiItem
  value: string
  onValueChange: (next: string) => void
}) {
  const type = normalizeDmiQuestionType(item.questionType)
  const options =
    item.options && item.options.length > 0
      ? item.options
      : type === 'true_false'
        ? ['True', 'False']
        : []
  const baseField =
    'w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none'

  // Multiple choice — clickable LETTER chips (A–…); the letter is stored.
  if (type === 'mcq' && options.length > 0) {
    return (
      <div className="space-y-1.5">
        {options.map((opt, i) => {
          const letter = String.fromCharCode(65 + i)
          const selected = value === letter
          return (
            <button
              key={letter}
              type="button"
              onClick={() => onValueChange(letter)}
              className={
                'flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors ' +
                (selected
                  ? 'border-blue-500 bg-blue-50 text-blue-900'
                  : 'border-slate-200 text-slate-700 hover:border-blue-300')
              }
            >
              <span
                className={
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                  (selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600')
                }
              >
                {letter}
              </span>
              <span className="min-w-0">{opt}</span>
            </button>
          )
        })}
      </div>
    )
  }

  // True / False — radios.
  if (type === 'true_false' && options.length > 0) {
    return (
      <div className="space-y-1.5">
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="radio"
              name={`dmi-${item.id}`}
              checked={value === opt}
              onChange={() => onValueChange(opt)}
              className="h-4 w-4 accent-blue-600"
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    )
  }

  // Multi-select — checkboxes; stored as a JSON array string of option texts.
  if (type === 'multiple_response' && options.length > 0) {
    let selected: string[] = []
    try {
      const parsed = value ? JSON.parse(value) : []
      if (Array.isArray(parsed)) selected = parsed.filter((v): v is string => typeof v === 'string')
    } catch {
      selected = []
    }
    const toggle = (opt: string) => {
      const next = selected.includes(opt) ? selected.filter(o => o !== opt) : [...selected, opt]
      onValueChange(JSON.stringify(next))
    }
    return (
      <div className="space-y-1.5">
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
              className="h-4 w-4 accent-blue-600"
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    )
  }

  // Short / fill-in — single-line input.
  if (type === 'short' || type === 'fill_blank') {
    return (
      <input
        type="text"
        value={value}
        onChange={e => onValueChange(e.target.value)}
        placeholder={type === 'fill_blank' ? 'Fill in the blank…' : 'Type your answer…'}
        className={baseField}
      />
    )
  }

  // Long / matching / drag_drop / hotspot / anything else — free-text fallback so
  // the student is never stuck. (Matching/hotspot degrade to describing the
  // answer; those go to the tutor for review rather than auto-marking.)
  return (
    <textarea
      value={value}
      onChange={e => onValueChange(e.target.value)}
      rows={3}
      placeholder="Type your answer…"
      className={baseField + ' resize-y'}
    />
  )
}
