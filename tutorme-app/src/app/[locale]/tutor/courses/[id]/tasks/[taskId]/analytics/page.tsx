'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import {
  ArrowLeft,
  BarChart3,
  Users,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Loader2,
  FileQuestion,
  Award,
  Timer,
  Lightbulb,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts'
import { ClientOnly } from '@/components/common/ClientOnly'
import { BackButton } from '@/components/navigation'

// ---- Types ----

interface TaskMeta {
  id: string
  title: string
  type: string
  difficulty: string
  maxScore: number
  dueDate: string | null
  questionCount: number
}

interface Overview {
  totalSubmissions: number
  averageScore: number
  medianScore: number
  highestScore: number
  lowestScore: number
  averageTimeSeconds: number
  completionRate: number
}

interface QuestionStat {
  questionId: string
  questionText: string
  questionType: string
  totalAttempts: number
  correctCount: number
  wrongCount: number
  correctRate: number
  avgPoints: number
  maxPoints: number
  avgTimeSec: number | null
  commonWrongAnswers: { answer: string; count: number }[]
  needsReview: boolean
}

interface StudentScore {
  studentId: string
  studentName: string
  score: number
  maxScore: number
  timeSpent: number
  submittedAt: string
  status: string
}

interface AnalyticsData {
  task: TaskMeta
  overview: Overview
  scoreDistribution: { range: string; count: number }[]
  questionStats: QuestionStat[]
  questionsNeedingReview: QuestionStat[]
  studentScores: StudentScore[]
}

// ---- Color helpers ----

const DIST_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6']

function scoreColor(pct: number) {
  if (pct >= 80) return 'text-green-600'
  if (pct >= 60) return 'text-amber-600'
  return 'text-red-600'
}

function scoreBg(pct: number) {
  if (pct >= 80) return 'bg-green-100 border-green-200'
  if (pct >= 60) return 'bg-amber-100 border-amber-200'
  return 'bg-red-100 border-red-200'
}

