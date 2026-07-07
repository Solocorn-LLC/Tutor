'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { BackButton } from '@/components/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Bot,
  ArrowLeft,
  Loader2,
  MessageSquare,
  BookOpen,
  Lightbulb,
  Calendar,
  BarChart3,
} from 'lucide-react'
import { toast } from 'sonner'

interface SessionSummary {
  id: string
  lessonId: string
  lessonTitle: string | null
  courseName: string | null
  status: string
  currentSection: string
  conceptMastery: Record<string, number>
  messageCount: number
  lastMessage: string | null
  lastResponse: string | null
  startedAt: string
  lastActivityAt: string
  completedAt: string | null
}

interface Enrollment {
  subjectCode: string
  enrolledAt: string
  lastSessionAt: string | null
  totalSessions: number
  totalMinutes: number
  status: string
}

interface DailyUsage {
  date: string
  sessionCount: number
  messageCount: number
  minutesUsed: number
}

interface Metrics {
  totalSessions: number
  totalMessages: number
  totalMinutes: number
  avgMessagesPerSession: number
  activeSubjects: number
}

interface AITutorData {
  sessionSummaries: SessionSummary[]
  enrollments: Enrollment[]
  dailyUsage: DailyUsage[]
  recentActivities: Array<{ id: string; action: string; metadata: unknown; createdAt: string }>
  interactionSessions: Array<{
    id: string
    subjectCode: string
    startedAt: string
    endedAt: string | null
    messageCount: number
    topicsCovered: string[]
    summary: string | null
  }>
  metrics: Metrics
  recommendations: string[]
}

export default function StudentAITutorPage() {
  const params = useParams()
  const studentId = params.studentId as string
  const [data, setData] = useState<AITutorData | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!studentId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/parent/students/${studentId}/ai-tutor`, {
        credentials: 'include',
      })
      if (res.ok) {
        const json = await res.json()
        setData(json.data ?? null)
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to load AI tutor data')
      }
    } catch {
      toast.error('Failed to load AI tutor data')
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDateShort = (iso: string) => {
    return new Date(iso).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/parent/students/${studentId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <p className="text-gray-500">Failed to load AI tutoring data</p>
      </div>
    )
  }

  const { sessionSummaries, enrollments, dailyUsage, metrics, recommendations } = data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/parent/students/${studentId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">AI Tutor</h1>
            <p className="text-sm text-gray-500">
              AI interaction history, Socratic dialogue, and learning performance
            </p>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total conversations</p>
                <p className="text-2xl font-bold">{metrics.totalSessions}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total messages</p>
                <p className="text-2xl font-bold">{metrics.totalMessages}</p>
              </div>
              <Bot className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Time used (minutes)</p>
                <p className="text-2xl font-bold">{metrics.totalMinutes}</p>
              </div>
              <Calendar className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active subjects</p>
                <p className="text-2xl font-bold">{metrics.activeSubjects}</p>
              </div>
              <BookOpen className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Learning suggestions
            </CardTitle>
            <CardDescription>Personalized suggestions based on AI tutoring data</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-amber-500">•</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Session summaries - Socratic conversations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Lesson conversation history
          </CardTitle>
          <CardDescription>
            In-lesson AI tutoring conversations using Socratic guidance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessionSummaries.length === 0 ? (
            <p className="py-8 text-center text-gray-500">No lesson conversations yet</p>
          ) : (
            <div className="space-y-4">
              {sessionSummaries.slice(0, 15).map(s => (
                <div
                  key={s.id}
                  className="rounded-lg border p-4 transition-colors hover:bg-gray-50/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{s.lessonTitle ?? 'Untitled lesson'}</h3>
                        {s.courseName && (
                          <Badge variant="outline" className="text-xs">
                            {s.courseName}
                          </Badge>
                        )}
                        <Badge
                          variant={s.status === 'completed' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {s.status === 'completed' ? 'Completed' : s.currentSection}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {s.messageCount} messages · last active: {formatDate(s.lastActivityAt)}
                      </p>
                      {s.lastMessage && (
                        <div className="mt-2 rounded bg-gray-50 p-2 text-sm">
                          <p className="text-gray-600">
                            <span className="font-medium text-gray-700">Student:</span>{' '}
                            {s.lastMessage.length > 100
                              ? s.lastMessage.slice(0, 100) + '...'
                              : s.lastMessage}
                          </p>
                          {s.lastResponse && (
                            <p className="mt-1 text-gray-600">
                              <span className="font-medium text-purple-700">AI:</span>{' '}
                              {s.lastResponse.length > 150
                                ? s.lastResponse.slice(0, 150) + '...'
                                : s.lastResponse}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enrollments */}
      {enrollments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Enrolled subjects
            </CardTitle>
            <CardDescription>Subjects enrolled in AI tutoring, and usage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {enrollments.map(e => (
                <div key={e.subjectCode} className="flex flex-col gap-2 rounded-lg border p-4">
                  <span className="font-medium">{e.subjectCode}</span>
                  <p className="text-sm text-gray-500">
                    {e.totalSessions} conversations · {e.totalMinutes} min
                  </p>
                  {e.lastSessionAt && (
                    <p className="text-xs text-gray-400">
                      Latest: {formatDateShort(e.lastSessionAt)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily usage (last 7 days) */}
      {dailyUsage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Recent usage
            </CardTitle>
            <CardDescription>AI tutoring usage over the last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {dailyUsage.slice(0, 7).map(u => (
                <div key={u.date} className="w-24 shrink-0 rounded-lg border p-3 text-center">
                  <p className="text-xs text-gray-500">{formatDateShort(u.date)}</p>
                  <p className="font-semibold">{u.messageCount}</p>
                  <p className="text-xs text-gray-400">messages</p>
                  <p className="text-xs text-gray-400">{u.minutesUsed} min</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
