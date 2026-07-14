'use client'

import { useMemo, useState } from 'react'
import { X, Users, CheckCircle2 } from 'lucide-react'
import { normalizeDmiQuestionType } from '@/lib/assessment/question-types'
import type { StudentDmiItem } from '@/lib/assessment/student-dmi'
import type {
  SessionRoomTask,
  SessionStudentResponse,
} from '@/components/one-on-one/use-session-room-state'

/**
 * Tutor-only, read-only panel: who has answered each deployed task in this live
 * session, and what they answered. The deployed tasks and their submissions are
 * owned by the classroom (`useSessionRoomState`) and passed in, so opening this
 * panel late — or after a rejoin — still shows everything already submitted. The
 * auto-grade score lands asynchronously in the tutor's grading views; this is
 * the live pulse.
 */
export function SessionResponsesPanel({
  tasks,
  responsesByTask,
  onClose,
}: {
  tasks: SessionRoomTask[]
  responsesByTask: Record<string, Record<string, SessionStudentResponse>>
  onClose: () => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  // Only tasks with questions can gather responses.
  const answerable = useMemo(() => tasks.filter(t => (t.dmiItems?.length ?? 0) > 0), [tasks])
  const active =
    answerable.find(t => t.id === activeId) ?? answerable[answerable.length - 1] ?? null
  const activeResponses = useMemo(
    () => (active ? Object.values(responsesByTask[active.id] ?? {}) : []),
    [responsesByTask, active]
  )

  return (
    <div className="pointer-events-auto flex h-full w-96 flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Live responses</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {answerable.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-slate-500">
          Deploy a task with questions, and student answers will stream in here as they submit.
        </div>
      ) : (
        <>
          {/* Deployed-task tabs with a live answered-count. */}
          <div className="flex flex-wrap gap-1.5 border-b p-2">
            {answerable.map(t => {
              const count = Object.keys(responsesByTask[t.id] ?? {}).length
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ' +
                    (t.id === active?.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                  }
                >
                  <Users className="h-3 w-3" />
                  <span className="max-w-[7rem] truncate">{t.title}</span>
                  {count > 0 ? (
                    <span
                      className={
                        'rounded-full px-1.5 text-[10px] font-bold ' +
                        (t.id === active?.id
                          ? 'bg-white/25 text-white'
                          : 'bg-blue-100 text-blue-700')
                      }
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {!active ? null : activeResponses.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-xs text-slate-500">
                No submissions yet for “{active.title}”.
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {activeResponses
                  .slice()
                  .sort((a, b) => a.completedAt - b.completedAt)
                  .map(r => (
                    <li key={r.studentId} className="rounded-xl border border-slate-200 p-3">
                      <div className="mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm font-semibold text-slate-900">
                          {r.studentName}
                        </span>
                        {typeof r.score === 'number' ? (
                          <span
                            className={
                              'ml-auto rounded-full px-2 py-0.5 text-xs font-bold ' +
                              (r.score >= 70
                                ? 'bg-emerald-100 text-emerald-700'
                                : r.score >= 40
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-rose-100 text-rose-700')
                            }
                            title="Auto-graded score (tutor can override in grading)"
                          >
                            {Math.round(r.score)}%
                          </span>
                        ) : null}
                      </div>
                      <ResponseAnswers item={active} answers={r.answers} />
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Renders one student's answers, labelled against the task's questions. */
function ResponseAnswers({
  item,
  answers,
}: {
  item: SessionRoomTask
  answers: Record<string, string>
}) {
  const dmiItems = item.dmiItems ?? []
  // Fall back to the answer keys themselves if we never saw the questions.
  const rows =
    dmiItems.length > 0
      ? dmiItems.map(q => ({ q, value: answers[q.id] }))
      : Object.entries(answers).map(([id, value]) => ({
          q: { id, questionNumber: 0, questionText: id } as StudentDmiItem,
          value,
        }))

  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map(({ q, value }, i) => (
        <li key={q.id} className="text-xs">
          <span className="font-medium text-slate-500">
            {q.questionLabel || q.questionNumber || i + 1}.
          </span>{' '}
          <span className="text-slate-700">{decodeAnswer(q, value)}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Turn a stored answer back into something readable, matching how the student
 * field encoded it: mcq stores a letter, multiple_response a JSON array of
 * option texts, everything else the raw text.
 */
function decodeAnswer(item: StudentDmiItem, value: string | undefined): string {
  if (value == null || value.trim().length === 0) return '—'
  const type = normalizeDmiQuestionType(item.questionType)
  if (type === 'mcq' && item.options && item.options.length > 0) {
    const idx = value.charCodeAt(0) - 65
    const opt = idx >= 0 && idx < item.options.length ? item.options[idx] : null
    return opt ? `${value}. ${opt}` : value
  }
  if (type === 'multiple_response') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.filter(v => typeof v === 'string').join(', ') || '—'
    } catch {
      // fall through to raw
    }
  }
  return value
}