function fmtTime(sec: number) {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

// ---- Page ----

export default function TaskAnalyticsPage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params?.id as string
  const taskId = params?.taskId as string

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    if (!courseId || !taskId) return
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/tutor/courses/${courseId}/tasks/${taskId}/analytics`, {
          credentials: 'include',
        })
        if (res.ok) {
          setData(await res.json())
        } else {
          toast.error('Failed to load analytics')
        }
      } catch {
        toast.error('Failed to load analytics')
      } finally {
        setLoading(false)
      }
    })()
  }, [courseId, taskId])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
            <h2 className="mb-2 text-xl font-bold">Analytics Unavailable</h2>
            <p className="mb-4 text-gray-500">No data found for this task</p>
            <Button onClick={() => router.back()}>Go Back</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const {
    task,
    overview,
    scoreDistribution,
    questionStats,
    questionsNeedingReview,
    studentScores,
  } = data

  // Pie data for correct/wrong overview
  const totalCorrect = questionStats.reduce((s, q) => s + q.correctCount, 0)
  const totalWrong = questionStats.reduce((s, q) => s + q.wrongCount, 0)
  const pieData = [
    { name: 'Correct', value: totalCorrect, color: '#22c55e' },
    { name: 'Incorrect', value: totalWrong, color: '#ef4444' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="w-full">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BackButton href={`/tutor/courses/${courseId}/tasks`} />
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <BarChart3 className="h-6 w-6 text-blue-500" />
                Task Analytics
              </h1>
              <p className="text-gray-500">{task.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {task.type}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {task.difficulty}
            </Badge>
            {task.questionCount > 0 && (
              <Badge variant="secondary">{task.questionCount} questions</Badge>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          <Card>
            <CardContent className="pb-4 pt-5">
              <div className="mb-1 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-gray-500">Submissions</span>
              </div>
              <p className="text-2xl font-bold">{overview.totalSubmissions}</p>
              <p className="text-xs text-gray-400">{overview.completionRate}% completion</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pb-4 pt-5">
              <div className="mb-1 flex items-center gap-2">
                <Target className="h-4 w-4 text-green-500" />
                <span className="text-xs text-gray-500">Average Score</span>
              </div>
              <p className={`text-2xl font-bold ${scoreColor(overview.averageScore)}`}>
                {overview.averageScore}%
              </p>
              <p className="text-xs text-gray-400">Median: {overview.medianScore}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pb-4 pt-5">
              <div className="mb-1 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <span className="text-xs text-gray-500">Highest</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">{overview.highestScore}%</p>
              <p className="text-xs text-gray-400">Lowest: {overview.lowestScore}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pb-4 pt-5">
              <div className="mb-1 flex items-center gap-2">
                <Timer className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-gray-500">Avg Time</span>
              </div>
              <p className="text-2xl font-bold">{fmtTime(overview.averageTimeSeconds)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pb-4 pt-5">
              <div className="mb-1 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-xs text-gray-500">Correct</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{totalCorrect}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pb-4 pt-5">
              <div className="mb-1 flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-xs text-gray-500">Incorrect</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{totalWrong}</p>
            </CardContent>
          </Card>
        </div>

        {/* Questions Needing Review Banner */}
        {questionsNeedingReview.length > 0 && (
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardContent className="pb-4 pt-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">
                    {questionsNeedingReview.length} question
                    {questionsNeedingReview.length > 1 ? 's' : ''} need review
                  </p>
                  <p className="mt-1 text-sm text-amber-700">
                    Over 60% of students got these wrong — consider re-teaching the concepts.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {questionsNeedingReview.map(q => (
                      <Badge
                        key={q.questionId}
                        className="border-amber-300 bg-amber-200 text-amber-800"
                      >
                        {q.questionText.slice(0, 50)}
                        {q.questionText.length > 50 ? '…' : ''}
                        <span className="ml-1 opacity-70">({q.correctRate}% correct)</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="overview" className="gap-1.5">
              <BarChart3 className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="questions" className="gap-1.5">
              <FileQuestion className="h-4 w-4" /> Per-Question
            </TabsTrigger>
            <TabsTrigger value="students" className="gap-1.5">
              <Users className="h-4 w-4" /> Students
            </TabsTrigger>
          </TabsList>

          {/* ---- OVERVIEW TAB ---- */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Score Distribution Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Score Distribution</CardTitle>
                  <CardDescription>How students scored across ranges</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 min-h-[16rem]">
                    <ClientOnly fallback={<div className="h-full w-full" />}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={scoreDistribution}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="range" fontSize={12} />
                          <YAxis allowDecimals={false} fontSize={12} />
                          <Tooltip />
                          <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]}>
                            {scoreDistribution.map((_entry, index) => (
                              <Cell key={index} fill={DIST_COLORS[index]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </ClientOnly>
                  </div>
                </CardContent>
              </Card>

              {/* Correct vs Incorrect Pie */}
              <Card>
                <CardHeader>
                  <CardTitle>Answer Accuracy</CardTitle>
                  <CardDescription>Correct vs incorrect across all questions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 min-h-[16rem]">
                    <ClientOnly fallback={<div className="h-full w-full" />}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={4}
                            dataKey="value"
                            label={({ name, percent }) =>
                              `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                            }
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={index} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </ClientOnly>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ---- PER-QUESTION TAB ---- */}
          <TabsContent value="questions" className="space-y-4">
            {questionStats.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileQuestion className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                  <p className="text-gray-500">No per-question data yet</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Per-question bar chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Correct Rate by Question</CardTitle>
                    <CardDescription>
                      Percentage of students who answered each question correctly
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72 min-h-[18rem]">
                      <ClientOnly fallback={<div className="h-full w-full" />}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={questionStats.map((q, i) => ({
                              name: `Q${i + 1}`,
                              correctRate: q.correctRate,
                              fill: q.needsReview
                                ? '#ef4444'
                                : q.correctRate >= 80
                                  ? '#22c55e'
                                  : '#eab308',
                            }))}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis domain={[0, 100]} fontSize={12} unit="%" />
                            <Tooltip formatter={v => `${v ?? 0}%`} />
                            <Bar dataKey="correctRate" name="Correct %" radius={[4, 4, 0, 0]}>
                              {questionStats.map((q, i) => (
                                <Cell
                                  key={i}
                                  fill={
                                    q.needsReview
                                      ? '#ef4444'
                                      : q.correctRate >= 80
                                        ? '#22c55e'
                                        : '#eab308'
                                  }
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </ClientOnly>
                    </div>
                  </CardContent>
                </Card>

                {/* Question detail cards */}
                {questionStats.map((q, idx) => (
                  <Card key={q.questionId} className={q.needsReview ? 'border-red-200' : ''}>
                    <CardContent className="pb-4 pt-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="font-bold text-gray-700">Q{idx + 1}</span>
                            <Badge variant="outline" className="text-xs capitalize">
                              {q.questionType}
                            </Badge>
                            {q.needsReview && (
                              <Badge className="gap-1 border-red-200 bg-red-100 text-xs text-red-700">
                                <AlertTriangle className="h-3 w-3" /> Needs Review
                              </Badge>
                            )}
                          </div>
                          <p className="mb-3 text-sm text-gray-600">{q.questionText}</p>
                          <div className="mb-2 flex items-center gap-2">
                            <Progress
                              value={q.correctRate}
                              className={`h-2 flex-1 ${q.needsReview ? '[&>div]:bg-red-500' : q.correctRate >= 80 ? '[&>div]:bg-green-500' : '[&>div]:bg-amber-500'}`}
                            />
                            <span
                              className={`text-sm font-bold ${q.correctRate >= 80 ? 'text-green-600' : q.correctRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}
                            >
                              {q.correctRate}%
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>
                              {q.correctCount}/{q.totalAttempts} correct
                            </span>
                            <span>
                              Avg: {q.avgPoints}/{q.maxPoints} pts
                            </span>
                            {q.avgTimeSec !== null && (
                              <span>Avg time: {fmtTime(q.avgTimeSec)}</span>
                            )}
                          </div>
                          {/* Common wrong answers */}
                          {q.commonWrongAnswers.length > 0 && (
                            <div className="mt-3 rounded-lg border border-red-100 bg-red-50 p-3">
                              <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-red-700">
                                <Lightbulb className="h-3 w-3" /> Common wrong answers
                              </p>
                              {q.commonWrongAnswers.map((wa, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 text-xs text-red-600"
                                >
                                  <XCircle className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">&quot;{wa.answer}&quot;</span>
                                  <span className="text-red-400">({wa.count} students)</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </TabsContent>

          {/* ---- STUDENTS TAB ---- */}
          <TabsContent value="students" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Student Scores</CardTitle>
                <CardDescription>{studentScores.length} submissions</CardDescription>
              </CardHeader>
              <CardContent>
                {studentScores.length === 0 ? (
                  <div className="py-12 text-center">
                    <Users className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                    <p className="text-gray-500">No submissions yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="p-3 text-left font-medium">Student</th>
                          <th className="p-3 text-left font-medium">Score</th>
                          <th className="p-3 text-left font-medium">%</th>
                          <th className="p-3 text-left font-medium">Time</th>
                          <th className="p-3 text-left font-medium">Submitted</th>
                          <th className="p-3 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentScores
                          .sort((a, b) => b.score - a.score)
                          .map(s => {
                            const pct =
                              s.maxScore > 0 ? Math.round((s.score / s.maxScore) * 100) : 0
                            return (
                              <tr key={s.studentId} className="border-b hover:bg-gray-50">
                                <td className="p-3">
                                  <Link
                                    href={`/tutor/reports/${s.studentId}`}
                                    className="font-medium text-blue-500 hover:underline"
                                  >
                                    {s.studentName}
                                  </Link>
                                </td>
                                <td className="p-3">
                                  {Math.round(s.score)}/{s.maxScore}
                                </td>
                                <td className="p-3">
                                  <span className={`font-bold ${scoreColor(pct)}`}>{pct}%</span>
                                </td>
                                <td className="p-3 text-gray-500">{fmtTime(s.timeSpent)}</td>
                                <td className="p-3 text-gray-500">
                                  {new Date(s.submittedAt).toLocaleDateString()}
                                </td>
                                <td className="p-3">
                                  <Badge
                                    className={
                                      s.status === 'graded'
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-blue-100 text-blue-600'
                                    }
                                  >
                                    {s.status}
                                  </Badge>
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
