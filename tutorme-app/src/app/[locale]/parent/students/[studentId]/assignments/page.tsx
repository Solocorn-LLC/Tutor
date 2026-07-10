'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { BackButton } from '@/components/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  FileQuestion,
  Loader2,
  ArrowLeft,
  Trophy,
  Bot,
  User,
} from 'lucide-react'
import { toast } from 'sonner'

interface AssignmentItem {
  id: string
  title: string
  description: string
  type: string
  difficulty: string
  dueDate: string | null
  assignedAt: string | null
  maxScore: number
  status: 'pending' | 'submitted' | 'overdue'
  score: number | null
  submittedAt: string | null
  gradedAt: string | null
  questionCount: number
  lessonTitle: string | null
  courseName: string | null
  tutorName: string | null
  timeSpent: number | null
  attempts: number
  maxAttempts: number
  aiGraded: boolean
  aiScore: number | null
  aiComments: string | null
  aiStrengths: string[]
  aiImprovements: string[]
  tutorFeedback: string | null
  tutorApproved: boolean
}

interface Stats {
  pending: number
  submitted: number
  overdue: number
  total: number
}

export default function StudentAssignmentsPage() {
  const params = useParams()
  const studentId = params.studentId as string
  const [assignments, setAssignments] = useState<AssignmentItem[]>([])
  const [stats, setStats] = useState<Stats>({
    pending: 0,
    submitted: 0,
    overdue: 0,
    total: 0,
  })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  const loadAssignments = useCallback(async () => {
    if (!studentId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/parent/students/${studentId}/assignments`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setAssignments(data.assignments ?? [])
        setStats(data.stats ?? { pending: 0, submitted: 0, overdue: 0, total: 0 })
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to load assignments')
      }
    } catch {
      toast.error('Failed to load assignments')
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    loadAssignments()
  }, [loadAssignments])

  const formatDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Submitted
          </Badge>
        )
      case 'overdue':
        return (
          <Badge variant="destructive">
            <AlertCircle className="mr-1 h-3 w-3" />
            Overdue
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        )
    }
  }

  const getTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      quiz: 'Quiz',
      assignment: 'Assignment',
      practice: 'Practice',
      assessment: 'Assessment',
      project: 'Project',
    }
    return map[type] ?? type
  }

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
            <h1 className="text-2xl font-bold">Assignments</h1>
            <p className="text-sm text-gray-500">
              View your child's assignment completion, AI grading, and tutor feedback
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <ClipboardList className="h-8 w-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Submitted</p>
                <p className="text-2xl font-bold">{stats.submitted}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Overdue</p>
                <p className="text-2xl font-bold">{stats.overdue}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assignments list */}
      <Card>
        <CardHeader>
          <CardTitle>All assignments</CardTitle>
          <CardDescription>
            Includes assignments, quizzes, and practice — with AI grading and tutor feedback
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
                <TabsTrigger value="submitted">Submitted ({stats.submitted})</TabsTrigger>
                <TabsTrigger value="overdue">Overdue ({stats.overdue})</TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-0">
                <div className="space-y-4">
                  {assignments
                    .filter(a => (activeTab === 'all' ? true : a.status === activeTab))
                    .map(a => (
                      <Card key={a.id} className="overflow-hidden">
                        <CardContent className="p-0">
                          <div className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate font-semibold">{a.title}</h3>
                                {getStatusBadge(a.status)}
                                <Badge variant="outline" className="text-xs">
                                  {getTypeLabel(a.type)}
                                </Badge>
                                {a.difficulty && (
                                  <Badge variant="outline" className="text-xs">
                                    {a.difficulty}
                                  </Badge>
                                )}
                              </div>
                              {a.description && (
                                <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                                  {a.description}
                                </p>
                              )}
                              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                                {a.lessonTitle && <span>{a.lessonTitle}</span>}
                                {a.courseName && <span>· {a.courseName}</span>}
                                {a.tutorName && <span>· Tutor: {a.tutorName}</span>}
                                {a.dueDate && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Due: {formatDate(a.dueDate)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-4">
                              {a.status === 'submitted' && a.score != null && (
                                <div className="flex items-center gap-1">
                                  <Trophy className="h-4 w-4 text-amber-500" />
                                  <span className="font-semibold">{Math.round(a.score)}%</span>
                                </div>
                              )}
                              <div className="text-sm text-gray-500">
                                <FileQuestion className="mr-1 inline h-4 w-4" />
                                {a.questionCount} questions
                              </div>
                            </div>
                          </div>

                          {/* AI & Teacher feedback */}
                          {(a.aiGraded || a.tutorFeedback) && (
                            <div className="space-y-2 border-t bg-gray-50/50 px-4 py-3">
                              {a.aiGraded && (
                                <div className="flex items-start gap-2">
                                  <Bot className="mt-0.5 h-4 w-4 shrink-0 text-purple-500" />
                                  <div className="text-sm">
                                    <span className="font-medium text-gray-700">
                                      AI grading
                                      {a.aiScore != null && `: ${Math.round(a.aiScore)}%`}
                                    </span>
                                    {a.aiComments && (
                                      <p className="mt-1 text-gray-600">{a.aiComments}</p>
                                    )}
                                    {a.aiStrengths.length > 0 && (
                                      <p className="mt-1 text-green-700">
                                        Strengths: {a.aiStrengths.join(', ')}
                                      </p>
                                    )}
                                    {a.aiImprovements.length > 0 && (
                                      <p className="mt-1 text-amber-700">
                                        Improvements: {a.aiImprovements.join(', ')}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}
                              {a.tutorFeedback && (
                                <div className="flex items-start gap-2">
                                  <User className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                                  <div className="text-sm">
                                    <span className="font-medium text-gray-700">
                                      Tutor feedback
                                      {a.tutorApproved && (
                                        <Badge variant="secondary" className="ml-2 text-xs">
                                          Reviewed
                                        </Badge>
                                      )}
                                    </span>
                                    <p className="mt-1 text-gray-600">{a.tutorFeedback}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {a.status === 'submitted' && a.submittedAt && (
                            <div className="border-t px-4 py-2 text-xs text-gray-500">
                              Submitted on {formatDate(a.submittedAt)}
                              {a.timeSpent != null && ` · ${Math.round(a.timeSpent / 60)} min`}
                              {a.attempts > 0 && ` · Attempt ${a.attempts}/${a.maxAttempts} `}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  {assignments.filter(a => (activeTab === 'all' ? true : a.status === activeTab))
                    .length === 0 && (
                    <div className="py-12 text-center text-gray-500">No assignments yet</div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
