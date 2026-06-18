'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
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

export function SubmissionsPanel({
  courseId,
  width,
  hidden,
  onToggleHidden,
  headerExtra,
}: {
  courseId: string
  width: number
  hidden: boolean
  onToggleHidden: (value: boolean) => void
  headerExtra?: ReactNode
}) {
  const [data, setData] = useState<SubmissionsTreeResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<SelectedLeaf | null>(null)

  useEffect(() => {
    if (!courseId) return
    // Skip fetch for draft/placeholder course IDs
    if (courseId === 'insights-draft' || courseId === 'builder-draft') {
      setError(null)
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    fetch(`/api/tutor/courses/${courseId}/submissions-tree`, { cache: 'no-store' })
      .then(async res => {
        const contentType = res.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) {
          if (res.status !== 404) {
            setError(res.ok ? 'Failed to load submissions' : `Server error (${res.status})`)
          }
          setData(null)
          return
        }
        const json = await res.json()
        if (!res.ok || json?.error) {
          // Silently ignore 404 — course may not have sessions/submissions yet.
          // Only show errors for actual failures, not empty data.
          if (res.status !== 404) {
            setError(json?.error || 'Failed to load submissions')
          }
          setData(null)
          return
        }
        setData(json)
        const nextOpen: Record<string, boolean> = { course: true }
        ;(json?.lessons || []).forEach((l: any) => {
          nextOpen[`lesson_${l.id}`] = true
        })
        setOpen(nextOpen)
      })
      .catch(err => {
        setError(err?.message || 'Failed to load submissions')
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [courseId])

  const lessons = useMemo(() => {
    const ls = data?.lessons || []
    if (ls.length > 0) return ls
    return [{ id: 'lesson_unknown', title: 'Lessons', order: 0 }]
  }, [data])

  const sessions = useMemo(() => (data?.sessions || []).filter(s => !!s.id), [data])

  const sessionsByLessonId = useMemo(() => {
    const map: Record<string, SubmissionsTreeResponse['sessions']> = {}
    if (sessions.length === 0) return map
    sessions.forEach((s, idx) => {
      const lessonIdx = Math.min(idx, Math.max(0, lessons.length - 1))
      const lessonId = lessons[lessonIdx]?.id || 'lesson_unknown'
      if (!map[lessonId]) map[lessonId] = []
      map[lessonId].push({ ...s } as any)
    })
    return map
  }, [sessions, lessons])

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
    return map
  }, [data])

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
    <>
      <div
        className="absolute top-1/2 z-50 flex h-16 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-l-full border border-r-0 border-[#E5E7EB] bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.08)] transition-all hover:w-10 hover:bg-slate-50"
        style={{ right: hidden ? 0 : width - 16 }}
        onClick={() => onToggleHidden(!hidden)}
        title={hidden ? 'Show submissions' : 'Hide submissions'}
      >
        {hidden ? (
          <ChevronLeft className="h-5 w-5 text-[#2B5FB8]" />
        ) : (
          <ChevronRight className="h-5 w-5 text-[#2B5FB8]" />
        )}
      </div>

      {!hidden && (
        <div
          className="absolute bottom-4 right-0 top-0 z-40 flex flex-col overflow-hidden rounded-[20px] border border-[rgba(0,0,0,0.04)] bg-[#FFFFFF] shadow-[0_18px_45px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]"
          style={{ width }}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              {!headerExtra && (
                <div className="text-sm font-semibold text-[#1F2933]">Submissions</div>
              )}
              {headerExtra}
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1 p-3">
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
                    <div key={lesson.id} className="pl-4">
                      <FolderRow
                        isOpen={!!open[`lesson_${lesson.id}`]}
                        onToggle={() => toggle(`lesson_${lesson.id}`)}
                        icon={<Folder className="h-4 w-4 text-slate-500" />}
                        title={lesson.title}
                        subtitle={`Lesson ${lesson.order + 1}`}
                      />

                      {open[`lesson_${lesson.id}`] &&
                        (sessionsByLessonId[lesson.id] || []).map((session, idx) => {
                          const sessionKey = `session_${session.id}`
                          return (
                            <div key={session.id} className="pl-4">
                              <FolderRow
                                isOpen={!!open[sessionKey]}
                                onToggle={() => toggle(sessionKey)}
                                icon={<Folder className="h-4 w-4 text-slate-500" />}
                                title={formatSessionTitle(session)}
                                subtitle={session.status || `Session ${idx + 1}`}
                              />

                              {open[sessionKey] && (
                                <div className="pl-4">
                                  <FolderRow
                                    isOpen={!!open[`${sessionKey}_enrolled`]}
                                    onToggle={() => toggle(`${sessionKey}_enrolled`)}
                                    icon={<Folder className="h-4 w-4 text-slate-500" />}
                                    title="Enrolled"
                                    subtitle={`${enrolled.length}`}
                                  />

                                  {open[`${sessionKey}_enrolled`] &&
                                    enrolled.map(st => (
                                      <StudentNode
                                        key={`${session.id}_${st.studentId}_e`}
                                        session={session}
                                        student={st}
                                        deployedBySession={deployedBySession}
                                        submissionMap={submissionMap}
                                        reportMap={reportMap}
                                        open={open}
                                        toggle={toggle}
                                        onSelect={setSelected}
                                      />
                                    ))}
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
      )}

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
    </>
  )
}

function FolderRow({
  isOpen,
  onToggle,
  title,
  subtitle,
  icon,
}: {
  isOpen: boolean
  onToggle: () => void
  title: string
  subtitle?: string
  icon: ReactNode
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
          <div className="truncate text-sm font-semibold text-slate-800">{title}</div>
          {subtitle && <div className="truncate text-xs text-slate-500">{subtitle}</div>}
        </div>
      </div>
      {isOpen ? (
        <ChevronDown className="h-4 w-4 text-slate-500" />
      ) : (
        <ChevronRight className="h-4 w-4 text-slate-500" />
      )}
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
}: {
  session: any
  student: { studentId: string; name: string }
  deployedBySession: Record<string, Record<string, any[]>>
  submissionMap: Map<string, any>
  reportMap: Map<string, any>
  open: Record<string, boolean>
  toggle: (key: string) => void
  onSelect: (v: SelectedLeaf | null) => void
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
      />

      {open[studentKey] && (
        <div className="pl-4">
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
        <div className="pl-4">
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
                    <div className="pl-4">
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
