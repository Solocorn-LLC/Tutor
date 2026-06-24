'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Users, MessageSquare, CheckCircle2, Smile, ListChecks } from 'lucide-react'
import type { LiveTask } from '@/lib/socket/socket-types'
import type { LiveStudent, EngagementMetrics } from '@/types/live-session'

interface AnalyticsPanelProps {
  students?: LiveStudent[]
  // Kept for API compatibility; engagement/attention have no real signal source
  // so they are intentionally not rendered (see below).
  metrics?: EngagementMetrics | null
  liveTasks?: LiveTask[]
  classDuration?: number
  isRecording?: boolean
  recordingDuration?: number
  sessionId?: string | null
}

/**
 * Live-session analytics. Everything shown here is derived from REAL session
 * data — present students (socket roster), deployed tasks, and their poll/
 * question responses and completions. Fields that the app has no real signal
 * for (engagement score, attention level, hands raised, participation rate)
 * were previously fabricated and have been removed rather than faked.
 */
export function AnalyticsPanel({
  students,
  liveTasks,
  classDuration,
  isRecording,
  recordingDuration,
  sessionId,
}: AnalyticsPanelProps) {
  const totalStudents = students?.length ?? 0
  const activeStudents = useMemo(
    () => (students || []).filter(s => s.status !== 'offline').length,
    [students]
  )

  const studentStatusData = useMemo(() => {
    if (!students) return []
    const online = students.filter(s => s.status !== 'offline').length
    const offline = students.filter(s => s.status === 'offline').length
    return [
      { name: 'Online', value: online, color: '#10b981' },
      { name: 'Offline', value: offline, color: '#9ca3af' },
    ].filter(d => d.value > 0)
  }, [students])

  const formattedDuration = useMemo(() => {
    if (!classDuration) return '00:00'
    const mins = Math.floor(classDuration / 60)
    const secs = classDuration % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }, [classDuration])

  const formattedRecording = useMemo(() => {
    if (!recordingDuration) return '00:00'
    const mins = Math.floor(recordingDuration / 60)
    const secs = recordingDuration % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }, [recordingDuration])

  const totalPollResponses = useMemo(() => {
    return (liveTasks || []).reduce(
      (sum, task) => sum + task.polls.reduce((s, p) => s + p.responses.length, 0),
      0
    )
  }, [liveTasks])

  const totalQuestionResponses = useMemo(() => {
    return (liveTasks || []).reduce(
      (sum, task) => sum + task.questions.reduce((s, q) => s + q.responses.length, 0),
      0
    )
  }, [liveTasks])

  // Completion across all deployed tasks: unique students who completed at least
  // one deployed task, over the number present.
  const taskCompletions = useMemo(() => {
    const completers = new Set<string>()
    for (const task of liveTasks || []) {
      for (const id of task.completedBy || []) completers.add(id)
    }
    return { completed: completers.size, total: totalStudents }
  }, [liveTasks, totalStudents])

  return (
    <div className="flex flex-1 flex-col space-y-4 px-1 pb-0">
      {/* Student presence */}
      <div className="rounded-xl border bg-white/80 p-3 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Student Presence</p>
        {studentStatusData.length > 0 ? (
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={studentStatusData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={60}
                paddingAngle={3}
                dataKey="value"
              >
                {studentStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[160px] items-center justify-center text-xs text-gray-400">
            No students have joined yet
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-2">
          {studentStatusData.map(d => (
            <div key={d.name} className="flex items-center gap-1 text-[10px] text-gray-600">
              <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
              {d.name}: {d.value}
            </div>
          ))}
        </div>
      </div>

      {/* Task Activity */}
      {liveTasks && liveTasks.length > 0 && (
        <div className="rounded-xl border bg-white/80 p-3 shadow-sm">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-gray-500">
            <ListChecks className="h-3 w-3" />
            Deployed Task Activity
          </p>
          <div className="space-y-2">
            {liveTasks.map(task => {
              const pollCount = task.polls.length
              const questionCount = task.questions.length
              const pollResponses = task.polls.reduce((s, p) => s + p.responses.length, 0)
              const questionResponses = task.questions.reduce((s, q) => s + q.responses.length, 0)
              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-gray-900">{task.title}</p>
                    <p className="text-[10px] text-gray-500">
                      {task.source === 'task' ? 'Task' : 'Assessment'} • {pollCount} poll
                      {pollCount !== 1 ? 's' : ''} • {questionCount} question
                      {questionCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-3 text-[10px] text-gray-600">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      {task.completedBy?.length ?? 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Smile className="h-3 w-3" />
                      {pollResponses}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {questionResponses}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex justify-end gap-4 border-t border-gray-100 pt-2 text-[10px] text-gray-500">
            <span>Total poll responses: {totalPollResponses}</span>
            <span>Total question responses: {totalQuestionResponses}</span>
          </div>
        </div>
      )}

      {/* Student List — name, real presence, and real task-completion badge */}
      {students && students.length > 0 && (
        <div className="rounded-xl border bg-white/80 p-3 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
            Students ({students.length})
          </p>
          <div className="max-h-[200px] space-y-1 overflow-y-auto">
            {students.map(s => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      s.status === 'offline' ? 'bg-gray-400' : 'bg-emerald-500'
                    }`}
                  />
                  <span className="text-xs font-medium text-gray-900">{s.name}</span>
                  {liveTasks?.some(t => t.completedBy?.includes(s.id)) && (
                    <Badge variant="outline" className="h-4 px-1 text-[9px] text-emerald-600">
                      <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />
                      Done
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string | null
}) {
  return (
    <div className="rounded-xl border bg-white/80 p-3 shadow-sm">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[10px] font-medium uppercase text-gray-500">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-[10px] capitalize text-gray-400">{sub}</p>}
    </div>
  )
}
