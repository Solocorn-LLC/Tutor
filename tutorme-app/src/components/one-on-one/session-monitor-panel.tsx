'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { toast } from 'sonner'
import {
  X,
  RefreshCw,
  MessageSquare,
  Send,
  Loader2,
  Users,
  Sparkles,
  LayoutGrid,
} from 'lucide-react'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import type {
  SessionRosterStudent,
  SessionRoomTask,
  SessionStudentResponse,
} from './use-session-room-state'

/**
 * Tutor-only live Monitor for the session — the in-session counterpart of the
 * course-builder classroom's monitoring panel, scoped to this room's roster. Per
 * student it shows: presence, live engagement + a status badge (from the socket
 * `student_state_update` signal), real **understanding %** (from
 * `/api/tutor/live-sessions/[sessionId]/comprehension`, derived from graded
 * submissions), and tasks-done this session. The tutor can send a private nudge
 * (`tutor:direct_message`) that surfaces as a toast on that student's screen.
 */
export function SessionMonitorPanel({
  sessionId,
  socket,
  students,
  tasks,
  responsesByTask,
  onViewBoard,
  onClose,
}: {
  sessionId: string
  socket: Socket | null
  students: SessionRosterStudent[]
  tasks: SessionRoomTask[]
  responsesByTask: Record<string, Record<string, SessionStudentResponse>>
  /** Open a student's private whiteboard (read-only) — replaces the standalone
   *  Boards picker. */
  onViewBoard?: (userId: string, name: string) => void
  onClose: () => void
}) {
  const [comprehension, setComprehension] = useState<
    Record<string, { understanding: number | null; needsReview: number }>
  >({})
  const [loading, setLoading] = useState(true)
  const [dmFor, setDmFor] = useState<string | null>(null)
  const [dmText, setDmText] = useState('')
  const [insights, setInsights] = useState<string | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)

  const generateInsights = async () => {
    setInsightsLoading(true)
    setInsights(null)
    try {
      const res = await fetchWithCsrf(`/api/tutor/live-sessions/${sessionId}/insights`, {
        method: 'POST',
        credentials: 'include',
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(d?.error || 'Could not generate insights.')
        return
      }
      setInsights(d?.insights || d?.message || 'No insights available yet.')
    } catch {
      toast.error('Could not generate insights.')
    } finally {
      setInsightsLoading(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tutor/live-sessions/${sessionId}/comprehension`, {
        credentials: 'include',
      })
      if (res.ok) {
        const d = await res.json()
        setComprehension(d?.comprehension ?? {})
      }
    } catch {
      // non-fatal — the roster (presence/engagement) still renders without it
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    load()
  }, [load])

  const answerable = useMemo(() => tasks.filter(t => (t.dmiItems?.length ?? 0) > 0), [tasks])
  const doneByStudent = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of answerable)
      for (const sid of Object.keys(responsesByTask[t.id] ?? {})) m.set(sid, (m.get(sid) ?? 0) + 1)
    return m
  }, [answerable, responsesByTask])

  const roster = useMemo(
    () => [...students].sort((a, b) => a.name.localeCompare(b.name)),
    [students]
  )

  const sendDm = (studentId: string) => {
    const msg = dmText.trim()
    if (!msg || !socket) return
    socket.emit('tutor:direct_message', { roomId: sessionId, studentId, message: msg })
    setDmText('')
    setDmFor(null)
    toast.success('Message sent')
  }

  return (
    <div className="pointer-events-auto flex h-full w-[26rem] max-w-[92vw] flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Users className="h-4 w-4 text-blue-600" />
          Monitor
          <span className="text-xs font-normal text-slate-400">· {roster.length}</span>
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={load}
            aria-label="Refresh"
            title="Refresh understanding"
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

      {/* AI session insights — grounded in the real submission data. */}
      <div className="border-b p-2">
        <button
          onClick={generateInsights}
          disabled={insightsLoading}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
        >
          {insightsLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {insights ? 'Regenerate AI summary' : 'AI session summary'}
        </button>
        {insights ? (
          <div className="mt-2 whitespace-pre-wrap rounded-lg bg-violet-50 p-2.5 text-xs leading-relaxed text-slate-700">
            {insights}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {roster.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 py-10 text-center text-xs text-slate-500">
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            ) : (
              'No students have joined this session yet.'
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {roster.map(s => {
              const badge = statusBadge(s.status, s.engagement)
              const understanding =
                comprehension[s.userId]?.understanding ?? s.understanding ?? null
              const needsReview = comprehension[s.userId]?.needsReview ?? 0
              const done = doneByStudent.get(s.userId) ?? 0
              return (
                <li key={s.userId} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${badge.dot}`} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                      {s.name}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    {onViewBoard ? (
                      <button
                        onClick={() => onViewBoard(s.userId, s.name)}
                        title={`View ${s.name}'s whiteboard`}
                        aria-label={`View ${s.name}'s whiteboard`}
                        className="shrink-0 rounded-lg border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    <button
                      onClick={() => {
                        setDmFor(cur => (cur === s.userId ? null : s.userId))
                        setDmText('')
                      }}
                      title={`Send ${s.name} a private message`}
                      aria-label={`Message ${s.name}`}
                      className="shrink-0 rounded-lg border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Signals */}
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <Metric label="Engagement" value={pct(s.engagement)} />
                    <Metric
                      label="Understanding"
                      value={understanding == null ? '—' : `${understanding}%`}
                      hint={needsReview > 0 ? `${needsReview} to review` : undefined}
                    />
                    <Metric
                      label="Tasks done"
                      value={answerable.length > 0 ? `${done}/${answerable.length}` : String(done)}
                    />
                  </div>

                  {dmFor === s.userId ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        autoFocus
                        value={dmText}
                        onChange={e => setDmText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') sendDm(s.userId)
                          if (e.key === 'Escape') setDmFor(null)
                        }}
                        placeholder={`Private message to ${s.name}…`}
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                      />
                      <button
                        onClick={() => sendDm(s.userId)}
                        disabled={!socket || dmText.trim().length === 0}
                        aria-label="Send message"
                        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-blue-600 p-1.5 text-white hover:bg-blue-500 disabled:opacity-40"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 py-1.5">
      <div className="text-sm font-semibold text-slate-800">{value}</div>
      <div className="text-[9px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      {hint ? <div className="text-[9px] text-amber-600">{hint}</div> : null}
    </div>
  )
}

function pct(v: number | undefined): string {
  return typeof v === 'number' ? `${Math.round(v)}%` : '—'
}

function statusBadge(
  status: string | undefined,
  engagement: number | undefined
): { label: string; className: string; dot: string } {
  const s = (status || '').toLowerCase()
  const eng = typeof engagement === 'number' ? engagement : null
  if (s === 'idle' || (eng != null && eng < 30))
    return { label: 'Idle', className: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300' }
  if (s === 'needs_help' || (eng != null && eng < 60))
    return { label: 'Needs a nudge', className: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' }
  return { label: 'On track', className: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' }
}
