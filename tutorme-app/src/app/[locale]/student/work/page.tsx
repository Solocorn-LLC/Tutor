'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { QuizModal, type QuestionResultItem } from '@/components/quiz/quiz-modal'
import {
  AssessmentReviewModal,
  type AssessmentReviewData,
} from '@/components/quiz/assessment-review-modal'
import { StudentQuiz } from '@/types/quiz'
import {
  ClipboardList,
  FileText,
  Video,
  Play,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trophy,
  Target,
  BookOpen,
  Loader2,
  ArrowRight,
  ExternalLink,
  PartyPopper,
  User,
  CheckCircle,
  BarChart3,
} from 'lucide-react'

// --- TYPES ---
interface AssignmentItem {
  id: string
  title: string
  description: string
  type: string
  difficulty: string
  dueDate: string | null
  maxScore: number
  status: 'pending' | 'submitted' | 'overdue'
  score: number | null
  submittedAt: string | null
  questionCount: number
  lessonId: string | null
  batchId: string | null
  documentSource?: string | null
}

interface TaskQuestion {
  id: string
  type: string
  question: string
  options?: string[]
  correctAnswer?: string
  points: number
  rubric?: string[]
  hints?: string[]
}

interface MissedSession {
  id: string
  title: string
  subject: string
  tutorName: string
  scheduledAt: string
  endedAt: string | null
  duration: number | null
  recordingUrl: string | null
  hasRecording: boolean
  leftEarly: boolean
}

interface ReplaySession {
  id: string
  title: string
  subject: string
  tutorName: string
  scheduledAt: string
  endedAt: string
  recordingUrl: string | null
  hasRecording: boolean
  taskCount: number
  submittedCount: number
  summaryPreview: string
  transcriptAvailable: boolean
  replayStatus: 'pending' | 'processing' | 'ready' | 'failed' | string
  generatedAt: string | null
}

