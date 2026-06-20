/**
 * Course Sidebar Component
 * Shows course modules and lessons for the student
 * Allows linking tutoring sessions to specific lessons
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  CheckCircle,
  Circle,
  PlayCircle,
  GraduationCap,
  PanelLeft,
  PanelLeftClose,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { scrollElementIntoView } from '@/lib/scroll-into-view'

interface Lesson {
  id: string
  title: string
  order: number
  duration: number
  difficulty: string
  progress?: {
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'
    completedAt?: string
    score?: number
  }
}

interface Module {
  id: string
  title: string
  description: string
  order: number
  estimatedHours: number
  skills: string[]
  lessons: Lesson[]
}

interface Course {
  id: string
  name: string
  category: string
  description: string
  modules: Module[]
}

interface CourseSidebarProps {
  course: Course
  currentLessonId?: string
  onSelectLesson?: (lesson: Lesson, module: Module) => void
  compact?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function CourseSidebar({
  course,
  currentLessonId,
  onSelectLesson,
  compact = false,
  collapsed = false,
  onToggleCollapse,
}: CourseSidebarProps) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())

  const itemRefs = useRef<Record<string, HTMLElement | null>>({})
  const prevExpandedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    expandedModules.forEach(id => {
      if (!prevExpandedRef.current.has(id)) {
        const el = itemRefs.current[id]
        if (el) scrollElementIntoView(el, { margin: 16 })
      }
    })
    prevExpandedRef.current = new Set(expandedModules)
  }, [expandedModules])

  // Expand first incomplete module by default
  useEffect(() => {
    if (course.modules.length > 0) {
      for (const module of course.modules) {
        const hasIncomplete = module.lessons.some(
          l => !l.progress || l.progress.status !== 'COMPLETED'
        )
        if (hasIncomplete) {
          setExpandedModules(new Set([module.id]))
          break
        }
      }
    }
  }, [course.modules])

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(moduleId)) {
        next.delete(moduleId)
      } else {
        next.add(moduleId)
      }
      return next
    })
  }

  const getLessonIcon = (lesson: Lesson) => {
    if (lesson.progress?.status === 'COMPLETED') {
      return <CheckCircle className="h-4 w-4 text-green-500" />
    }
    if (lesson.progress?.status === 'IN_PROGRESS') {
      return <PlayCircle className="h-4 w-4 text-blue-500" />
    }
    return <Circle className="h-4 w-4 text-gray-300" />
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-700'
      case 'medium':
        return 'bg-yellow-100 text-yellow-700'
      case 'hard':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  // Calculate overall progress
  const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0)
  const completedLessons = course.modules.reduce(
    (acc, m) => acc + m.lessons.filter(l => l.progress?.status === 'COMPLETED').length,
    0
  )
  const progressPercentage = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0

  // Collapsed mode - icon bar
  if (collapsed) {
    return (
      <div className="flex w-16 flex-col items-center py-3">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="mb-2">
          <PanelLeft className="h-4 w-4" />
        </Button>

        <div className="my-2 h-px w-8 bg-gray-200" />

        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 to-blue-100">
          <GraduationCap className="h-5 w-5 text-purple-600" />
        </div>

        <div className="text-center">
          <span className="text-xs font-bold text-purple-600">
            {Math.round(progressPercentage)}%
          </span>
        </div>

        <div className="my-2 h-px w-8 bg-gray-200" />

        <div className="flex flex-col items-center gap-1">
          {course.modules.slice(0, 4).map((module, idx) => (
            <div
              key={module.id}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium',
                module.lessons.some(l => l.progress?.status === 'COMPLETED')
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
              )}
              title={module.title}
            >
              {idx + 1}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border bg-gradient-to-br from-purple-50 to-blue-50 p-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-purple-600" />
            <span className="text-sm font-medium">{course.name}</span>
          </div>
          <Progress value={progressPercentage} className="mt-2 h-1.5" />
          <p className="mt-1 text-xs text-gray-500">
            {completedLessons}/{totalLessons} lessons completed
          </p>
        </div>

        <div className="space-y-1">
          {course.modules.slice(0, 2).map(module => (
            <div key={module.id} className="text-sm">
              <p className="truncate font-medium text-gray-700">{module.title}</p>
              <div className="mt-1 flex gap-1">
                {module.skills.slice(0, 2).map(skill => (
                  <Badge key={skill} variant="secondary" className="text-xs capitalize">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Course Header */}
      <div className="border-b bg-gradient-to-br from-purple-50 to-blue-50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-purple-600" />
            <h3 className="font-semibold">{course.name}</h3>
          </div>
          {onToggleCollapse && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleCollapse}>
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-600">{course.description}</p>

        {/* Progress */}
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-gray-600">Progress</span>
            <span className="font-medium">{Math.round(progressPercentage)}%</span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
          <p className="mt-1 text-xs text-gray-500">
            {completedLessons} of {totalLessons} lessons completed
          </p>
        </div>
      </div>

      {/* Modules List */}
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {course.modules.map((module, index) => {
            const isExpanded = expandedModules.has(module.id)
            const completedInModule = module.lessons.filter(
              l => l.progress?.status === 'COMPLETED'
            ).length

            return (
              <div key={module.id} className="overflow-hidden rounded-lg border">
                {/* Module Header */}
                <button
                  onClick={() => toggleModule(module.id)}
                  className="flex w-full items-center gap-2 p-3 text-left transition-colors hover:bg-gray-50"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      Module {index + 1}: {module.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {completedInModule}/{module.lessons.length} lessons • {module.estimatedHours}h
                    </p>
                  </div>
                </button>

                {/* Lessons List */}
                {isExpanded && (
                  <div
                    ref={el => {
                      itemRefs.current[module.id] = el
                    }}
                    className="border-t bg-gray-50/50"
                  >
                    {module.lessons.map(lesson => (
                      <button
                        key={lesson.id}
                        onClick={() => onSelectLesson?.(lesson, module)}
                        className={`flex w-full items-start gap-2 p-3 text-left transition-colors hover:bg-white ${
                          currentLessonId === lesson.id
                            ? 'border-l-2 border-blue-500 bg-blue-50'
                            : ''
                        }`}
                      >
                        {getLessonIcon(lesson)}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{lesson.title}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-xs text-gray-400">{lesson.duration} min</span>
                            <Badge className={`text-xs ${getDifficultyColor(lesson.difficulty)}`}>
                              {lesson.difficulty}
                            </Badge>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

export function CourseMiniCard({ courseId }: { courseId: string }) {
  const [course, setCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCourse()
  }, [courseId])

  const fetchCourse = async () => {
    try {
      const res = await fetch(`/api/course`)
      const data = await res.json()
      if (data.course) {
        setCourse(data.course)
      }
    } catch (error) {
      console.error('Failed to load course:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse rounded-lg border p-4">
        <div className="h-4 w-3/4 rounded bg-gray-200"></div>
        <div className="mt-2 h-3 w-1/2 rounded bg-gray-200"></div>
      </div>
    )
  }

  if (!course) return null

  return (
    <div className="rounded-lg border bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-purple-600" />
        <span className="font-medium">{course.name}</span>
      </div>
      <p className="mt-1 text-sm text-gray-600">{course.modules.length} modules</p>
    </div>
  )
}
