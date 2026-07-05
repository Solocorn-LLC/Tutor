'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { scrollElementIntoView } from '@/lib/scroll-into-view'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  GraduationCap,
  Loader2,
  NotebookPen,
  ClipboardList,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type SubmissionsTreeResponse = {
  course: { id: string; name: string }
  lessons: { id: string; title: string; order: number }[]
  sessions: { id: string; title: string; scheduledAt: string | Date | null; status: string }[]
  deployed: {
    id: string
    sessionId: string
    courseId: string
    type: string
    itemId: string
    title: string
    sessionSequence: number
    lessonId?: string | null
    deployedAt: string | Date | null
  }[]
  sessionParticipants: { sessionId: string; studentId: string; studentName: string | null }[]
  enrolledStudents: { studentId: string; studentName: string | null }[]
  submissions: {
    submissionId: string
    taskId: string
    studentId: string
    status: string
    score: number | null
    maxScore: number
    submittedAt: string | Date
    answers?: Record<string, string> | null
  }[]
  reports: {
    id: string
    studentId: string
    tutorId: string
    courseId: string | null
    taskId: string | null
    type: string
    title: string
    status: string
    strengths: any
    weaknesses: any
    overallComments: string | null
    score: number | null
    createdAt: string | Date
    updatedAt: string | Date
    sentAt: string | Date | null
  }[]
}

type SelectedLeaf = {
  studentId: string
  studentName: string
  sessionId: string
  sessionTitle: string
  itemType: 'task' | 'assessment' | 'homework'
  itemId: string
  itemTitle: string
  submission?: SubmissionsTreeResponse['submissions'][number] | null
  report?: SubmissionsTreeResponse['reports'][number] | null
}

export interface LiveSubmission {
  taskId: string
  studentId: string
  studentName?: string
  submittedAt: string | number
  answers?: Record<string, string>
}