// --- ASSIGNMENTS TAB COMPONENT ---
function AssignmentsTab() {
  const [assignments, setAssignments] = useState<AssignmentItem[]>([])
  const [stats, setStats] = useState({ pending: 0, submitted: 0, overdue: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  const [activeTask, setActiveTask] = useState<{
    id: string
    title: string
    questions: TaskQuestion[]
    answerReveal?: 'instant' | 'after_submit' | 'hidden' | 'student_choice'
  } | null>(null)
  const [studyMode, setStudyMode] = useState<'practice' | 'test' | null>(null)
  const [takingQuiz, setTakingQuiz] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [startTime, setStartTime] = useState<number>(0)
  const [reviewData, setReviewData] = useState<AssessmentReviewData | null>(null)

  const loadAssignments = useCallback(async () => {
    setLoading(true)
    // Legacy endpoint removed; show empty state
    setAssignments([])
    setStats({ pending: 0, submitted: 0, overdue: 0, total: 0 })
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAssignments()
  }, [loadAssignments])

  const handleStartTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/student/assignments/${taskId}`, { credentials: 'include' })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Cannot start this task')
        return
      }
      const data = await res.json()
      if (data.alreadySubmitted) {
        setReviewData({
          title: data.task.title,
          score: data.existingScore ?? null,
          maxScore: data.existingMaxScore ?? null,
          graded: data.existingGraded === true,
          feedback: data.existingFeedback ?? null,
          submittedAt: data.existingSubmittedAt ?? null,
          gradedAt: data.existingGradedAt ?? null,
          questions: data.task.questions ?? [],
          answers: data.existingAnswers ?? null,
          questionResults: data.existingQuestionResults ?? null,
        })
        return
      }
      setActiveTask({
        id: taskId,
        title: data.task.title,
        questions: data.task.questions,
        answerReveal: data.task.answerReveal,
      })
      setStudyMode(null)
      setStartTime(Date.now())
      setTakingQuiz(true)
    } catch {
      toast.error('Failed to load task')
    }
  }

  const handleQuizComplete = async (results: {
    score: number
    answers: Record<string, any>
    questionResults?: QuestionResultItem[]
  }) => {
    if (!activeTask) return
    setSubmitting(true)
    const timeSpentSec = Math.round((Date.now() - startTime) / 1000)

    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrf = csrfData?.token ?? null

      const submitRes = await fetch(`/api/student/assignments/${activeTask.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'X-CSRF-Token': csrf }),
        },
        credentials: 'include',
        body: JSON.stringify({ answers: results.answers, timeSpent: timeSpentSec }),
      })

      if (submitRes.ok) {
        const data = await submitRes.json()
        const submittedScore = data?.submission?.score
        toast.success(
          typeof submittedScore === 'number'
            ? `Submitted! Score: ${Math.round(submittedScore)}%`
            : 'Submitted! Awaiting grading.'
        )
        loadAssignments() // modal closes via its Continue button
        return {
          score: submittedScore ?? null,
          questionResults: data?.questionResults,
          correctAnswers: data?.correctAnswers,
        }
      } else if (submitRes.status === 409) {
        toast.info('Already submitted')
      } else {
        toast.error('Submission failed')
      }
    } catch {
      toast.error('Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCloseQuiz = () => {
    setTakingQuiz(false)
    setActiveTask(null)
    setStudyMode(null)
  }

  const parseDocumentSource = (raw?: string | null) => {
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'overdue':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      default:
        return <Clock className="h-5 w-5 text-amber-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return <Badge className="border-green-200 bg-green-100 text-green-700">Submitted</Badge>
      case 'overdue':
        return <Badge variant="destructive">Overdue</Badge>
      default:
        return <Badge className="border-amber-200 bg-amber-100 text-amber-700">Pending</Badge>
    }
  }

  const getTypeBadge = (type: string) => {
    const color =
      type === 'quiz'
        ? 'bg-blue-100 text-blue-700'
        : type === 'assignment' || type === 'homework'
          ? 'bg-purple-100 text-purple-700'
          : type === 'project'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-gray-100 text-gray-700'
    return <Badge className={`${color} border-0 capitalize`}>{type}</Badge>
  }

  const filtered =
    activeTab === 'all' ? assignments : assignments.filter(a => a.status === activeTab)

  if (takingQuiz && activeTask) {
    if (activeTask.answerReveal === 'student_choice' && studyMode === null) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-center text-lg font-bold text-gray-900">{activeTask.title}</h2>
            <p className="mt-1 text-center text-sm text-gray-500">How do you want to study?</p>
            <div className="mt-5 space-y-3">
              <button
                onClick={() => setStudyMode('practice')}
                className="w-full rounded-xl border border-[#F17623] bg-[#FFF4EC] p-4 text-left transition-colors hover:bg-[#ffe9d8]"
              >
                <p className="font-semibold text-[#9a4a12]">Practice</p>
                <p className="text-sm text-gray-600">
                  See the correct answer as you go — great for learning.
                </p>
              </button>
              <button
                onClick={() => setStudyMode('test')}
                className="w-full rounded-xl border border-gray-300 bg-gray-50 p-4 text-left transition-colors hover:bg-gray-100"
              >
                <p className="font-semibold text-gray-800">Test yourself</p>
                <p className="text-sm text-gray-600">
                  Answers stay hidden until you submit — check what you really know.
                </p>
              </button>
            </div>
            <Button variant="ghost" className="mt-4 w-full" onClick={handleCloseQuiz}>
              Cancel
            </Button>
          </div>
        </div>
      )
    }

    const effectiveReveal: 'instant' | 'after_submit' | 'hidden' =
      activeTask.answerReveal === 'student_choice'
        ? studyMode === 'practice'
          ? 'instant'
          : 'after_submit'
        : activeTask.answerReveal === 'after_submit'
          ? 'after_submit'
          : activeTask.answerReveal === 'hidden'
            ? 'hidden'
            : 'instant'

    const quizQuestions = activeTask.questions.map(q => ({
      id: q.id,
      type: (q.type === 'mcq' || q.type === 'multiple_choice'
        ? 'multiple_choice'
        : 'short_answer') as 'multiple_choice' | 'short_answer',
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      rubric: q.rubric?.join('; '),
    }))
    return (
      <QuizModal
        questions={quizQuestions}
        onComplete={handleQuizComplete}
        onClose={handleCloseQuiz}
        answerReveal={effectiveReveal}
      />
    )
  }

  return (
    <div className="space-y-6">
      {reviewData && (
        <AssessmentReviewModal data={reviewData} onClose={() => setReviewData(null)} />
      )}
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <BookOpen className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
              <Target className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Submitted</p>
                <p className="text-2xl font-bold">{stats.submitted}</p>
              </div>
              <Trophy className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
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

      {/* Tabs + List */}
      <Card>
        <CardHeader>
          <CardTitle>All Assignments</CardTitle>
          <CardDescription>Your upcoming and completed work</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
              <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
              <TabsTrigger value="submitted">Submitted ({stats.submitted})</TabsTrigger>
              <TabsTrigger value="overdue">Overdue ({stats.overdue})</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-0 space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center">
                  <ClipboardList className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-700">No assignments</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {activeTab === 'all'
                      ? 'No tasks have been assigned yet'
                      : `No ${activeTab} assignments`}
                  </p>
                </div>
              ) : (
                filtered.map(assignment => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-gray-50"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      {getStatusIcon(assignment.status)}
                      <div className="min-w-0">
                        <h3 className="truncate font-medium text-gray-900">{assignment.title}</h3>
                        <p className="line-clamp-1 text-sm text-gray-500">
                          {assignment.description}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {getTypeBadge(assignment.type)}
                          <Badge variant="outline" className="text-xs capitalize">
                            {assignment.difficulty}
                          </Badge>
                          {assignment.questionCount > 0 && (
                            <span className="text-xs text-gray-400">
                              {assignment.questionCount} questions
                            </span>
                          )}
                          {parseDocumentSource(assignment.documentSource)?.fileName && (
                            <Badge variant="outline" className="text-xs">
                              Source file
                            </Badge>
                          )}
                          {assignment.dueDate && (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <Calendar className="h-3 w-3" />
                              {new Date(assignment.dueDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="ml-4 flex flex-shrink-0 items-center gap-3">
                      {assignment.status === 'submitted' && assignment.score !== null && (
                        <span
                          className={`text-lg font-bold ${assignment.score >= 80 ? 'text-green-600' : assignment.score >= 60 ? 'text-amber-600' : 'text-red-600'}`}
                        >
                          {Math.round(assignment.score)}%
                        </span>
                      )}
                      {getStatusBadge(assignment.status)}
                      {assignment.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => handleStartTask(assignment.id)}
                          className="gap-1"
                        >
                          Start <ArrowRight className="h-3 w-3" />
                        </Button>
                      )}
                      {assignment.status === 'overdue' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStartTask(assignment.id)}
                          className="gap-1"
                        >
                          Submit Late <ArrowRight className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

// --- QUIZZES TAB COMPONENT ---
function QuizzesTab() {
  const router = useRouter()
  const [quizzes, setQuizzes] = useState<StudentQuiz[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('available')

  const fetchQuizzes = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/student/quizzes?status=${activeTab === 'completed' ? 'completed' : activeTab}`
      )
      if (res.ok) {
        const data = await res.json()
        setQuizzes(data.quizzes)
      }
    } catch {
      toast.error('Failed to load quizzes')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    fetchQuizzes()
  }, [fetchQuizzes])

  const getStatusBadge = (status: StudentQuiz['status']) => {
    switch (status) {
      case 'available':
        return <Badge className="bg-green-100 text-green-700">Available</Badge>
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-700">Completed</Badge>
      case 'overdue':
        return <Badge className="bg-red-100 text-red-700">Overdue</Badge>
      case 'upcoming':
        return <Badge className="bg-yellow-100 text-yellow-700">Upcoming</Badge>
      case 'locked':
        return <Badge variant="secondary">Locked</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      practice: 'Practice',
      graded: 'Graded',
      diagnostic: 'Diagnostic',
      survey: 'Survey',
    }
    return labels[type] || type
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="available">Available</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          {quizzes.length === 0 ? (
            <Card className="p-12 text-center">
              <FileText className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <h3 className="mb-2 text-lg font-medium">No quizzes found</h3>
              <p className="text-muted-foreground">
                {activeTab === 'available'
                  ? 'You have no quizzes available right now.'
                  : "You haven't completed any quizzes yet."}
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {quizzes.map(quiz => (
                <Card key={quiz.id} className={quiz.status === 'completed' ? 'opacity-75' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{quiz.title}</CardTitle>
                        <CardDescription>{getTypeLabel(quiz.type)}</CardDescription>
                      </div>
                      {getStatusBadge(quiz.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 flex flex-wrap gap-2">
                      <Badge variant="outline">{quiz.totalQuestions} questions</Badge>
                      <Badge variant="outline">{quiz.totalPoints} points</Badge>
                      {quiz.timeLimit && (
                        <Badge variant="outline">
                          <Clock className="mr-1 h-3 w-3" />
                          {quiz.timeLimit} min
                        </Badge>
                      )}
                    </div>
                    {quiz.dueDate && (
                      <div className="text-muted-foreground mb-4 flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4" />
                        Due {new Date(quiz.dueDate).toLocaleDateString()}
                      </div>
                    )}
                    {quiz.attemptsMade > 0 && (
                      <div className="mb-4 rounded-lg bg-gray-50 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium">Attempts: {quiz.attemptsMade}</span>
                          {quiz.bestScore !== undefined && (
                            <span className="text-sm">
                              Best:{' '}
                              <span className="font-bold text-green-600">{quiz.bestScore}%</span>
                            </span>
                          )}
                        </div>
                        {quiz.bestScore !== undefined && (
                          <Progress value={quiz.bestScore} className="h-2" />
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-sm">
                        {quiz.attemptsMade} / {quiz.allowedAttempts} attempts
                      </span>
                      {quiz.canAttempt ? (
                        <Button
                          size="sm"
                          onClick={() => router.push(`/student/quizzes/${quiz.id}`)}
                        >
                          <Play className="mr-2 h-4 w-4" />
                          {quiz.attemptsMade > 0 ? 'Retake' : 'Start'}
                        </Button>
                      ) : quiz.status === 'completed' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/student/quizzes/${quiz.id}`)}
                        >
                          <BarChart3 className="mr-2 h-4 w-4" />
                          Review
                        </Button>
                      ) : (
                        <Badge variant="secondary">Not Available</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// --- MISSED LESSONS TAB COMPONENT ---
function MissedLessonsTab() {
  const [sessions, setSessions] = useState<MissedSession[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'week' | 'month'>('all')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/student/missed-classes?filter=${filter}`)
      .then(r => r.json())
      .then(res => {
        if (res.success) setSessions(res.data.sessions)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [filter])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['all', 'week', 'month'] as const).map(f => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f === 'all' ? 'All Time' : f === 'week' ? 'This Week' : 'This Month'}
          </Button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <PartyPopper className="mx-auto mb-3 h-12 w-12 text-green-400" />
            <h3 className="font-semibold text-gray-900">No missed classes!</h3>
            <p className="mt-1 text-sm text-gray-500">
              Great job — you&apos;ve been attending all your classes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => (
            <Card key={session.id} className="transition-shadow hover:shadow-sm">
              <CardContent className="pb-5 pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="truncate font-medium">{session.title}</h3>
                      {session.leftEarly && (
                        <Badge
                          variant="outline"
                          className="border-amber-200 text-xs text-amber-700"
                        >
                          Left early
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {session.tutorName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(session.scheduledAt)}
                      </span>
                      {session.duration && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {session.duration} min
                        </span>
                      )}
                    </div>
                    <Badge variant="secondary" className="mt-2 text-xs">
                      {session.subject}
                    </Badge>
                  </div>
                  <div className="flex-shrink-0">
                    {session.hasRecording ? (
                      <a href={session.recordingUrl!} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" className="gap-1.5">
                          <Play className="h-3.5 w-3.5" />
                          Watch
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </a>
                    ) : (
                      <Badge variant="secondary">No recording</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// --- LESSON REPLAYS TAB COMPONENT ---
function LessonReplaysTab() {
  const [sessions, setSessions] = useState<ReplaySession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/student/lesson-replays')
      .then(res => res.json())
      .then(payload => {
        if (payload.success) setSessions(payload.data.sessions || [])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Video className="mx-auto mb-3 h-12 w-12 text-gray-400" />
            <h3 className="font-semibold text-gray-900">No lesson replays yet</h3>
            <p className="mt-1 text-sm text-gray-500">Attend live classes to see replays here.</p>
          </CardContent>
        </Card>
      ) : (
        sessions.map(session => (
          <Card key={session.id}>
            <CardContent className="space-y-3 pb-5 pt-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{session.title}</h3>
                  <p className="text-muted-foreground text-sm">
                    {session.subject} · {session.tutorName}
                  </p>
                </div>
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Replay
                </Badge>
              </div>
              <div className="text-muted-foreground flex gap-3 text-xs">
                <span>Tasks: {session.taskCount}</span>
                <span>Submitted: {session.submittedCount}</span>
                <span>Status: {session.replayStatus}</span>
              </div>
              {session.summaryPreview && (
                <div className="bg-muted/30 flex gap-2 rounded-md border p-2.5 text-xs">
                  <FileText className="mt-0.5 h-3.5 w-3.5" />
                  <span>{session.summaryPreview}</span>
                </div>
              )}
              <div className="flex gap-2">
                {session.hasRecording && session.recordingUrl ? (
                  <a href={session.recordingUrl} target="_blank" rel="noreferrer">
                    <Button size="sm" className="gap-1.5">
                      <Play className="h-3.5 w-3.5" />
                      Watch Replay
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </a>
                ) : (
                  <Badge variant="secondary">Recording processing</Badge>
                )}
                {session.transcriptAvailable && <Badge variant="outline">Transcript ready</Badge>}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

// --- MAIN PAGE ---
export default function StudentWorkPage() {
  const [activeTab, setActiveTab] = useState('assignments')

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <ClipboardList className="h-6 w-6" />
          My Work
        </h1>
        <p className="mt-1 text-gray-600">
          Manage your assignments, quizzes, missed lessons, and lesson replays
        </p>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="assignments">
            <ClipboardList className="mr-2 h-4 w-4" />
            Assignments
          </TabsTrigger>
          <TabsTrigger value="quizzes">
            <FileText className="mr-2 h-4 w-4" />
            Quizzes
          </TabsTrigger>
          <TabsTrigger value="missed">
            <Video className="mr-2 h-4 w-4" />
            Missed Lessons
          </TabsTrigger>
          <TabsTrigger value="replays">
            <Play className="mr-2 h-4 w-4" />
            Replays
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assignments">
          <AssignmentsTab />
        </TabsContent>

        <TabsContent value="quizzes">
          <QuizzesTab />
        </TabsContent>

        <TabsContent value="missed">
          <MissedLessonsTab />
        </TabsContent>

        <TabsContent value="replays">
          <LessonReplaysTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
