'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  X,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  CircleDashed,
  FileText,
  Loader2,
  ListChecks,
  Download,
  ExternalLink,
} from 'lucide-react'
import { decodeStudentAnswer } from '@/lib/assessment/decode-student-answer'
import type { StudentDmiItem } from '@/lib/assessment/student-dmi'
import type { AutoGradeQuestionResult } from '@/lib/grading/auto-grade'
import type { SessionRoomTask, SessionStudentResponse } from './use-session-room-state'

/**
 * Tutor-only, rich per-session Submissions panel — the in-session counterpart of
 * the course-builder classroom's Submissions tab. It fetches the persisted
 * submissions + grading reports for THIS session's deployed tasks
 * (`/api/tutor/live-sessions/[sessionId]/submissions`) and overlays the live
 * socket pulse (`responsesByTask`) on top, so a "Task Complete" shows instantly
 * and its auto-grade / tutor report fills in as it lands. For each deployed task
 * it lists every roster student with a status + score, expandable to the full
 * answers (with per-question correctness), the grading report (strengths /
 * weaknesses / comments), and any AI / tutor feedback.
 */

interface ApiSubmission {
  submissionId: string
  taskId: string
  studentId: string
  status: string
  score: number | null
  maxScore: number
  submittedAt: string | Date
  answers?: Record<string, string> | null
  questionResults?: AutoGradeQuestionResult[] | null
  aiFeedback?: unknown
  tutorFeedback?: string | null
}
interface ApiReport {
  id: string
  studentId: string
  taskId: string | null
  status: string
  strengths: unknown
  weaknesses: unknown
  overallComments: string | null
  score: number | null
  sentAt: string | Date | null
}
interface ApiDeployed {
  id: string
  itemId: string
  type: string
  title: string
  deployedAt: string | Date | null
}
interface ApiResponse {
  participants: { studentId: string; studentName: string | null }[]
  enrolled: { studentId: string; studentName: string | null }[]
  deployed: ApiDeployed[]
  submissions: ApiSubmission[]
  reports: ApiReport[]
}

type MergedRow = {
  studentId: string
  name: string
  submitted: boolean
  status: string
  score: number | null
  maxScore: number | null
  answers: Record<string, string> | null
  questionResults: AutoGradeQuestionResult[] | null
  report: ApiReport | null
  aiFeedback: unknown
  tutorFeedback: string | null
  submittedAt: string | Date | null
}