export function SubmissionsPanel({
  courseId,
  onToggleHidden,
  headerExtra,
  liveSubmissions,
  onNewSubmissionCount,
}: {
  courseId: string
  onToggleHidden: (value: boolean) => void
  headerExtra?: ReactNode
  /** In-session completions received over the socket — overlaid on the DB rows
   *  so a student's "Task Complete" shows immediately without a DB write. */
  liveSubmissions?: LiveSubmission[]
  /** Reports the count of new (unseen) submissions so a parent tab can badge it. */
  onNewSubmissionCount?: (count: number) => void
}) {
  const [data, setData] = useState<SubmissionsTreeResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<SelectedLeaf | null>(null)

  const itemRefs = useRef<Record<string, HTMLElement | null>>({})
  const prevOpenRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    Object.keys(open).forEach(key => {
      if (open[key] && !prevOpenRef.current[key]) {
        const el = itemRefs.current[key]
        if (el) scrollElementIntoView(el, { margin: 16 })
      }
    })
    prevOpenRef.current = { ...open }
  }, [open])

  const loadTree = useCallback(
    async (preserveOpen: boolean) => {
      if (!courseId) return
      // Skip fetch for draft/placeholder course IDs
      if (courseId === 'insights-draft' || courseId === 'builder-draft') {
        setError(null)
        setData(null)
        return
      }
      // A background refetch (preserveOpen) must not flash the loading spinner or
      // wipe the tree on a transient failure — keep showing the current data.
      if (!preserveOpen) {
        setLoading(true)
        setError(null)
      }
      try {
        const res = await fetch(`/api/tutor/courses/${courseId}/submissions-tree`, {
          cache: 'no-store',
        })
        const contentType = res.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) {
          if (!preserveOpen && res.status !== 404) {
            setError(res.ok ? 'Failed to load submissions' : `Server error (${res.status})`)
          }
          if (!preserveOpen) setData(null)
          return
        }
        const json = await res.json()
        if (!res.ok || json?.error) {
          // Silently ignore 404 — course may not have sessions/submissions yet.
          // Only show errors for actual failures, not empty data.
          if (!preserveOpen && res.status !== 404) {
            setError(json?.error || 'Failed to load submissions')
          }
          if (!preserveOpen) setData(null)
          return
        }
        setData(json)
        // Only auto-expand on the first load — a refetch must not collapse or
        // re-expand folders the tutor has toggled.
        if (!preserveOpen) {
          const nextOpen: Record<string, boolean> = { course: false }
          ;(json?.lessons || []).forEach((l: any) => {
            nextOpen[`lesson_${l.id}`] = false
          })
          setOpen(nextOpen)
        }
      } catch (err) {
        if (!preserveOpen) {
          setError(err instanceof Error ? err.message : 'Failed to load submissions')
          setData(null)
        }
      } finally {
        if (!preserveOpen) setLoading(false)
      }
    },
    [courseId]
  )

  useEffect(() => {
    loadTree(false)
  }, [loadTree])

  // A live "Task Complete" persists the submission — and self-heals the
  // deployed-material / participant rows — server-side, asynchronously. The tree
  // is otherwise built from a single mount-time REST snapshot, so tasks deployed
  // or submitted after mount never appeared and the Tasks/Assessments counts
  // stayed at 0. Refetch shortly after each new live submission so both the
  // deployed items and the persisted rows show up. Debounced so a burst of
  // completions triggers one refetch; `open` selection is preserved.
  const liveSubmissionCount = liveSubmissions?.length ?? 0
  useEffect(() => {
    if (liveSubmissionCount === 0) return
    const t = setTimeout(() => loadTree(true), 1500)
    return () => clearTimeout(t)
  }, [liveSubmissionCount, loadTree])

  const lessons = useMemo(() => {
    const ls = data?.lessons || []
    if (ls.length > 0) return ls
    return [{ id: 'lesson_unknown', title: 'Lessons', order: 0 }]
  }, [data])

  const sessions = useMemo(() => (data?.sessions || []).filter(s => !!s.id), [data])

  // Which lesson each session belongs to, derived from the REAL lesson its
  // deployed material came from (deployedMaterial.lessonId) — not the old
  // by-array-index guess that dumped everything under "Lesson 1". A session with
  // material from several lessons is placed under whichever lesson it deployed
  // most from. Sessions with no lesson-tagged material fall back to the index
  // mapping so pre-existing data doesn't disappear.
  const lessonIdBySessionId = useMemo(() => {
    const validLesson = new Set(lessons.map(l => l.id))
    const counts: Record<string, Record<string, number>> = {}
    for (const d of data?.deployed || []) {
      if (!d.lessonId || !validLesson.has(d.lessonId)) continue
      counts[d.sessionId] = counts[d.sessionId] || {}
      counts[d.sessionId][d.lessonId] = (counts[d.sessionId][d.lessonId] || 0) + 1
    }
    const out: Record<string, string> = {}
    for (const [sid, byLesson] of Object.entries(counts)) {
      out[sid] = Object.entries(byLesson).sort((a, b) => b[1] - a[1])[0][0]
    }
    return out
  }, [data, lessons])

  const sessionsByLessonId = useMemo(() => {
    const map: Record<string, SubmissionsTreeResponse['sessions']> = {}
    if (sessions.length === 0) return map
    sessions.forEach((s, idx) => {
      const lessonIdx = Math.min(idx, Math.max(0, lessons.length - 1))
      const lessonId = lessonIdBySessionId[s.id] || lessons[lessonIdx]?.id || 'lesson_unknown'
      if (!map[lessonId]) map[lessonId] = []
      map[lessonId].push({ ...s } as any)
    })
    return map
  }, [sessions, lessons, lessonIdBySessionId])

  // Color-code sessions by lifecycle/chronology so the tutor can see status at a
  // glance: green = active now, yellow = the next-upcoming session (the one right
  // after the active session, or — when nothing is active — the soonest session
  // that hasn't ended), red = ended, black = the rest. Chronology is the global
  // scheduledAt order, not per-lesson.
  const sessionColorById = useMemo(() => {
    const ACTIVE = new Set(['active', 'live', 'paused', 'preparing'])
    const sorted = [...sessions].sort((a, b) => {
      const ta = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0
      const tb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0
      return ta - tb
    })
    const activeIdx = sorted.findIndex(s => ACTIVE.has((s.status || '').toLowerCase()))
    const highlightId =
      activeIdx >= 0
        ? // there's an active session — highlight the one right after it
          (sorted[activeIdx + 1]?.id ?? null)
        : // nothing active — highlight the soonest session that hasn't ended
          (sorted.find(s => (s.status || '').toLowerCase() !== 'ended')?.id ?? null)
    const map: Record<string, string> = {}
    for (const s of sorted) {
      const st = (s.status || '').toLowerCase()
      if (ACTIVE.has(st)) map[s.id] = 'text-green-600'
      else if (st === 'ended') map[s.id] = 'text-red-600'
      else if (s.id === highlightId) map[s.id] = 'text-yellow-600'
      else map[s.id] = 'text-slate-900'
    }
    return map
  }, [sessions])

  const enrolled = useMemo(() => {
    const list =
      (data?.enrolledStudents || [])
        .filter(s => !!s.studentId)
        .map(s => ({ studentId: s.studentId, name: s.studentName || 'Student' })) || []
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [data])

  const deployedBySession = useMemo(() => {
    const map: Record<string, Record<string, any[]>> = {}
    ;(data?.deployed || []).forEach(d => {
      if (!d.sessionId) return
      if (!['task', 'assessment', 'homework'].includes(d.type)) return
      if (!map[d.sessionId]) map[d.sessionId] = { task: [], assessment: [], homework: [] }
      map[d.sessionId][d.type].push(d)
    })
    Object.keys(map).forEach(sessionId => {
      ;(['task', 'assessment', 'homework'] as const).forEach(t => {
        map[sessionId][t] = (map[sessionId][t] || []).sort((a, b) =>
          String(a.title || '').localeCompare(String(b.title || ''))
        )
      })
    })
    return map
  }, [data])

  const submissionMap = useMemo(() => {
    const map = new Map<string, SubmissionsTreeResponse['submissions'][number]>()
    ;(data?.submissions || []).forEach(s => {
      map.set(`${s.studentId}:${s.taskId}`, s)
    })
    // Overlay live (in-session) completions so a student's "Task Complete" shows
    // up immediately. DB rows (graded, persisted) take precedence when present.
    ;(liveSubmissions || []).forEach(ls => {
      const key = `${ls.studentId}:${ls.taskId}`
      if (map.has(key)) return
      map.set(key, {
        submissionId: `live-${key}`,
        taskId: ls.taskId,
        studentId: ls.studentId,
        status: 'submitted',
        score: null,
        maxScore: 100,
        submittedAt: new Date(ls.submittedAt).toISOString(),
        answers: ls.answers ?? null,
      })
    })
    return map
  }, [data, liveSubmissions])

  // --- New-submission notifications ---
  // A live (in-session) submission is "new" until the tutor opens it. Seen keys
  // persist per course so a refetch/reload doesn't re-flag already-viewed ones.
  const [seenKeys, setSeenKeys] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!courseId) return
    try {
      const raw = localStorage.getItem(`subs-seen-${courseId}`)
      if (raw) setSeenKeys(new Set(JSON.parse(raw)))
    } catch {
      /* ignore */
    }
  }, [courseId])
  const markSeen = useCallback(
    (taskId: string, studentId: string) => {
      const key = `${taskId}::${studentId}`
      setSeenKeys(prev => {
        if (prev.has(key)) return prev
        const next = new Set(prev).add(key)
        try {
          if (courseId) localStorage.setItem(`subs-seen-${courseId}`, JSON.stringify([...next]))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [courseId]
  )
  // Open a submission → view it → clear its "new" flag.
  const selectAndSee = useCallback(
    (leaf: SelectedLeaf | null) => {
      setSelected(leaf)
      if (leaf) markSeen(leaf.itemId, leaf.studentId)
    },
    [markSeen]
  )

  // taskId → the sessions/lessons it was deployed to, so a live submission
  // (which only carries taskId+studentId) can be located precisely in the tree.
  const deployTargets = useMemo(() => {
    const m = new Map<string, { sessionId: string; lessonId?: string | null }[]>()
    for (const d of data?.deployed || []) {
      const arr = m.get(d.itemId) || []
      arr.push({ sessionId: d.sessionId, lessonId: d.lessonId })
      m.set(d.itemId, arr)
    }
    return m
  }, [data])
  const lessonBySessionId = useMemo(() => {
    const m: Record<string, string> = {}
    for (const [lessonId, sess] of Object.entries(sessionsByLessonId)) {
      for (const s of sess as { id: string }[]) m[s.id] = lessonId
    }
    return m
  }, [sessionsByLessonId])

  const newCounts = useMemo(() => {
    const byLesson: Record<string, number> = {}
    const bySession: Record<string, number> = {}
    const byStudentSession: Record<string, number> = {}
    let total = 0
    for (const ls of liveSubmissions || []) {
      const key = `${ls.taskId}::${ls.studentId}`
      if (seenKeys.has(key)) continue
      const targets = deployTargets.get(ls.taskId) || []
      // Fall back to "unknown" grouping when the task isn't in the tree yet.
      const locs = targets.length > 0 ? targets : [{ sessionId: '', lessonId: undefined }]
      let counted = false
      for (const loc of locs) {
        const lessonId = loc.lessonId || lessonBySessionId[loc.sessionId]
        if (lessonId) byLesson[lessonId] = (byLesson[lessonId] || 0) + 1
        if (loc.sessionId) {
          bySession[loc.sessionId] = (bySession[loc.sessionId] || 0) + 1
          const sk = `${loc.sessionId}::${ls.studentId}`
          byStudentSession[sk] = (byStudentSession[sk] || 0) + 1
        }
        counted = true
      }
      if (counted) total += 1
    }
    return { byLesson, bySession, byStudentSession, total }
  }, [liveSubmissions, seenKeys, deployTargets, lessonBySessionId])

  useEffect(() => {
    onNewSubmissionCount?.(newCounts.total)
  }, [newCounts.total, onNewSubmissionCount])

  const reportMap = useMemo(() => {
    const map = new Map<string, SubmissionsTreeResponse['reports'][number]>()
    ;(data?.reports || []).forEach(r => {
      const taskId = r.taskId || ''
      if (!taskId) return
      map.set(`${r.studentId}:${taskId}:${r.type}`, r)
    })
    return map
  }, [data])

  const toggle = (key: string) => setOpen(prev => ({ ...prev, [key]: !prev[key] }))

  const formatSessionTitle = (s: any) => {
    const date = s?.scheduledAt ? new Date(s.scheduledAt) : null
    const dateStr = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : ''
    return `${s?.title || 'Session'}${dateStr ? ` · ${dateStr}` : ''}`
  }

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-[rgba(0,0,0,0.04)] bg-[#FFFFFF] shadow-[0_18px_45px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]">
        <div className="sticky top-0 z-10 flex h-9 items-center justify-center gap-2 rounded-t-[20px] bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] px-4 text-sm font-semibold text-white">
          Desk
          {newCounts.total > 0 && (
            <span
              className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
              title={`${newCounts.total} new submission${newCounts.total === 1 ? '' : 's'}`}
            >
              {newCounts.total}
            </span>
          )}
        </div>
        {headerExtra && <div className="px-4">{headerExtra}</div>}

        <ScrollArea className={cn('min-h-0 flex-1', headerExtra ? 'p-4 pt-0' : 'p-4')}>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : !data ? null : (
            <div className="flex flex-col gap-2">
              <FolderRow
                isOpen={!!open.course}
                onToggle={() => toggle('course')}
                icon={<Folder className="h-4 w-4 text-slate-500" />}
                title={data.course?.name || 'Course'}
              />

              {open.course &&
                lessons.map(lesson => (
                  <div
                    key={lesson.id}
                    ref={el => {
                      itemRefs.current.course = el
                    }}
                    className="pl-4"
                  >
                    <FolderRow
                      isOpen={!!open[`lesson_${lesson.id}`]}
                      onToggle={() => toggle(`lesson_${lesson.id}`)}
                      icon={<Folder className="h-4 w-4 text-slate-500" />}
                      title={lesson.title}
                      subtitle={`Lesson ${lesson.order + 1}`}
                      newCount={newCounts.byLesson[lesson.id] || 0}
                    />

                    {open[`lesson_${lesson.id}`] &&
                      (sessionsByLessonId[lesson.id] || []).map((session, idx) => {
                        const sessionKey = `session_${session.id}`
                        const lessonKey = `lesson_${lesson.id}`
                        return (
                          <div
                            key={session.id}
                            ref={el => {
                              itemRefs.current[lessonKey] = el
                            }}
                            className="pl-4"
                          >
                            <FolderRow
                              isOpen={!!open[sessionKey]}
                              onToggle={() => toggle(sessionKey)}
                              icon={<Folder className="h-4 w-4 text-slate-500" />}
                              title={formatSessionTitle(session)}
                              titleClassName={sessionColorById[session.id]}
                              subtitle={session.status || `Session ${idx + 1}`}
                              newCount={newCounts.bySession[session.id] || 0}
                            />

                            {open[sessionKey] && (
                              <div
                                ref={el => {
                                  itemRefs.current[sessionKey] = el
                                }}
                                className="pl-4"
                              >
                                <FolderRow
                                  isOpen={!!open[`${sessionKey}_enrolled`]}
                                  onToggle={() => toggle(`${sessionKey}_enrolled`)}
                                  icon={<Folder className="h-4 w-4 text-slate-500" />}
                                  title="Enrolled"
                                  subtitle={`${enrolled.length}`}
                                />

                                {open[`${sessionKey}_enrolled`] && (
                                  <div
                                    ref={el => {
                                      itemRefs.current[`${sessionKey}_enrolled`] = el
                                    }}
                                    className="pl-4"
                                  >
                                    {enrolled.map(st => (
                                      <StudentNode
                                        key={`${session.id}_${st.studentId}_e`}
                                        session={session}
                                        student={st}
                                        deployedBySession={deployedBySession}
                                        submissionMap={submissionMap}
                                        reportMap={reportMap}
                                        open={open}
                                        toggle={toggle}
                                        onSelect={selectAndSee}
                                        itemRefs={itemRefs}
                                        newCount={
                                          newCounts.byStudentSession[
                                            `${session.id}::${st.studentId}`
                                          ] || 0
                                        }
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                  </div>
                ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="h-[90vh] w-[90vw] max-w-none overflow-hidden p-6">
          {selected && (
            <div className="flex h-full w-full flex-col">
              <div className="flex items-center justify-between border-b border-white/15 px-1 pb-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">
                    {selected.itemTitle}
                  </div>
                  <div className="mt-0.5 text-xs text-white/70">
                    {selected.studentName} · {selected.sessionTitle}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    onClick={() => window.open('/tutor/reports', '_blank')}
                  >
                    Open Tutor Reports
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-white hover:bg-white/10 hover:text-white"
                    onClick={() => setSelected(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>

              <ScrollArea className="min-h-0 flex-1 pr-1">
                <div className="grid gap-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Submission
                    </div>
                    <div className="mt-2 grid gap-1 text-sm text-slate-800">
                      <div>
                        <span className="font-semibold">Status:</span>{' '}
                        {selected.submission?.status || 'Not submitted'}
                      </div>
                      <div>
                        <span className="font-semibold">Score:</span>{' '}
                        {selected.submission?.score ?? '—'} / {selected.submission?.maxScore ?? '—'}
                      </div>
                      <div>
                        <span className="font-semibold">Submitted:</span>{' '}
                        {selected.submission?.submittedAt
                          ? new Date(selected.submission.submittedAt).toLocaleString()
                          : '—'}
                      </div>
                    </div>
                    {selected.submission?.answers &&
                      Object.keys(selected.submission.answers).length > 0 && (
                        <div className="mt-3 border-t border-slate-200 pt-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                            Answers
                          </div>
                          <div className="mt-2 space-y-2">
                            {Object.entries(selected.submission.answers).map(([qid, ans]) => (
                              <div key={qid} className="text-sm">
                                <span className="font-semibold text-slate-600">{qid}:</span>{' '}
                                <span className="whitespace-pre-wrap text-slate-800">{ans}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-600" />
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Report
                      </div>
                    </div>
                    {selected.report ? (
                      <div className="mt-3 grid gap-2 text-sm text-slate-800">
                        <div>
                          <span className="font-semibold">Status:</span> {selected.report.status}
                        </div>
                        <div>
                          <span className="font-semibold">Score:</span>{' '}
                          {selected.report.score ?? '—'}
                        </div>
                        {selected.report.overallComments && (
                          <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                            {selected.report.overallComments}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-slate-600">No report yet</div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}

function FolderRow({
  isOpen,
  onToggle,
  title,
  subtitle,
  icon,
  titleClassName,
  newCount = 0,
}: {
  isOpen: boolean
  onToggle: () => void
  title: string
  subtitle?: string
  icon: ReactNode
  /** Overrides the default title color (used to color-code session status). */
  titleClassName?: string
  /** Number of new (unseen) submissions under this node → shows a red badge. */
  newCount?: number
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left hover:bg-slate-50"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100">
          {icon}
        </span>
        <div className="min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`truncate text-sm font-semibold ${titleClassName || 'text-slate-800'}`}
              >
                {title}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" className="max-w-xs">
              <p className="text-xs">{title}</p>
            </TooltipContent>
          </Tooltip>
          {subtitle && <div className="truncate text-xs text-slate-500">{subtitle}</div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {newCount > 0 && (
          <span
            className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-semibold text-white"
            title={`${newCount} new submission${newCount === 1 ? '' : 's'}`}
          >
            {newCount}
          </span>
        )}
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500" />
        )}
      </div>
    </button>
  )
}

function StudentNode({
  session,
  student,
  deployedBySession,
  submissionMap,
  reportMap,
  open,
  toggle,
  onSelect,
  itemRefs,
  newCount = 0,
}: {
  session: any
  student: { studentId: string; name: string }
  deployedBySession: Record<string, Record<string, any[]>>
  submissionMap: Map<string, any>
  reportMap: Map<string, any>
  open: Record<string, boolean>
  toggle: (key: string) => void
  onSelect: (v: SelectedLeaf | null) => void
  itemRefs: React.RefObject<Record<string, HTMLElement | null>>
  newCount?: number
}) {
  const studentKey = `student_${session.id}_${student.studentId}`
  const items = deployedBySession[session.id] || { task: [], assessment: [], homework: [] }

  const buildLeaf = (type: 'task' | 'assessment' | 'homework', item: any): SelectedLeaf => {
    const submission = submissionMap.get(`${student.studentId}:${item.itemId}`) || null
    const report = reportMap.get(`${student.studentId}:${item.itemId}:${type}`) || null
    return {
      studentId: student.studentId,
      studentName: student.name,
      sessionId: session.id,
      sessionTitle: session.title || 'Session',
      itemType: type,
      itemId: item.itemId,
      itemTitle: item.title,
      submission,
      report,
    }
  }

  const filterSubmitted = (type: 'task' | 'assessment' | 'homework') =>
    (items[type] || []).filter((it: any) => submissionMap.has(`${student.studentId}:${it.itemId}`))

  const submittedTasks = filterSubmitted('task')
  const submittedAssessments = filterSubmitted('assessment')
  const submittedHomework = filterSubmitted('homework')

  return (
    <div className="pl-4">
      <FolderRow
        isOpen={!!open[studentKey]}
        onToggle={() => toggle(studentKey)}
        icon={<Folder className="h-4 w-4 text-slate-500" />}
        title={student.name}
        newCount={newCount}
      />

      {open[studentKey] && (
        <div
          ref={el => {
            if (itemRefs.current) itemRefs.current[studentKey] = el
          }}
          className="pl-4"
        >
          <CategoryFolder
            session={session}
            student={student}
            type="task"
            icon={<ClipboardList className="h-4 w-4 text-slate-500" />}
            title="Tasks"
            items={submittedTasks}
            open={open}
            toggle={toggle}
            buildLeaf={buildLeaf}
            onSelect={onSelect}
            itemRefs={itemRefs}
          />
          <CategoryFolder
            session={session}
            student={student}
            type="assessment"
            icon={<NotebookPen className="h-4 w-4 text-slate-500" />}
            title="Assessments"
            items={submittedAssessments}
            open={open}
            toggle={toggle}
            buildLeaf={buildLeaf}
            onSelect={onSelect}
            itemRefs={itemRefs}
          />
          <CategoryFolder
            session={session}
            student={student}
            type="homework"
            icon={<GraduationCap className="h-4 w-4 text-slate-500" />}
            title="Homework"
            items={submittedHomework}
            open={open}
            toggle={toggle}
            buildLeaf={buildLeaf}
            onSelect={onSelect}
            itemRefs={itemRefs}
          />
        </div>
      )}
    </div>
  )
}

function CategoryFolder({
  session,
  student,
  type,
  title,
  icon,
  items,
  open,
  toggle,
  buildLeaf,
  onSelect,
  itemRefs,
}: {
  session: any
  student: { studentId: string; name: string }
  type: 'task' | 'assessment' | 'homework'
  title: string
  icon: ReactNode
  items: any[]
  open: Record<string, boolean>
  toggle: (key: string) => void
  buildLeaf: (type: 'task' | 'assessment' | 'homework', item: any) => SelectedLeaf
  onSelect: (v: SelectedLeaf | null) => void
  itemRefs: React.RefObject<Record<string, HTMLElement | null>>
}) {
  const key = `cat_${session.id}_${student.studentId}_${type}`
  return (
    <div className="pl-4">
      <FolderRow
        isOpen={!!open[key]}
        onToggle={() => toggle(key)}
        icon={<span className="text-slate-700">{icon}</span>}
        title={title}
        subtitle={`${items.length}`}
      />

      {open[key] && (
        <div
          ref={el => {
            if (itemRefs.current) itemRefs.current[key] = el
          }}
          className="pl-4"
        >
          {items.length === 0 ? (
            <div className="px-2 py-2 text-xs text-slate-500">No submissions</div>
          ) : (
            items.map(it => {
              const leafKey = `leaf_${session.id}_${student.studentId}_${type}_${it.itemId}`
              const leaf = buildLeaf(type, it)
              return (
                <div key={leafKey} className="rounded-xl">
                  <button
                    type="button"
                    onClick={() => toggle(leafKey)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-800">{it.title}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {leaf.submission?.status || 'Submitted'}
                      </div>
                    </div>
                    {open[leafKey] ? (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    )}
                  </button>

                  {open[leafKey] && (
                    <div
                      ref={el => {
                        if (itemRefs.current) itemRefs.current[leafKey] = el
                      }}
                      className="pl-4"
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(leaf)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-slate-50',
                          leaf.report ? 'text-slate-800' : 'text-slate-500'
                        )}
                      >
                        <FileText className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {leaf.report
                            ? `Report · ${leaf.report.status}`
                            : 'Report · No report yet'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
