'use client'

import { useMemo, useState } from 'react'
import type { Socket } from 'socket.io-client'
import {
  X,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ListChecks,
  Pencil,
  Check,
  ArrowLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import { TaskDocumentCard } from '@/components/task/TaskDocumentCard'
import { TaskChatPanel } from '@/app/[locale]/student/feedback/TaskChatPanel'
import { normalizeDmiQuestionType } from '@/lib/assessment/question-types'
import { sanitizeHtml } from '@/lib/security/sanitize'
import { isImportPlaceholder } from '@/lib/tasks/import-placeholder'
import { resolvePublicUrl } from '@/lib/utils'
import type { StudentDmiItem } from '@/lib/assessment/student-dmi'
import type {
  SessionRoomTask,
  SessionGradeResult,
} from '@/components/one-on-one/use-session-room-state'

/**
 * Both-sides panel showing what the tutor has deployed into the session, live.
 *
 * The deployed tasks (and, for the student, which they've already completed) are
 * owned by the classroom via `useSessionRoomState` and passed in — so opening
 * this panel late, or after a rejoin, still shows everything already deployed.
 * For a task that carries structured questions (`dmiItems`), students get answer
 * fields and a Submit that emits `task:complete` (the same event + encoding the
 * course classroom uses, which the server auto-grades by taskId). Tutors see the
 * questions read-only.
 */

/**
 * A chat task carries no structured questions — it's answered by chatting with
 * the AI (the same box the course-builder classroom uses). Mirrors the student
 * feedback page's `isChatTask`: source 'task' + no `dmiItems`.
 */
function isChatTask(t: SessionRoomTask): boolean {
  return t.source === 'task' && (!t.dmiItems || t.dmiItems.length === 0)
}

export function SessionDeployedPanel({
  sessionId,
  socket,
  isTutor,
  tasks,
  completedTaskIds,
  resultByTask,
  onClose,
}: {
  sessionId: string
  socket: Socket | null
  isTutor?: boolean
  tasks: SessionRoomTask[]
  completedTaskIds: Set<string>
  resultByTask: Record<string, SessionGradeResult>
  onClose: () => void
}) {
  // Master-detail, mirroring the course-builder "Lessons" panel: the default
  // view lists every deployed task/assessment (newest first); opening one drills
  // into its content. Nothing is auto-opened — the student picks from the list.
  const [activeId, setActiveId] = useState<string | null>(null)
  // Tasks the viewer has opened this session — everything else reads as "New",
  // like the Lessons panel's unseen badge.
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set())
  const active = activeId ? (tasks.find(t => t.id === activeId) ?? null) : null

  const openTask = (id: string) => {
    setActiveId(id)
    setSeenIds(prev => (prev.has(id) ? prev : new Set(prev).add(id)))
  }

  // Newest first, matching the reference panel's ordering.
  const orderedTasks = [...tasks].reverse()

  // A student opens a deployed task FULL-PAGE (portaled to <body> at z-30, so the
  // toolbar buttons (z-40) and the student's video (z-[35]) overlay it). Tutors
  // keep the compact side panel. The label is "Lessons" for students (matching the
  // course-builder classroom) and "Materials" for tutors.
  const studentFullPage = !!active && !isTutor
  const panelTitle = isTutor ? 'Materials' : 'Lessons'

  // Self-positioned (a direct child of the classroom root, NOT the shared z-40
  // panel container) so the full-page task shares one stacking context with the
  // toolbar (z-40) and video (z-[35]) and reliably sits under them at z-30.
  return (
    <div
      className={
        studentFullPage
          ? 'pointer-events-auto absolute inset-0 z-30 flex flex-col bg-white'
          : 'pointer-events-auto absolute bottom-3 right-3 top-16 z-40 flex w-96 flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl'
      }
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {active ? (
            <button
              onClick={() => setActiveId(null)}
              aria-label="Back to list"
              className="inline-flex items-center gap-1 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : null}
          <h3 className="truncate text-sm font-semibold text-slate-900">
            {active ? active.title : panelTitle}
          </h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-slate-500">
          Nothing shared yet. When the tutor deploys a task or material, it appears here.
        </div>
      ) : !active ? (
        /* List of every deployed task/assessment — the "Lessons" list. */
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {orderedTasks.map(t => {
            const isAssessment = (t.dmiItems?.length ?? 0) > 0 || t.source === 'assessment'
            const done = completedTaskIds.has(t.id)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => openTask(t.id)}
                className="flex w-full flex-col gap-1 rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-900">
                    {isAssessment ? (
                      <ListChecks className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                    <span className="truncate">{t.title}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : !seenIds.has(t.id) ? (
                      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white">
                        New
                      </span>
                    ) : null}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  {isAssessment ? 'Assessment' : 'Task'}
                  {t.deployedAt ? ` · Deployed ${new Date(t.deployedAt).toLocaleTimeString()}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <>
          {/* Opened item */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {active ? (
              isChatTask(active) ? (
                // A chat task (source 'task', no structured questions) is answered
                // via the AI chat — the same box as the course-builder classroom.
                // Mirrors the student feedback page: the task title + instructional
                // content sit above the panel, and the source document (if any) is
                // rendered inside TaskChatPanel (not standalone). Students get the
                // real (persisted) flow; the tutor gets a stateless interactive
                // preview (onCompleted omitted → no live completion is emitted).
                // Fill the panel as a flex column so the chat scrolls internally
                // (one scrollbar) rather than a viewport-height box inside the
                // already-scrollable parent.
                <div className="flex h-full flex-col">
                  {active.content && !isImportPlaceholder(active.content) ? (
                    <div
                      className="prose prose-sm mb-3 max-h-40 shrink-0 overflow-y-auto pr-1 text-slate-700"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(active.content) }}
                    />
                  ) : null}
                  {isTutor ? (
                    <p className="mb-3 shrink-0 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500">
                      Preview — try the chat as a student would. Nothing is saved and no completion
                      is sent to the room from here.
                    </p>
                  ) : null}
                  <div className="min-h-[320px] flex-1">
                    <TaskChatPanel
                      key={active.id}
                      taskId={active.id}
                      taskTitle={active.title}
                      sourceDocument={active.sourceDocument}
                      previewMode={!!isTutor}
                      onCompleted={
                        isTutor
                          ? undefined
                          : answers => {
                              const record: Record<string, string> = {}
                              answers.forEach((a, i) => {
                                record[String(i + 1)] = a
                              })
                              socket?.emit('task:complete', {
                                roomId: sessionId,
                                taskId: active.id,
                                answers: record,
                                aiHandled: true,
                              })
                            }
                      }
                    />
                  </div>
                </div>
              ) : active.sourceDocument &&
                active.dmiItems &&
                active.dmiItems.length > 0 &&
                studentFullPage ? (
                // Assessment with a source PDF: show the document and the answer
                // sheet side by side (stacked on a narrow/mobile viewport). The
                // full-page view has the width for it.
                <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden lg:flex-row">
                  <div className="min-h-0 flex-1">
                    <TaskDocumentCard sourceDocument={active.sourceDocument} alwaysOpen />
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <DeployedQuestions
                      key={active.id}
                      sessionId={sessionId}
                      taskId={active.id}
                      items={active.dmiItems}
                      socket={socket}
                      isTutor={isTutor}
                      alreadySubmitted={completedTaskIds.has(active.id)}
                      result={resultByTask[active.id]}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {active.sourceDocument ? (
                    <div className="h-[60vh] w-full">
                      <TaskDocumentCard sourceDocument={active.sourceDocument} alwaysOpen />
                    </div>
                  ) : (
                    <ActiveTaskBody
                      key={active.id}
                      task={active}
                      socket={socket}
                      sessionId={sessionId}
                      canEdit={!!isTutor}
                    />
                  )}

                  {active.dmiItems && active.dmiItems.length > 0 ? (
                    <DeployedQuestions
                      key={active.id}
                      sessionId={sessionId}
                      taskId={active.id}
                      items={active.dmiItems}
                      socket={socket}
                      isTutor={isTutor}
                      alreadySubmitted={completedTaskIds.has(active.id)}
                      result={resultByTask[active.id]}
                    />
                  ) : !active.sourceDocument && !active.content ? (
                    <p className="text-xs text-slate-400">This item has no preview.</p>
                  ) : null}
                </>
              )
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Renders a deployed task's title + content. For the tutor it adds an inline
 * "quick edit" of the title/content that saves to the underlying BuilderTask
 * (the shared source of truth — so the change reflects everywhere) and re-deploys
 * so the live room updates immediately. Deeper edits (questions, structure) go
 * through the classroom's "Edit course" deep-link.
 */
function ActiveTaskBody({
  task,
  socket,
  sessionId,
  canEdit,
}: {
  task: SessionRoomTask
  socket: Socket | null
  sessionId: string
  canEdit: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [content, setContent] = useState(task.content ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const t = title.trim()
    if (!t) {
      toast.error('Title cannot be empty')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/one-on-one/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, content }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || 'Could not save the edit')
        return
      }
      // Re-deploy so the live room (and every student) picks up the edit now.
      // Re-uses the same task:deploy the deploy panel emits; the server merges
      // onto the existing room task, preserving who's already completed it.
      socket?.emit('task:deploy', {
        roomId: sessionId,
        task: {
          id: task.id,
          title: t,
          content,
          source: task.source || 'task',
          dmiItems: task.dmiItems,
          deployedAt: Date.now(),
          polls: [],
          questions: [],
        },
      })
      toast.success('Saved — updated for everyone')
      setEditing(false)
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="mb-4 space-y-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
          placeholder="Task title"
        />
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={8}
          className="w-full rounded-md border border-slate-300 p-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
          placeholder="Task content (HTML allowed)…"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </button>
          <button
            onClick={() => {
              setEditing(false)
              setTitle(task.title)
              setContent(task.content ?? '')
            }}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
        <p className="text-[11px] text-slate-400">
          Saves to your course, so the change shows everywhere. For questions or structure, use
          “Edit course”.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{task.title}</p>
        {canEdit ? (
          <button
            onClick={() => setEditing(true)}
            title="Quick-edit this task"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        ) : null}
      </div>
      {/* Shown to everyone in the room (incl. students). Sanitize the tutor-authored
          HTML, and hide the auto-generated "[Imported file.docx]" placeholder — the
          attached document itself is rendered separately by TaskDocumentCard. */}
      {task.content && !isImportPlaceholder(task.content) ? (
        <div
          className="prose prose-sm mb-4 max-w-none text-slate-700"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(task.content) }}
        />
      ) : null}
    </>
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
  alreadySubmitted,
  result,
}: {
  sessionId: string
  taskId: string
  items: StudentDmiItem[]
  socket: Socket | null
  isTutor?: boolean
  alreadySubmitted?: boolean
  result?: SessionGradeResult
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState(false)
  const submitted = alreadySubmitted || justSubmitted

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
          setJustSubmitted(true)
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
    return <SubmittedResult items={items} result={result} />
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

/**
 * Present a stored answer-key value readably. mcq keys are often a bare letter
 * ("B") — expand to "B. <option>" using the item's options; multiple_response
 * keys may be a JSON array — join them; everything else shows as-is.
 */
function formatCorrectAnswer(item: StudentDmiItem, raw: string | undefined): string | null {
  if (raw == null || raw.trim().length === 0) return null
  const type = normalizeDmiQuestionType(item.questionType)
  if (type === 'mcq' && item.options && item.options.length > 0 && /^[A-Za-z]$/.test(raw.trim())) {
    const idx = raw.trim().toUpperCase().charCodeAt(0) - 65
    if (idx >= 0 && idx < item.options.length)
      return `${raw.trim().toUpperCase()}. ${item.options[idx]}`
  }
  if (type === 'multiple_response') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter(v => typeof v === 'string').join(', ') || raw
    } catch {
      // fall through
    }
  }
  return raw
}

/**
 * The student's post-submit view. Shows their auto-grade score and a per-question
 * outcome once the grade lands (via task:graded), degrading to a plain "submitted"
 * acknowledgement while it's pending or when the task can't be auto-scored. When
 * the tutor's answer-reveal policy permits it, `result.correctAnswers` is present
 * and the correct answer is shown under each question.
 */
function SubmittedResult({
  items,
  result,
}: {
  items: StudentDmiItem[]
  result?: SessionGradeResult
}) {
  const resultById = useMemo(() => {
    const map = new Map<string, { correct: boolean; needsReview?: boolean }>()
    for (const r of result?.questionResults ?? []) {
      map.set(r.questionId, { correct: r.correct, needsReview: r.needsReview })
    }
    return map
  }, [result])

  const correctAnswers = result?.correctAnswers ?? null
  const hasScore = result && typeof result.score === 'number'
  const graded = (result?.questionResults?.length ?? 0) > 0

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        <p className="text-sm font-semibold text-emerald-800">Submitted</p>
        {hasScore ? (
          <p className="text-2xl font-bold text-emerald-700">{Math.round(result!.score!)}%</p>
        ) : (
          <p className="text-xs text-emerald-700">
            Your tutor has your answers. They’ll appear in your feedback.
          </p>
        )}
      </div>

      {graded ? (
        <ol className="space-y-1.5">
          {items.map((it, idx) => {
            const r = resultById.get(it.id)
            // Only reveal the correct answer where it adds something — i.e. the
            // student didn't already get it right.
            const reveal =
              correctAnswers && !r?.correct ? formatCorrectAnswer(it, correctAnswers[it.id]) : null
            return (
              <li
                key={it.id}
                className="flex items-start gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-xs"
              >
                {r?.needsReview ? (
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                ) : r?.correct ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                )}
                <span className="min-w-0 text-slate-700">
                  <span className="font-medium text-slate-500">
                    {it.questionLabel || it.questionNumber || idx + 1}.
                  </span>{' '}
                  {r?.needsReview
                    ? 'Sent to your tutor to review'
                    : r?.correct
                      ? 'Correct'
                      : 'Incorrect'}
                  {reveal ? (
                    <span className="mt-0.5 block text-emerald-700">Answer: {reveal}</span>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ol>
      ) : null}
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

  // Matching & drag-and-drop — assign each prompt to a bank option via a
  // dropdown. Both store the same JSON map { prompt: choice } the course
  // classroom uses, so the tutor's review renders them identically.
  if (
    (type === 'matching' || type === 'drag_drop') &&
    item.matchPrompts &&
    item.matchPrompts.length > 0
  ) {
    const bank = (item.matchBank ?? []).slice().sort((a, b) => a.localeCompare(b))
    let map: Record<string, string> = {}
    try {
      const parsed = value ? JSON.parse(value) : {}
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) map = parsed
    } catch {
      map = {}
    }
    const setMatch = (prompt: string, choice: string) =>
      onValueChange(JSON.stringify({ ...map, [prompt]: choice }))
    return (
      <div className="space-y-2">
        {item.matchPrompts.map(prompt => (
          <div key={prompt} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 text-slate-800">{prompt}</span>
            <span className="shrink-0 text-slate-300">→</span>
            <select
              value={map[prompt] ?? ''}
              onChange={e => setMatch(prompt, e.target.value)}
              className={'w-40 shrink-0 ' + baseField}
            >
              <option value="">Choose…</option>
              {bank.map(b => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    )
  }

  // Hotspot — click the point on the image; stored as a { x, y } fraction (0–1),
  // matching the course classroom. The correct region stays tutor-side.
  if (type === 'hotspot') {
    const imageUrl = resolvePublicUrl(item.hotspotImageUrl)
    if (imageUrl) {
      let point: { x: number; y: number } | null = null
      try {
        const parsed = value ? JSON.parse(value) : null
        if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') point = parsed
      } catch {
        point = null
      }
      const onPick = (e: React.MouseEvent<HTMLImageElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        if (!rect.width || !rect.height) return
        const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
        onValueChange(JSON.stringify({ x, y }))
      }
      return (
        <div className="space-y-1">
          <p className="text-xs text-slate-500">Click the correct spot on the image.</p>
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Hotspot"
              onClick={onPick}
              className="max-h-[280px] max-w-full cursor-crosshair rounded-md border border-slate-200"
            />
            {point ? (
              <span
                className="pointer-events-none absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow"
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
              />
            ) : null}
          </div>
        </div>
      )
    }
  }

  // Long / ordering / anything else — free-text fallback so the student is never
  // stuck. (Open-ended answers go to the tutor for review rather than auto-marking.)
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
