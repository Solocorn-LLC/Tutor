'use client'

import { useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Users,
  Activity,
  MessageSquare,
  Clock,
  Radio,
  TrendingUp,
  TrendingDown,
  Minus,
  Hand,
  Smile,
} from 'lucide-react'
import type { LiveTask } from '@/lib/socket/socket-types'
import type { LiveStudent, EngagementMetrics } from '@/types/live-session'

interface AnalyticsPanelProps {
  students?: LiveStudent[]
  metrics?: EngagementMetrics | null
  liveTasks?: LiveTask[]
  classDuration?: number
  isRecording?: boolean
  recordingDuration?: number
  sessionId?: string | null
}

const ENGAGEMENT_COLORS = {
  veryEngaged: '#10b981', // emerald-500
  engaged: '#3b82f6', // blue-500
  passive: '#f59e0b', // amber-500
  disengaged: '#ef4444', // red-500
}

export function AnalyticsPanel({
  students,
  metrics,
  liveTasks,
  classDuration,
  isRecording,
  recordingDuration,
  sessionId,
}: AnalyticsPanelProps) {
  const engagementData = useMemo(() => {
    if (!metrics) return []
    return [
      { name: 'Very Engaged', value: metrics.veryEngaged, color: ENGAGEMENT_COLORS.veryEngaged },
      { name: 'Engaged', value: metrics.engaged, color: ENGAGEMENT_COLORS.engaged },
      { name: 'Passive', value: metrics.passive, color: ENGAGEMENT_COLORS.passive },
      { name: 'Disengaged', value: metrics.disengaged, color: ENGAGEMENT_COLORS.disengaged },
    ].filter(d => d.value > 0)
  }, [metrics])

  const studentStatusData = useMemo(() => {
    if (!students) return []
    const online = students.filter(s => s.status === 'online').length
    const idle = students.filter(s => s.status === 'idle').length
    const away = students.filter(s => s.status === 'away').length
    const offline = students.filter(s => s.status === 'offline').length
    return [
      { name: 'Online', value: online, color: '#10b981' },
      { name: 'Idle', value: idle, color: '#f59e0b' },
      { name: 'Away', value: away, color: '#8b5cf6' },
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

  const handsRaised = useMemo(() => {
    return (students || []).filter(s => s.handRaised).length
  }, [students])

  const trendIcon =
    metrics?.engagementTrend === 'up' ? (
      <TrendingUp className="h-4 w-4 text-emerald-500" />
    ) : metrics?.engagementTrend === 'down' ? (
      <TrendingDown className="h-4 w-4 text-red-500" />
    ) : (
      <Minus className="h-4 w-4 text-amber-500" />
    )

  return (
    <div className="flex flex-col space-y-4 px-1 pb-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        {sessionId && (
          <Badge variant="outline" className="text-[10px]">
            Session: {sessionId.slice(0, 8)}…
          </Badge>
        )}
        <Badge variant="secondary" className="flex items-center gap-1 text-xs">
          <Clock className="h-3 w-3" />
          {formattedDuration}
        </Badge>
        {isRecording && (
          <Badge variant="destructive" className="flex animate-pulse items-center gap-1 text-xs">
            <Radio className="h-3 w-3" />
            REC {formattedRecording}
          </Badge>
        )}
        {metrics && (
          <Badge variant="outline" className="flex items-center gap-1 text-xs">
            {trendIcon}
            Engagement {metrics.engagementTrend}
          </Badge>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Users className="h-4 w-4 text-blue-500" />}
          label="Students"
          value={`${metrics?.activeStudents ?? 0} / ${metrics?.totalStudents ?? 0}`}
          sub="active"
        />
        <StatCard
          icon={<Activity className="h-4 w-4 text-emerald-500" />}
          label="Avg Engagement"
          value={`${Math.round((metrics?.averageEngagement ?? 0) * 100)}%`}
          sub={metrics?.engagementTrend}
        />
        <StatCard
          icon={<MessageSquare className="h-4 w-4 text-blue-500" />}
          label="Chat Messages"
          value={String(metrics?.totalChatMessages ?? 0)}
          sub="total"
        />
        <StatCard
          icon={<Hand className="h-4 w-4 text-violet-500" />}
          label="Hands Raised"
          value={String(handsRaised)}
          sub="now"
        />
      </div>

      {/* Participation */}
      {metrics && (
        <div className="rounded-xl border bg-white/80 p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-gray-500">
              Participation Rate
            </span>
            <span className="text-sm font-bold text-gray-900">
              {Math.round(metrics.participationRate * 100)}%
            </span>
          </div>
          <Progress value={metrics.participationRate * 100} className="h-2" />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Engagement Pie */}
        <div className="rounded-xl border bg-white/80 p-3 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Engagement Breakdown</p>
          {engagementData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={engagementData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {engagementData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[160px] items-center justify-center text-xs text-gray-400">
              No engagement data yet
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-2">
            {engagementData.map(d => (
              <div key={d.name} className="flex items-center gap-1 text-[10px] text-gray-600">
                <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                {d.name}: {d.value}
              </div>
            ))}
          </div>
        </div>

        {/* Student Status Pie */}
        <div className="rounded-xl border bg-white/80 p-3 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Student Status</p>
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
              No student data yet
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
      </div>

      {/* Task Activity */}
      {liveTasks && liveTasks.length > 0 && (
        <div className="rounded-xl border bg-white/80 p-3 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
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

      {/* Student List */}
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
                      s.status === 'online'
                        ? 'bg-emerald-500'
                        : s.status === 'idle'
                          ? 'bg-amber-500'
                          : s.status === 'away'
                            ? 'bg-violet-500'
                            : 'bg-gray-400'
                    }`}
                  />
                  <span className="text-xs font-medium text-gray-900">{s.name}</span>
                  {s.handRaised && (
                    <Badge variant="outline" className="h-4 px-1 text-[9px] text-violet-600">
                      <Hand className="mr-0.5 h-2.5 w-2.5" />
                      Raised
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                  <span>{Math.round(s.engagementScore * 100)}% eng</span>
                  <span
                    className={`capitalize ${
                      s.attentionLevel === 'high'
                        ? 'text-emerald-600'
                        : s.attentionLevel === 'medium'
                          ? 'text-amber-600'
                          : 'text-red-600'
                    }`}
                  >
                    {s.attentionLevel}
                  </span>
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
