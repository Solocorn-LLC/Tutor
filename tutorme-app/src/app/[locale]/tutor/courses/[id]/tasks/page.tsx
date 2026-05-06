'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileQuestion,
  Loader2,
  Plus,
  Send,
  Trash2,
  PenTool,
  Users,
  Eye,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

interface TaskItem {
  id: string
  title: string
  description: string
  type: string
  difficulty: string
  status: string
  lessonId: string | null
  batchId: string | null
  dueDate: string | null
  maxScore: number
  questionCount: number
  assignmentCount: number
  submissionCount: number
  distributionMode: string
  createdAt: string
  assignedAt: string | null
}

export default function CourseTasksPage() {
  const params = useParams()
  const courseId = params?.id as string

  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadTasks = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tutor/courses/${courseId}/tasks`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setTasks(data.tasks ?? [])
      }
    } catch {
      toast.error('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (courseId) loadTasks()
  }, [courseId])

  const handlePublish = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tutor/courses/${courseId}/tasks/${taskId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ assignTo: 'all' }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(data.message)
        loadTasks()
      } else {
        toast.error('Failed to publish')
      }
    } catch {
      toast.error('Failed to publish')
    }
  }

  const handleDelete = async (taskId: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/tutor/courses/${courseId}/tasks/${taskId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) {
        toast.success('Task deleted')
        loadTasks()
      } else {
        toast.error('Failed to delete')
      }
    } catch {
      toast.error('Failed to delete')
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'assigned':
        return <Badge className="border-green-200 bg-green-100 text-green-700">Assigned</Badge>
      case 'completed':
        return <Badge className="border-blue-200 bg-blue-100 text-blue-700">Completed</Badge>
      default:
        return <Badge className="border-gray-200 bg-gray-100 text-gray-700">Draft</Badge>
    }
  }

  const getTypeBadge = (type: string) => {
    const color =
      type === 'quiz'
        ? 'bg-red-100 text-red-700'
        : type === 'assignment'
          ? 'bg-purple-100 text-purple-700'
          : type === 'project'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-orange-100 text-orange-700'
    return <Badge className={`${color} border-0 capitalize`}>{type}</Badge>
  }

  const drafts = tasks.filter(t => t.status === 'draft')
  const assigned = tasks.filter(t => t.status === 'assigned')
  const completed = tasks.filter(t => t.status === 'completed')

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="w-full">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/tutor/courses/${courseId}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <ClipboardList className="h-6 w-6 text-blue-500" />
                Course Tasks
              </h1>
              <p className="text-gray-500">Manage tasks, quizzes, and assignments</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/tutor/insights?tab=builder&courseId=${courseId}`}>
              <Button variant="outline" className="gap-1.5">
                <Plus className="h-4 w-4" /> Create in Builder
              </Button>
            </Link>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pb-4 pt-5">
              <div className="mb-1 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-gray-500">Total Tasks</span>
              </div>
              <p className="text-2xl font-bold">{tasks.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pb-4 pt-5">
              <div className="mb-1 flex items-center gap-2">
                <PenTool className="h-4 w-4 text-gray-500" />
                <span className="text-xs text-gray-500">Drafts</span>
              </div>
              <p className="text-2xl font-bold">{drafts.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pb-4 pt-5">
              <div className="mb-1 flex items-center gap-2">
                <Send className="h-4 w-4 text-green-500" />
                <span className="text-xs text-gray-500">Assigned</span>
              </div>
              <p className="text-2xl font-bold">{assigned.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pb-4 pt-5">
              <div className="mb-1 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-gray-500">Submissions</span>
              </div>
              <p className="text-2xl font-bold">
                {tasks.reduce((s, t) => s + t.submissionCount, 0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Task List */}
        <Card>
          <CardHeader>
            <CardTitle>All Tasks</CardTitle>
            <CardDescription>Click analytics to view per-question performance</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="py-12 text-center">
                <FileQuestion className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-700">No tasks yet</h3>
                <p className="mb-4 mt-1 text-sm text-gray-500">
                  Create tasks, quizzes, and homework from the Course Builder
                </p>
                <Link href={`/tutor/insights?tab=builder&courseId=${courseId}`}>
                  <Button className="gap-1.5">
                    <Plus className="h-4 w-4" /> Open Builder
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-gray-900">{task.title}</h3>
                        {getTypeBadge(task.type)}
                        {getStatusBadge(task.status)}
                        <Badge variant="outline" className="text-xs capitalize">
                          {task.difficulty}
                        </Badge>
                      </div>
                      <p className="line-clamp-1 text-sm text-gray-500">{task.description}</p>
                      <div className="mt-1.5 flex items-center gap-4 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <FileQuestion className="h-3 w-3" />
                          {task.questionCount} questions
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {task.assignmentCount} assigned
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {task.submissionCount} submitted
                        </span>
                        {task.dueDate && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Due {new Date(task.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex items-center gap-2">
                      {task.status === 'draft' && (
                        <Button size="sm" onClick={() => handlePublish(task.id)} className="gap-1">
                          <Send className="h-3 w-3" /> Publish
                        </Button>
                      )}
                      {task.submissionCount > 0 && (
                        <Link href={`/tutor/courses/${courseId}/tasks/${task.id}/analytics`}>
                          <Button size="sm" variant="outline" className="gap-1">
                            <BarChart3 className="h-3 w-3" /> Analytics
                          </Button>
                        </Link>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(task.id, task.title)}
                        className="text-red-500 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
