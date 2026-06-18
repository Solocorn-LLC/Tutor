/**
 * Real-Time Student Engagement Analytics Dashboard
 * Provides live visibility into student engagement, attention, and participation
 */

'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Activity,
  AlertTriangle,
  Brain,
  Eye,
  MessageCircle,
  Hand,
  TrendingUp,
  TrendingDown,
  Minimize2,
  Maximize2,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EngagementMetrics {
  studentId: string
  name: string
  avatar?: string
  engagementScore: number // 0-100 overall engagement
  attentionLevel: 'focused' | 'distracted' | 'away' | 'inactive'
  participationCount: number // interactions in last 5 min
  comprehensionEstimate: number // 0-100 AI-derived understanding
  lastActivity: Date
  raisedHand: boolean
  chatMessages: number // messages in session
  whiteboardInteractions: number // drawings/contributions
  timeInSession: number // minutes
  struggleIndicators: number // AI-detected confusion signals
}

interface EngagementDashboardProps {
  students: EngagementMetrics[]
  isOpen: boolean
  onToggle: () => void
  onSelectStudent?: (studentId: string) => void
  onSendNudge?: (studentId: string) => void
}

export function EngagementDashboard({
  students,
  isOpen,
  onToggle,
  onSelectStudent,
  onSendNudge,
}: EngagementDashboardProps) {
  const [filter, setFilter] = useState<'all' | 'struggling' | 'inactive' | 'engaged'>('all')
  const [sortBy, setSortBy] = useState<'engagement' | 'attention' | 'comprehension'>('engagement')
  const [expanded, setExpanded] = useState(true)

  // Calculate aggregate metrics
  const aggregateStats = useMemo(() => {
    if (students.length === 0) return null

    const avgEngagement = Math.round(
      students.reduce((acc, s) => acc + s.engagementScore, 0) / students.length
    )
    const avgComprehension = Math.round(
      students.reduce((acc, s) => acc + s.comprehensionEstimate, 0) / students.length
    )
    const strugglingCount = students.filter(
      s => s.engagementScore < 50 || s.comprehensionEstimate < 50
    ).length
    const inactiveCount = students.filter(
      s => s.attentionLevel === 'away' || s.attentionLevel === 'inactive'
    ).length
    const totalHandsRaised = students.filter(s => s.raisedHand).length
    const totalMessages = students.reduce((acc, s) => acc + s.chatMessages, 0)

    return {
      avgEngagement,
      avgComprehension,
      strugglingCount,
      inactiveCount,
      totalHandsRaised,
      totalMessages,
      classEnergy: avgEngagement > 75 ? 'high' : avgEngagement > 50 ? 'moderate' : 'low',
    }
  }, [students])

  // Filter and sort students
  const filteredStudents = useMemo(() => {
    let result = [...students]

    switch (filter) {
      case 'struggling':
        result = result.filter(s => s.engagementScore < 50 || s.comprehensionEstimate < 50)
        break
      case 'inactive':
        result = result.filter(s => s.attentionLevel === 'away' || s.attentionLevel === 'inactive')
        break
      case 'engaged':
        result = result.filter(s => s.engagementScore >= 75 && s.attentionLevel === 'focused')
        break
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'engagement':
          return b.engagementScore - a.engagementScore
        case 'attention':
          const attentionOrder = { focused: 3, distracted: 2, away: 1, inactive: 0 }
          return attentionOrder[b.attentionLevel] - attentionOrder[a.attentionLevel]
        case 'comprehension':
          return b.comprehensionEstimate - a.comprehensionEstimate
        default:
          return 0
      }
    })

    return result
  }, [students, filter, sortBy])

  const getAttentionColor = (level: string) => {
    switch (level) {
      case 'focused':
        return 'bg-green-500'
      case 'distracted':
        return 'bg-yellow-500'
      case 'away':
        return 'bg-orange-500'
      case 'inactive':
        return 'bg-gray-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getEngagementColor = (score: number) => {
    if (score >= 75) return 'text-green-500'
    if (score >= 50) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getProgressColor = (score: number) => {
    if (score >= 75) return 'bg-green-500'
    if (score >= 50) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  if (!isOpen) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={onToggle}
              className="fixed right-4 top-20 z-40 border-slate-700 bg-slate-800 hover:bg-[#1F2933] hover:text-white hover:outline hover:outline-1 hover:outline-white"
            >
              <Activity className="h-4 w-4 text-blue-400" />
              {aggregateStats && aggregateStats.strugglingCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px]">
                  {aggregateStats.strugglingCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Open Engagement Dashboard</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className="flex h-full w-[400px] flex-col border-l border-slate-700 bg-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-600 p-2">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Live Engagement</h2>
              <p className="text-xs text-slate-400">Real-time student analytics</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setExpanded(!expanded)}
              className="h-8 w-8"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onToggle} className="h-8 w-8">
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {aggregateStats && expanded && (
          <div className="grid grid-cols-3 gap-2">
            <Card className="border-slate-600 bg-slate-700">
              <CardContent className="p-2 text-center">
                <p
                  className={cn(
                    'text-xl font-bold',
                    getEngagementColor(aggregateStats.avgEngagement)
                  )}
                >
                  {aggregateStats.avgEngagement}%
                </p>
                <p className="text-[10px] text-slate-400">Avg Engagement</p>
              </CardContent>
            </Card>
            <Card className="border-slate-600 bg-slate-700">
              <CardContent className="p-2 text-center">
                <p className="text-xl font-bold text-blue-400">{aggregateStats.totalHandsRaised}</p>
                <p className="text-[10px] text-slate-400">Hands Raised</p>
              </CardContent>
            </Card>
            <Card className="border-slate-600 bg-slate-700">
              <CardContent className="p-2 text-center">
                <p
                  className={cn(
                    'text-xl font-bold',
                    aggregateStats.strugglingCount > 0 ? 'text-red-400' : 'text-green-400'
                  )}
                >
                  {aggregateStats.strugglingCount}
                </p>
                <p className="text-[10px] text-slate-400">Need Help</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="border-b border-slate-700 bg-slate-800/50 px-4 py-2">
        <div className="flex items-center gap-2">
          <Filter className="h-3 w-3 text-slate-400" />
          <div className="flex flex-wrap gap-1">
            {(['all', 'struggling', 'inactive', 'engaged'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] capitalize transition-colors',
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-[#1F2933] hover:text-white hover:outline hover:outline-1 hover:outline-white'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] text-slate-500">Sort:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="rounded border border-slate-600 bg-slate-700 px-2 py-0.5 text-[10px] text-slate-300"
          >
            <option value="engagement">Engagement</option>
            <option value="attention">Attention</option>
            <option value="comprehension">Comprehension</option>
          </select>
        </div>
      </div>

      {/* Student List */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {filteredStudents.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No students match the current filter
            </p>
          ) : (
            filteredStudents.map(student => (
              <StudentEngagementCard
                key={student.studentId}
                student={student}
                onSelect={() => onSelectStudent?.(student.studentId)}
                onNudge={() => onSendNudge?.(student.studentId)}
                getAttentionColor={getAttentionColor}
                getEngagementColor={getEngagementColor}
                getProgressColor={getProgressColor}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer Stats */}
      <div className="border-t border-slate-700 bg-slate-800 p-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{students.length} students</span>
          <span>{aggregateStats?.totalMessages || 0} messages</span>
        </div>
      </div>
    </div>
  )
}

// Individual Student Card
interface StudentEngagementCardProps {
  student: EngagementMetrics
  onSelect: () => void
  onNudge: () => void
  getAttentionColor: (level: string) => string
  getEngagementColor: (score: number) => string
  getProgressColor: (score: number) => string
}

function StudentEngagementCard({
  student,
  onSelect,
  onNudge,
  getAttentionColor,
  getEngagementColor,
  getProgressColor,
}: StudentEngagementCardProps) {
  const [showActions, setShowActions] = useState(false)

  const isStruggling = student.engagementScore < 50 || student.comprehensionEstimate < 50
  const isInactive = student.attentionLevel === 'away' || student.attentionLevel === 'inactive'

  return (
    <Card
      className={cn(
        'cursor-pointer border-slate-700 bg-slate-800 transition-all hover:border-slate-600',
        isStruggling && 'border-red-800/50 bg-red-900/10',
        isInactive && 'opacity-70'
      )}
      onClick={onSelect}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <CardContent className="p-3">
        {/* Header */}
        <div className="mb-2 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-medium text-white">
                {student.name.charAt(0).toUpperCase()}
              </div>
              <div
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-800',
                  getAttentionColor(student.attentionLevel)
                )}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-white">{student.name}</p>
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <span className="capitalize">{student.attentionLevel}</span>
                <span>•</span>
                <span>{student.timeInSession}m in session</span>
              </div>
            </div>
          </div>
          {student.raisedHand && (
            <Badge className="bg-yellow-600 px-1.5 py-0 text-[10px]">
              <Hand className="mr-0.5 h-3 w-3" />
              Raised
            </Badge>
          )}
        </div>

        {/* Metrics */}
        <div className="space-y-2">
          {/* Engagement Score */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <span className="flex items-center gap-1 text-slate-400">
                <Activity className="h-3 w-3" />
                Engagement
              </span>
              <span className={cn('font-medium', getEngagementColor(student.engagementScore))}>
                {student.engagementScore}%
              </span>
            </div>
            <Progress value={student.engagementScore} className="h-1 bg-slate-700">
              <div
                className={cn('h-full transition-all', getProgressColor(student.engagementScore))}
                style={{ width: `${student.engagementScore}%` }}
              />
            </Progress>
          </div>

          {/* Comprehension Score */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <span className="flex items-center gap-1 text-slate-400">
                <Brain className="h-3 w-3" />
                Comprehension
              </span>
              <span
                className={cn('font-medium', getEngagementColor(student.comprehensionEstimate))}
              >
                {student.comprehensionEstimate}%
              </span>
            </div>
            <Progress value={student.comprehensionEstimate} className="h-1 bg-slate-700">
              <div
                className={cn(
                  'h-full transition-all',
                  getProgressColor(student.comprehensionEstimate)
                )}
                style={{ width: `${student.comprehensionEstimate}%` }}
              />
            </Progress>
          </div>

          {/* Activity Stats */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-3">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <MessageCircle className="h-3 w-3" />
                      {student.chatMessages}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Chat messages</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <Eye className="h-3 w-3" />
                      {student.participationCount}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Recent interactions (5m)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {student.struggleIndicators > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 text-[10px] text-red-400">
                        <AlertTriangle className="h-3 w-3" />
                        {student.struggleIndicators}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Struggle indicators detected</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* Last Activity */}
            <span className="text-[10px] text-slate-500">
              {formatLastActivity(student.lastActivity)}
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        {showActions && (isStruggling || student.raisedHand) && (
          <div className="mt-3 flex gap-2 border-t border-slate-700 pt-2">
            {isStruggling && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 flex-1 border-yellow-600/50 text-[10px] text-yellow-400 hover:bg-yellow-600/10"
                onClick={e => {
                  e.stopPropagation()
                  onNudge()
                }}
              >
                Send Nudge
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function formatLastActivity(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 120) return '1m ago'
  if (seconds < 300) return `${Math.floor(seconds / 60)}m ago`
  return '>5m ago'
}
