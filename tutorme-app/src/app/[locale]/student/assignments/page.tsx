'use client'

import { useState, useEffect, useCallback } from 'react'
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
  ArrowRight,
  Trophy,
  Target,
  BookOpen,
} from 'lucide-react'
import { QuizModal, type QuestionResultItem } from '@/components/quiz/quiz-modal'
import {
  AssessmentReviewModal,
  type AssessmentReviewData,
} from '@/components/quiz/assessment-review-modal'
import { toast } from 'sonner'

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

interface ParsedDocumentSource {
  fileName?: string
  fileUrl?: string
  mimeType?: string
}

export default function StudentAssignmentsPage() {
  const [assignments, setAssignments] = useState<AssignmentItem[]>([])
  const [stats, setStats] = useState({ pending: 0, submitted: 0, overdue: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  // Quiz-taking state
  const [activeTask, setActiveTask] = useState<{
    id: string
    title: string
    questions: TaskQuestion[]
    answerReveal?: 'instant' | 'after_submit' | 'hidden' | 'student_choice'
  } | null>(null)
  // For 'student_choice' tasks: the student's self-study selection (null until
  // they pick). 'practice' reveals answers as they go; 'test' hides until submit.
  const [studyMode, setStudyMode] = useState<'practice' | 'test' | null>(null)
  const [takingQuiz, setTakingQuiz] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [startTime, setStartTime] = useState<number>(0)
  // Review of an already-submitted assessment (score + feedback + per-question).
  const [reviewData, setReviewData] = useState<AssessmentReviewData | null>(null)

  const loadAssignments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/student/feedback/tasks', { credentials: 'include' })
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      const tasks: Array<{ id: string; title: string; content?: string; type?: string }> =
        data?.tasks ?? []
      const items: AssignmentItem[] = tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: (t.content ?? '').slice(0, 240),
        type: t.type === 'assessment' ? 'assessment' : 'task',
        difficulty: 'medium',
        dueDate: null,
        maxScore: 100,
        status: 'pending',
        score: null,
        submittedAt: null,
        questionCount: 0,
        lessonId: null,
        batchId: null,
      }))
      setAssignments(items)
      setStats({ pending: items.length, submitted: 0, overdue: 0, total: items.length })
    } catch {
      setAssignments([])
      setStats({ pending: 0, submitted: 0, overdue: 0, total: 0 })
    } finally {
      setLoading(false)
    }
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
        // Re-open the graded assessment for review: score + tutor feedback +
        // per-question breakdown, instead of a one-line toast.
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
      // Map to QuizModal question format
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
      // 1. Submit to the assignment submission endpoint
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
        // Score is computed server-side; only the answers/time are sent.
        body: JSON.stringify({
          answers: results.answers,
          timeSpent: timeSpentSec,
        }),
      })

      if (submitRes.ok) {
        const data = await submitRes.json()
        const submittedScore = data?.submission?.score
        toast.success(
          typeof submittedScore === 'number'
            ? `Submitted! Score: ${Math.round(submittedScore)}%`
            : 'Submitted! Awaiting grading.'
        )
        loadAssignments() // refresh list (modal closes via its Continue button)
        // Hand the authoritative server grade back so the results screen can
        // show the real score + (when allowed) the correct answers.
        return {
          score: data?.submission?.score ?? null,
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

  const parseDocumentSource = (raw?: string | null): ParsedDocumentSource | null => {
    if (!raw) return null
    try {
      return JSON.parse(raw) as ParsedDocumentSource
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

  // Quiz-taking overlay
  if (takingQuiz && activeTask) {
    // Self-study tasks: let the student pick practice vs test before starting.
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

    // Resolve the student's choice to a concrete reveal mode for the quiz.
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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {reviewData && (
        <AssessmentReviewModal data={reviewData} onClose={() => setReviewData(null)} />
      )}
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <ClipboardList className="h-6 w-6" />
          Assignments
        </h1>
        <p className="mt-1 text-gray-600">Track your homework, quizzes, and projects</p>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
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
          <CardContent className="pt-6">
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
          <CardContent className="pt-6">
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
                  <FileQuestion className="mx-auto mb-4 h-12 w-12 text-gray-300" />
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
                    <div className="flex items-center gap-4">
                      {getStatusIcon(assignment.status)}
                      <div>
                        <h3 className="font-medium text-gray-900">{assignment.title}</h3>
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
                              Source file:{' '}
                              {parseDocumentSource(assignment.documentSource)?.fileName}
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
                    <div className="ml-4 flex items-center gap-3">
                      {parseDocumentSource(assignment.documentSource)?.fileUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            window.open(
                              parseDocumentSource(assignment.documentSource)?.fileUrl,
                              '_blank'
                            )
                          }
                        >
                          Open Source
                        </Button>
                      )}
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
