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

type LiveSessionSubmissionsResponse = {
  course: { id: string; name: string }
  session: { id: string; title: string; scheduledAt: string | Date | null; status: string }
  participants: { studentId: string; studentName: string | null }[]
  enrolled: { studentId: string; studentName: string | null }[]
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
  submission?: LiveSessionSubmissionsResponse['submissions'][number] | null
  report?: LiveSessionSubmissionsResponse['reports'][number] | null
}

export function LiveSessionSubmissionsPanel({
  sessionId,
  width,
  hidden,
  onToggleHidden,
  selectedStudentId,
  onSelectStudent,
}: {
  sessionId: string
  width: number
  hidden: boolean
  onToggleHidden: (value: boolean) => void
  selectedStudentId: string | null
  onSelectStudent: (studentId: string, studentName: string) => void
}) {
  const panelInset = 16
  const [data, setData] = useState<LiveSessionSubmissionsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({
    root: true,
    participants: true,
    enrolled: false,
  })
  const [selected, setSelected] = useState<SelectedLeaf | null>(null)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    setError(null)
    fetch(`/api/tutor/live-sessions/${sessionId}/submissions`, { cache: 'no-store' })
      .then(res => res.json())
      .then(json => {
        if (json?.error) {
          setError(String(json.error))
          setData(null)
          return
        }
        setData(json)
      })
      .catch(err => {
        setError(err?.message || 'Failed to load submissions')
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [sessionId])

  useEffect(() => {
    if (!selectedStudentId) return
    setOpen(prev => ({
      ...prev,
      [`student_${selectedStudentId}`]: true,
      [`cat_${selectedStudentId}_task`]: true,
      [`cat_${selectedStudentId}_assessment`]: true,
      [`cat_${selectedStudentId}_homework`]: true,
    }))
  }, [selectedStudentId])

  const participants = useMemo(() => {
    const list =
      (data?.participants || [])
        .filter(s => !!s.studentId)
        .map(s => ({ studentId: s.studentId, name: s.studentName || 'Student' })) || []
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [data])

  const enrolledOnly = useMemo(() => {
    const list =
      (data?.enrolled || [])
        .filter(s => !!s.studentId)
        .map(s => ({ studentId: s.studentId, name: s.studentName || 'Student' })) || []
    const set = new Set(participants.map(p => p.studentId))
    const filtered = list.filter(s => !set.has(s.studentId))
    return filtered.sort((a, b) => a.name.localeCompare(b.name))
  }, [data, participants])

  const deployed = useMemo(() => {
    const d = data?.deployed || []
    const map: Record<'task' | 'assessment' | 'homework', any[]> = {
      task: [],
      assessment: [],
      homework: [],
    }
    d.forEach(x => {
      if (x.type === 'task' || x.type === 'assessment' || x.type === 'homework') {
        map[x.type].push(x)
      }
    })
    ;(['task', 'assessment', 'homework'] as const).forEach(t => {
      map[t] = map[t].sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
    })
    return map
  }, [data])

  const submissionMap = useMemo(() => {
    const map = new Map<string, LiveSessionSubmissionsResponse['submissions'][number]>()
    ;(data?.submissions || []).forEach(s => map.set(`${s.studentId}:${s.taskId}`, s))
    return map
  }, [data])

  const reportMap = useMemo(() => {
    const map = new Map<string, LiveSessionSubmissionsResponse['reports'][number]>()
    ;(data?.reports || []).forEach(r => {
      const taskId = r.taskId || ''
      if (!taskId) return
      map.set(`${r.studentId}:${taskId}:${r.type}`, r)
    })
    return map
  }, [data])

  const toggle = (key: string) => setOpen(prev => ({ ...prev, [key]: !prev[key] }))

  const sessionTitle = useMemo(() => {
    const s = data?.session
    if (!s) return 'Session'
    const date = s.scheduledAt ? new Date(s.scheduledAt) : null
    const dateStr = date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : ''
    return `${s.title || 'Session'}${dateStr ? ` · ${dateStr}` : ''}`
  }, [data])

  const filterSubmitted = (studentId: string, type: 'task' | 'assessment' | 'homework') =>
    (deployed[type] || []).filter((it: any) => submissionMap.has(`${studentId}:${it.itemId}`))

  const buildLeaf = (
    studentId: string,
    studentName: string,
    type: 'task' | 'assessment' | 'homework',
    item: any
  ): SelectedLeaf => {
    const submission = submissionMap.get(`${studentId}:${item.itemId}`) || null
    const report = reportMap.get(`${studentId}:${item.itemId}:${type}`) || null
    return {
      studentId,
      studentName,
      sessionId,
      sessionTitle: data?.session?.title || 'Session',
      itemType: type,
      itemId: item.itemId,
      itemTitle: item.title,
      submission,
      report,
    }
  }

  return (
    <>
      <div
        className="absolute top-1/2 z-50 flex h-16 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-l-full border border-r-0 border-[#E5E7EB] bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.08)] transition-all hover:w-10 hover:bg-slate-50"
        style={{ right: hidden ? 0 : panelInset + width - 16 }}
        onClick={() => onToggleHidden(!hidden)}
        title={hidden ? 'Show live submissions' : 'Hide live submissions'}
      >
        {hidden ? (
          <ChevronLeft className="h-5 w-5 text-[#2B5FB8]" />
        ) : (
          <ChevronRight className="h-5 w-5 text-[#2B5FB8]" />
        )}
      </div>

      {!hidden && (
        <div
          className="absolute bottom-4 right-4 top-4 z-40 flex flex-col overflow-hidden rounded-[20px] border border-[rgba(0,0,0,0.04)] bg-[#FFFFFF] shadow-[0_18px_45px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]"
          style={{ width }}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[#1F2933]">Submissions</div>
              <div className="mt-0.5 truncate text-xs text-slate-500">{sessionTitle}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onToggleHidden(true)}
            >
              Close
            </Button>
          </div>

          <ScrollArea className="min-h-0 flex-1 p-3">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : !data ? (
              <div className="text-sm text-slate-600">No data</div>
            ) : (
              <div className="flex flex-col gap-2">
                <FolderRow
                  isOpen={!!open.root}
                  onToggle={() => toggle('root')}
                  icon={<Folder className="h-4 w-4 text-slate-500" />}
                  title={data.course?.name || 'Course'}
                  subtitle={data.session?.title || 'Session'}
                />

                {open.root && (
                  <div className="pl-4">
                    <FolderRow
                      isOpen={!!open.participants}
                      onToggle={() => toggle('participants')}
                      icon={<Folder className="h-4 w-4 text-slate-500" />}
                      title="Participants"
                      subtitle={`${participants.length}`}
                    />

                    {open.participants &&
                      participants.map(st => (
                        <StudentNode
                          key={`p_${st.studentId}`}
                          student={st}
                          isSelected={selectedStudentId === st.studentId}
                          open={open}
                          toggle={toggle}
                          submitted={{
                            task: filterSubmitted(st.studentId, 'task'),
                            assessment: filterSubmitted(st.studentId, 'assessment'),
                            homework: filterSubmitted(st.studentId, 'homework'),
                          }}
                          buildLeaf={(type, item) => buildLeaf(st.studentId, st.name, type, item)}
                          onSelectLeaf={setSelected}
                          onSelectStudent={() => onSelectStudent(st.studentId, st.name)}
                        />
                      ))}

                    <FolderRow
                      isOpen={!!open.enrolled}
                      onToggle={() => toggle('enrolled')}
                      icon={<Folder className="h-4 w-4 text-slate-500" />}
                      title="Enrolled"
                      subtitle={`${enrolledOnly.length}`}
                    />

                    {open.enrolled &&
                      enrolledOnly.map(st => (
                        <StudentNode
                          key={`e_${st.studentId}`}
                          student={st}
                          isSelected={selectedStudentId === st.studentId}
                          open={open}
                          toggle={toggle}
                          submitted={{
                            task: filterSubmitted(st.studentId, 'task'),
                            assessment: filterSubmitted(st.studentId, 'assessment'),
                            homework: filterSubmitted(st.studentId, 'homework'),
                          }}
                          buildLeaf={(type, item) => buildLeaf(st.studentId, st.name, type, item)}
                          onSelectLeaf={setSelected}
                          onSelectStudent={() => onSelectStudent(st.studentId, st.name)}
                        />
                      ))}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="h-[90vh] w-[90vw] max-w-none overflow-hidden rounded-2xl border border-slate-200 bg-white p-0">
          {selected && (
            <div className="flex h-full w-full flex-col">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {selected.itemTitle}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600">
                    {selected.studentName} · {selected.sessionTitle}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => window.open('/tutor/reports', '_blank')}
                  >
                    Open Tutor Reports
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setSelected(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>

              <ScrollArea className="min-h-0 flex-1 p-4">
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
  student,
  isSelected,
  open,
  toggle,
  submitted,
  buildLeaf,
  onSelectLeaf,
  onSelectStudent,
}: {
  student: { studentId: string; name: string }
  isSelected: boolean
  open: Record<string, boolean>
  toggle: (key: string) => void
  submitted: { task: any[]; assessment: any[]; homework: any[] }
  buildLeaf: (type: 'task' | 'assessment' | 'homework', item: any) => SelectedLeaf
  onSelectLeaf: (v: SelectedLeaf | null) => void
  onSelectStudent: () => void
}) {
  const key = `student_${student.studentId}`
  return (
    <div className="pl-4">
      <button
        type="button"
        onClick={() => {
          onSelectStudent()
          toggle(key)
        }}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left hover:bg-slate-50',
          isSelected && 'bg-indigo-50'
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100">
            <Folder className="h-4 w-4 text-slate-500" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-800">{student.name}</div>
          </div>
        </div>
        {open[key] ? (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500" />
        )}
      </button>

      {open[key] && (
        <div className="pl-4">
          <CategoryFolder
            studentId={student.studentId}
            type="task"
            icon={<ClipboardList className="h-4 w-4 text-slate-500" />}
            title="Tasks"
            items={submitted.task}
            open={open}
            toggle={toggle}
            buildLeaf={buildLeaf}
            onSelectLeaf={onSelectLeaf}
          />
          <CategoryFolder
            studentId={student.studentId}
            type="assessment"
            icon={<NotebookPen className="h-4 w-4 text-slate-500" />}
            title="Assessments"
            items={submitted.assessment}
            open={open}
            toggle={toggle}
            buildLeaf={buildLeaf}
            onSelectLeaf={onSelectLeaf}
          />
          <CategoryFolder
            studentId={student.studentId}
            type="homework"
            icon={<GraduationCap className="h-4 w-4 text-slate-500" />}
            title="Homework"
            items={submitted.homework}
            open={open}
            toggle={toggle}
            buildLeaf={buildLeaf}
            onSelectLeaf={onSelectLeaf}
          />
        </div>
      )}
    </div>
  )
}

function CategoryFolder({
  studentId,
  type,
  title,
  icon,
  items,
  open,
  toggle,
  buildLeaf,
  onSelectLeaf,
}: {
  studentId: string
  type: 'task' | 'assessment' | 'homework'
  title: string
  icon: ReactNode
  items: any[]
  open: Record<string, boolean>
  toggle: (key: string) => void
  buildLeaf: (type: 'task' | 'assessment' | 'homework', item: any) => SelectedLeaf
  onSelectLeaf: (v: SelectedLeaf | null) => void
}) {
  const key = `cat_${studentId}_${type}`
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
              const leafKey = `leaf_${studentId}_${type}_${it.itemId}`
              const leaf = buildLeaf(type, it)
              return (
                <div key={leafKey}>
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
                        onClick={() => onSelectLeaf(leaf)}
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