export function SessionSubmissionsPanel({
  sessionId,
  tasks,
  responsesByTask,
  students,
  onClose,
}: {
  sessionId: string
  tasks: SessionRoomTask[]
  responsesByTask: Record<string, Record<string, SessionStudentResponse>>
  students: Array<{ userId: string; name: string }>
  onClose: () => void
}) {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [ungradedOnly, setUngradedOnly] = useState(false)

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/tutor/live-sessions/${sessionId}/submissions`, {
          credentials: 'include',
        })
        if (!res.ok) {
          throw new Error(res.status === 404 ? 'Session not found' : `Server error (${res.status})`)
        }
        setData((await res.json()) as ApiResponse)
      } catch (e) {
        // A load failure still leaves the live pulse usable, so only surface the
        // message when we have nothing else to show.
        setError(e instanceof Error ? e.message : 'Failed to load submissions')
      } finally {
        setLoading(false)
      }
    },
    [sessionId]
  )

  useEffect(() => {
    load()
  }, [load])

  // Re-pull the persisted rows shortly after new live submissions arrive, so the
  // auto-grade score + tutor report land without a manual refresh.
  const liveCount = useMemo(
    () => Object.values(responsesByTask).reduce((n, m) => n + Object.keys(m).length, 0),
    [responsesByTask]
  )
  useEffect(() => {
    if (liveCount === 0) return
    const t = setTimeout(() => load({ quiet: true }), 1500)
    return () => clearTimeout(t)
  }, [liveCount, load])

  // studentId → display name (live roster ∪ session participants ∪ enrolled ∪
  // names seen on live responses). Live roster wins for the freshest name.
  const roster = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of data?.enrolled ?? [])
      if (e.studentId) m.set(e.studentId, e.studentName || 'Student')
    for (const p of data?.participants ?? [])
      if (p.studentId) m.set(p.studentId, p.studentName || m.get(p.studentId) || 'Student')
    for (const byS of Object.values(responsesByTask))
      for (const r of Object.values(byS))
        if (r.studentId && !m.has(r.studentId)) m.set(r.studentId, r.studentName || 'Student')
    for (const s of students) if (s.userId) m.set(s.userId, s.name || m.get(s.userId) || 'Student')
    return m
  }, [data, responsesByTask, students])

  // Deployed tasks that can gather submissions: live answerable tasks ∪ any task
  // that already has a persisted submission. Live tasks carry `dmiItems` (used to
  // label answers), so prefer them.
  const taskList = useMemo(() => {
    const byId = new Map<string, { id: string; title: string; dmiItems?: StudentDmiItem[] }>()
    for (const t of tasks)
      if ((t.dmiItems?.length ?? 0) > 0)
        byId.set(t.id, { id: t.id, title: t.title, dmiItems: t.dmiItems })
    const subTaskIds = new Set((data?.submissions ?? []).map(s => s.taskId))
    const titleByItem = new Map((data?.deployed ?? []).map(d => [d.itemId, d.title]))
    for (const taskId of subTaskIds)
      if (!byId.has(taskId))
        byId.set(taskId, { id: taskId, title: titleByItem.get(taskId) || 'Task' })
    return [...byId.values()]
  }, [tasks, data])

  const activeTask =
    taskList.find(t => t.id === activeTaskId) ?? taskList[taskList.length - 1] ?? null

  const rows: MergedRow[] = useMemo(() => {
    if (!activeTask) return []
    const subByStudent = new Map<string, ApiSubmission>()
    for (const s of data?.submissions ?? [])
      if (s.taskId === activeTask.id) subByStudent.set(s.studentId, s)
    const reportByStudent = new Map<string, ApiReport>()
    for (const r of data?.reports ?? [])
      if (r.taskId === activeTask.id) reportByStudent.set(r.studentId, r)
    const liveByStudent = responsesByTask[activeTask.id] ?? {}
    return [...roster.entries()]
      .map(([studentId, name]) => {
        const sub = subByStudent.get(studentId)
        const live = liveByStudent[studentId]
        const report = reportByStudent.get(studentId) ?? null
        return {
          studentId,
          name,
          submitted: !!sub || !!live,
          status: sub?.status ?? (live ? 'submitted' : 'not_submitted'),
          score: sub?.score ?? live?.score ?? null,
          maxScore: sub?.maxScore ?? null,
          answers: sub?.answers ?? live?.answers ?? null,
          questionResults: sub?.questionResults ?? live?.questionResults ?? null,
          report,
          aiFeedback: sub?.aiFeedback,
          tutorFeedback: sub?.tutorFeedback ?? null,
          submittedAt: sub?.submittedAt ?? null,
        }
      })
      .sort((a, b) => Number(b.submitted) - Number(a.submitted) || a.name.localeCompare(b.name))
  }, [activeTask, data, responsesByTask, roster])

  const submittedCount = rows.filter(r => r.submitted).length
  // Submitted but not yet graded/sent — the queue the tutor still needs to action.
  const needsGrading = rows.filter(r => r.submitted && !isGraded(r)).length
  const visibleRows = ungradedOnly ? rows.filter(r => r.submitted && !isGraded(r)) : rows

  const exportCsv = () => {
    if (!activeTask) return
    const header = ['Student', 'Status', 'Score', 'Max', 'Submitted at']
    const lines = rows.map(r =>
      [
        r.name,
        statusBadge(r).label,
        r.score ?? '',
        r.maxScore ?? '',
        r.submittedAt ? new Date(r.submittedAt).toISOString() : '',
      ]
        .map(csvCell)
        .join(',')
    )
    const csv = [header.join(','), ...lines].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `submissions-${slug(activeTask.title)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="pointer-events-auto flex h-full w-[30rem] max-w-[92vw] flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <ListChecks className="h-4 w-4 text-blue-600" />
          Submissions
        </h3>
        <div className="flex items-center gap-1">
          {taskList.length > 0 ? (
            <button
              onClick={exportCsv}
              aria-label="Export CSV"
              title="Download all of this task's submissions as CSV"
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <Download className="h-4 w-4" />
            </button>
          ) : null}
          <button
            onClick={() => load()}
            aria-label="Refresh"
            title="Refresh"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : taskList.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-slate-500">
          {error
            ? error
            : 'Deploy a task with questions, and student submissions will appear here as they complete it.'}
        </div>
      ) : (
        <>
          {/* Deployed-task selector with a submitted count. */}
          <div className="flex flex-wrap gap-1.5 border-b p-2">
            {taskList.map(t => {
              const count = rowsSubmittedFor(t.id, data, responsesByTask, roster)
              const isActive = t.id === activeTask?.id
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTaskId(t.id)
                    setExpanded(null)
                  }}
                  className={
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ' +
                    (isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                  }
                >
                  <span className="max-w-[8rem] truncate">{t.title}</span>
                  {count > 0 ? (
                    <span
                      className={
                        'rounded-full px-1.5 text-[10px] font-bold ' +
                        (isActive ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-700')
                      }
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          {activeTask ? (
            <div className="flex items-center justify-between gap-2 border-b bg-slate-50 px-4 py-1.5 text-[11px] text-slate-500">
              <span className="shrink-0">
                {submittedCount}/{rows.length || '—'} submitted
                {needsGrading > 0 ? (
                  <span className="ml-1 text-violet-600">· {needsGrading} to grade</span>
                ) : null}
              </span>
              <button
                onClick={() => setUngradedOnly(v => !v)}
                className={
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
                  (ungradedOnly
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300')
                }
                title="Show only submitted work that still needs grading"
              >
                {ungradedOnly ? 'Showing: to grade' : 'Show all'}
              </button>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {rows.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-xs text-slate-500">
                No students on this session yet.
              </div>
            ) : visibleRows.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-xs text-slate-500">
                Nothing left to grade for “{activeTask?.title}”.
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {visibleRows.map(r => (
                  <StudentSubmissionRow
                    key={r.studentId}
                    row={r}
                    task={activeTask}
                    expanded={expanded === r.studentId}
                    onToggle={() => setExpanded(cur => (cur === r.studentId ? null : r.studentId))}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Count of students who have submitted a given task (persisted ∪ live). */
function rowsSubmittedFor(
  taskId: string,
  data: ApiResponse | null,
  responsesByTask: Record<string, Record<string, SessionStudentResponse>>,
  roster: Map<string, string>
): number {
  const ids = new Set<string>()
  for (const s of data?.submissions ?? [])
    if (s.taskId === taskId && roster.has(s.studentId)) ids.add(s.studentId)
  for (const sid of Object.keys(responsesByTask[taskId] ?? {})) if (roster.has(sid)) ids.add(sid)
  return ids.size
}

function StudentSubmissionRow({
  row,
  task,
  expanded,
  onToggle,
}: {
  row: MergedRow
  task: { id: string; title: string; dmiItems?: StudentDmiItem[] } | null
  expanded: boolean
  onToggle: () => void
}) {
  const badge = statusBadge(row)
  const hasDetail = row.submitted
  return (
    <li className="rounded-xl border border-slate-200">
      <button
        onClick={hasDetail ? onToggle : undefined}
        className={
          'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left ' +
          (hasDetail ? 'hover:bg-slate-50' : 'cursor-default')
        }
      >
        {hasDetail ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          )
        ) : (
          <CircleDashed className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
          {row.name}
        </span>
        {scoreLabel(row) ? (
          <span className="shrink-0 text-xs font-semibold text-slate-500">{scoreLabel(row)}</span>
        ) : null}
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
      </button>

      {expanded && hasDetail ? (
        <div className="border-t px-3 py-3">
          <SubmissionDetail row={row} task={task} />
        </div>
      ) : null}
    </li>
  )
}

function SubmissionDetail({
  row,
  task,
}: {
  row: MergedRow
  task: { id: string; title: string; dmiItems?: StudentDmiItem[] } | null
}) {
  const resultByQid = new Map((row.questionResults ?? []).map(q => [q.questionId, q]))
  const dmiItems = task?.dmiItems ?? []
  const answers = row.answers ?? {}
  const answerRows =
    dmiItems.length > 0
      ? dmiItems.map(q => ({ q, value: answers[q.id], result: resultByQid.get(q.id) }))
      : Object.entries(answers).map(([id, value]) => ({
          q: { id, questionNumber: 0, questionText: id } as StudentDmiItem,
          value,
          result: resultByQid.get(id),
        }))

  const strengths = toStringList(row.report?.strengths)
  const weaknesses = toStringList(row.report?.weaknesses)
  const aiText = feedbackText(row.aiFeedback)

  return (
    <div className="flex flex-col gap-3 text-xs">
      {row.submittedAt ? (
        <p className="text-[11px] text-slate-400">
          Submitted {new Date(row.submittedAt).toLocaleString()}
        </p>
      ) : null}

      {/* Answers with per-question correctness. */}
      {answerRows.length > 0 ? (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Answers
          </p>
          <ol className="flex flex-col gap-1.5">
            {answerRows.map(({ q, value, result }, i) => (
              <li key={q.id} className="flex items-start gap-1.5">
                {result ? (
                  result.needsReview ? (
                    <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  ) : result.correct ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                  )
                ) : (
                  <span className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="font-medium text-slate-500">
                    {q.questionLabel || q.questionNumber || i + 1}.
                  </span>{' '}
                  <span className="text-slate-700">{decodeStudentAnswer(q, value)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {/* Grading report. */}
      {row.report ? (
        <div className="rounded-lg bg-slate-50 p-2.5">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <FileText className="h-3 w-3" /> Report
            <span className="ml-auto rounded-full bg-slate-200 px-1.5 text-[9px] normal-case text-slate-600">
              {row.report.status}
            </span>
          </p>
          {strengths.length > 0 ? (
            <div className="mb-1">
              <span className="font-semibold text-emerald-700">Strengths:</span>
              <ul className="ml-3 list-disc text-slate-600">
                {strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {weaknesses.length > 0 ? (
            <div className="mb-1">
              <span className="font-semibold text-rose-700">To improve:</span>
              <ul className="ml-3 list-disc text-slate-600">
                {weaknesses.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {row.report.overallComments ? (
            <p className="whitespace-pre-wrap text-slate-600">{row.report.overallComments}</p>
          ) : null}
        </div>
      ) : null}

      {row.tutorFeedback ? (
        <div>
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Tutor feedback
          </p>
          <p className="whitespace-pre-wrap text-slate-700">{row.tutorFeedback}</p>
        </div>
      ) : null}

      {aiText ? (
        <div>
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            AI feedback
          </p>
          <p className="whitespace-pre-wrap text-slate-600">{aiText}</p>
        </div>
      ) : null}

      {!answerRows.length && !row.report && !row.tutorFeedback && !aiText ? (
        <p className="text-slate-400">Submitted — no detail captured.</p>
      ) : null}

      {/* Jump to the full grading / report workspace for this student (new tab). */}
      <a
        href={`/tutor/reports/${row.studentId}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-fit items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
      >
        <ExternalLink className="h-3 w-3" />
        Grade &amp; report
      </a>
    </div>
  )
}

function isGraded(row: MergedRow): boolean {
  return (row.status || '').toLowerCase() === 'graded' || row.report?.status === 'sent'
}

/** Score as a percentage (maxScore 100 or unknown) or raw points/max otherwise. */
function scoreLabel(row: MergedRow): string | null {
  if (typeof row.score !== 'number') return null
  if (row.maxScore == null || row.maxScore === 100) return `${Math.round(row.score)}%`
  return `${Math.round(row.score)}/${row.maxScore}`
}

function csvCell(v: unknown): string {
  let s = String(v ?? '')
  // Neutralise spreadsheet formula injection: a cell a spreadsheet would treat
  // as a formula (leading = + - @) is prefixed with a quote so it stays text.
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'task'
  )
}

function statusBadge(row: MergedRow): { label: string; className: string } {
  const s = (row.status || '').toLowerCase()
  const graded = s === 'graded' || row.report?.status === 'sent'
  if (graded) return { label: 'Graded', className: 'bg-emerald-100 text-emerald-700' }
  // A report that exists but isn't sent yet (requested/draft) = grading underway.
  if (row.report) return { label: 'Grading', className: 'bg-violet-100 text-violet-700' }
  if (row.submitted) return { label: 'Submitted', className: 'bg-blue-100 text-blue-700' }
  return { label: 'Not submitted', className: 'bg-slate-100 text-slate-400' }
}

function toStringList(v: unknown): string[] {
  if (Array.isArray(v))
    return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  return []
}

/** Best-effort human string out of the jsonb aiFeedback blob. */
function feedbackText(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['summary', 'overall', 'feedback', 'comment', 'text']) {
      if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim()
    }
  }
  return null
}
