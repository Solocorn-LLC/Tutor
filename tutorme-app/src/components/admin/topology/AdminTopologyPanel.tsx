'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useAdminTopology, type TopologyNode } from '@/lib/admin/hooks'
import { useLiveTopology } from '@/lib/admin/hooks/useLiveTopology'

// Dynamic imports for both globe components
const TopologyGlobeCanvas = dynamic(() => import('./TopologyGlobeCanvas'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
})

const LiveTopologyGlobe = dynamic(() => import('./LiveTopologyGlobe'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
})

export function AdminTopologyPanel({ days }: { days: number }) {
  const { data, isLoading } = useAdminTopology(days)
  const { users, sessions, isLoading: isLiveLoading } = useLiveTopology({ days })
  const [subjectFilter, setSubjectFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'RECENT'>('ALL')
  const [focusedTutorId, setFocusedTutorId] = useState<string | null>(null)
  const [showLiveData, setShowLiveData] = useState(true)
  const [autoRotate, setAutoRotate] = useState(true)

  const stats = data?.topology?.stats
  const nodes = data?.topology?.nodes || []
  const edges = data?.topology?.edges || []

  const tutorsById = useMemo(() => {
    const map = new Map<string, TopologyNode>()
    nodes.forEach(n => {
      if (n.role === 'TUTOR') map.set(n.id, n)
    })
    return map
  }, [nodes])

  const subjects = useMemo(
    () => [
      'ALL',
      ...Array.from(new Set(edges.map(edge => edge.subject))).sort((a, b) => a.localeCompare(b)),
    ],
    [edges]
  )

  const filteredEdges = useMemo(() => {
    return edges.filter(edge => {
      if (subjectFilter !== 'ALL' && edge.subject !== subjectFilter) return false
      if (statusFilter !== 'ALL' && edge.status !== statusFilter) return false
      if (focusedTutorId && edge.tutorId !== focusedTutorId) return false
      return true
    })
  }, [edges, focusedTutorId, statusFilter, subjectFilter])

  const filteredNodeIds = useMemo(() => {
    const ids = new Set<string>()
    filteredEdges.forEach(edge => {
      ids.add(edge.tutorId)
      ids.add(edge.studentId)
    })
    return ids
  }, [filteredEdges])

  const filteredNodes = useMemo(() => {
    if (filteredEdges.length === 0)
      return focusedTutorId ? nodes.filter(n => n.id === focusedTutorId) : nodes
    return nodes.filter(node => filteredNodeIds.has(node.id))
  }, [filteredEdges, filteredNodeIds, nodes, focusedTutorId])

  const filteredStats = useMemo(() => {
    return {
      tutors: filteredNodes.filter(node => node.role === 'TUTOR').length,
      students: filteredNodes.filter(node => node.role === 'STUDENT').length,
      liveConnections: filteredEdges.filter(edge => edge.isActive).length,
      totalConnections: filteredEdges.length,
      liveUsers: users.length,
      liveSessions: sessions.length,
    }
  }, [filteredEdges, filteredNodes, users.length, sessions.length])

  const focusedTutor = focusedTutorId ? tutorsById.get(focusedTutorId) : null

  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-950">
      {/* Globe Visualization */}
      {isLoading || isLiveLoading ? (
        <Skeleton className="h-full w-full" />
      ) : showLiveData ? (
        <LiveTopologyGlobe
          className="absolute inset-0"
          users={users}
          sessions={sessions}
          autoRotate={autoRotate}
          onAutoRotateChange={setAutoRotate}
        />
      ) : (
        <TopologyGlobeCanvas
          className="absolute inset-0"
          nodes={filteredNodes}
          edges={filteredEdges}
          focusedTutorId={focusedTutorId}
          onTutorFocus={tutorId => setFocusedTutorId(prev => (prev === tutorId ? null : tutorId))}
        />
      )}

      {/* Stats Panel - Top Left */}
      <div className="pointer-events-none absolute left-6 top-24 z-30 grid w-[420px] grid-cols-2 gap-3">
        <MetricPill title="Tutors" value={filteredStats.tutors || stats?.tutors || 0} />
        <MetricPill title="Students" value={filteredStats.students || stats?.students || 0} />
        <MetricPill
          title="Live Links"
          value={filteredStats.liveConnections || stats?.liveConnections || 0}
          glow
        />
        <MetricPill
          title="Total Links"
          value={filteredStats.totalConnections || stats?.totalConnections || 0}
        />
        {showLiveData && (
          <>
            <MetricPill title="Live Users" value={filteredStats.liveUsers} color="#1D4ED8" />
            <MetricPill
              title="Active Sessions"
              value={filteredStats.liveSessions}
              color="#3A7CFF"
            />
          </>
        )}
      </div>

      {/* Filters Panel - Top Right */}
      <div className="pointer-events-none absolute right-2 top-24 z-30 w-[360px] space-y-3">
        {/* Live Data Toggle */}
        <div className="pointer-events-auto rounded-xl border border-blue-300/30 bg-slate-950/65 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-blue-300">Live Data Mode</p>
              <p className="mt-1 text-xs text-slate-400">Show real-time user locations</p>
            </div>
            <Switch checked={showLiveData} onCheckedChange={setShowLiveData} />
          </div>
        </div>

        {/* Traditional Filters */}
        {!showLiveData && (
          <div className="pointer-events-auto rounded-xl border border-blue-300/30 bg-slate-950/65 p-4 backdrop-blur-md">
            <p className="text-xs uppercase tracking-[0.16em] text-blue-300">Topology Filters</p>
            <p className="mt-1 text-sm text-slate-200">
              Floating overlays for mission-control feel.
            </p>
            <div className="mt-3 grid gap-3">
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-slate-400">Subject</span>
                <select
                  value={subjectFilter}
                  onChange={e => setSubjectFilter(e.target.value)}
                  className="w-full rounded-md border border-slate-600 bg-slate-900/90 px-3 py-2 text-sm text-slate-100"
                >
                  {subjects.map(subject => (
                    <option key={subject} value={subject}>
                      {subject === 'ALL' ? 'All subjects' : subject}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-slate-400">
                  Session Status
                </span>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'RECENT')}
                  className="w-full rounded-md border border-slate-600 bg-slate-900/90 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="ALL">All sessions</option>
                  <option value="ACTIVE">Active only</option>
                  <option value="RECENT">Recent only</option>
                </select>
              </label>

              <div className="space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-slate-400">
                  Tutor Focus
                </span>
                <div className="flex h-[42px] items-center gap-2 rounded-md border border-slate-600 bg-slate-900/90 px-3">
                  <span className="truncate text-sm text-slate-100">
                    {focusedTutor ? focusedTutor.name : 'No tutor focused'}
                  </span>
                  {focusedTutor ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="ml-auto h-7 border-slate-500 bg-slate-800 px-2 py-1 text-xs text-slate-100"
                      onClick={() => setFocusedTutorId(null)}
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rotation Control */}
        {showLiveData && (
          <div className="pointer-events-auto flex items-center justify-between rounded-xl border border-blue-300/30 bg-slate-950/65 p-3 backdrop-blur-md">
            <span className="text-xs uppercase tracking-[0.16em] text-blue-300">
              Globe Rotation
            </span>
            <button
              onClick={() => setAutoRotate(prev => !prev)}
              className="flex items-center gap-2 rounded-full border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:bg-slate-700"
              title={autoRotate ? 'Pause rotation' : 'Resume rotation'}
            >
              {autoRotate ? (
                <>
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Rotate
                </>
              )}
            </button>
          </div>
        )}

        {/* Legend */}
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-blue-300/30 bg-slate-950/65 p-3 backdrop-blur-md">
          {showLiveData ? (
            <>
              <Badge className="bg-[#1D4ED8]/20 text-[#1D4ED8] hover:bg-[#1D4ED8]/30">Tutor</Badge>
              <Badge className="bg-[#3A7CFF]/20 text-[#3A7CFF] hover:bg-[#3A7CFF]/30">
                Student
              </Badge>
              <Badge className="bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20">
                Active Session
              </Badge>
            </>
          ) : (
            <>
              <Badge className="bg-blue-500/15 text-blue-200 hover:bg-blue-500/20">
                Tutor Node
              </Badge>
              <Badge className="bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/20">
                Student Node
              </Badge>
              <Badge className="bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20">
                Active Link
              </Badge>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricPill({
  title,
  value,
  glow = false,
  color,
}: {
  title: string
  value: number
  glow?: boolean
  color?: string
}) {
  return (
    <div className="rounded-xl border border-blue-300/30 bg-slate-950/65 p-3 text-slate-100 backdrop-blur-md">
      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-300">{title}</p>
      <p
        className="mt-1 text-2xl font-bold"
        style={{
          color: color || (glow ? '#6ee7b7' : undefined),
          textShadow: glow ? '0 0 18px rgba(16,185,129,0.55)' : undefined,
        }}
      >
        {value.toLocaleString()}
      </p>
    </div>
  )
}

export default AdminTopologyPanel
