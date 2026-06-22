'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  BookOpen,
  Trophy,
  Heart,
  CalendarDays,
  Target,
  Clock,
  Users,
  Calculator,
  Code,
  FlaskConical,
  Languages,
} from 'lucide-react'

// --- Types ---

interface ScheduleItem {
  day: string
  startTime: string
  endTime: string
}

interface Course {
  id: string
  name: string
  variantName?: string
  description: string | null
  subject: string
  difficulty: string
  estimatedHours: number
  tutorHandle?: string | null
  tutorImage?: string | null
  hasOutline?: boolean
  _count: {
    modules: number
    lessons: number
    batches: number
  }
  /** Real number of live sessions (materialized time slots) for the student's schedule. */
  sessionCount?: number
  /** The schedule the student enrolled in. */
  chosenSchedule?: { scheduleId: string; name: string | null; scheduleIndex: number } | null
  availability: {
    summary: string | null
    slots: ScheduleItem[]
  }
  progress?: {
    lessonsCompleted: number
    totalLessons: number
    averageScore: number | null
    isCompleted: boolean
  }
  enrollment?: {
    startDate: string | null
  }
}

const SUBJECT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  mathematics: Calculator,
  programming: Code,
  science: FlaskConical,
  language: Languages,
  default: BookOpen,
}

// --- Upcoming session list component (real + virtual) ---

interface SessionItem {
  id: string
  title: string
  scheduledAt: string
  status: 'scheduled' | 'active' | 'ended' | 'upcoming' | 'opening_soon'
  durationMinutes?: number
  tutorName?: string
}

function getSessionStatus(scheduledAt: string, existingStatus?: string): SessionItem['status'] {
  if (existingStatus === 'active' || existingStatus === 'live' || existingStatus === 'preparing')
    return 'active'
  if (existingStatus === 'ended' || existingStatus === 'paused') return 'ended'
  if (existingStatus === 'scheduled') return 'opening_soon'
  const start = new Date(scheduledAt).getTime()
  const now = Date.now()
  const diff = start - now
  if (diff <= 0) return 'active'
  if (diff <= 60 * 60 * 1000) return 'opening_soon'
  return 'upcoming'
}

function formatCountdown(ms: number): string {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function useCountdown(targetDate: string) {
  const [msLeft, setMsLeft] = useState(() => {
    const diff = new Date(targetDate).getTime() - Date.now()
    return Math.max(0, diff)
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = new Date(targetDate).getTime() - Date.now()
      setMsLeft(Math.max(0, diff))
    }, 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  return msLeft
}

function UpcomingSessionItem({
  session,
  onEnter,
}: {
  session: SessionItem
  onEnter: (id: string) => void
}) {
  const msLeft = useCountdown(session.scheduledAt)
  const status = getSessionStatus(session.scheduledAt, session.status)
  const isSoon = status === 'opening_soon'
  const isActive = status === 'active'

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-xl border px-4 py-3 transition-all',
        isActive
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : isSoon
            ? 'border-amber-500/30 bg-amber-500/10'
            : 'border-slate-200 bg-white'
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              isActive ? 'bg-emerald-500' : isSoon ? 'bg-amber-500' : 'bg-slate-300'
            )}
          />
          <p className="truncate text-sm font-medium text-slate-800">{session.title}</p>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {new Date(session.scheduledAt).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
          {session.durationMinutes && ` · ${session.durationMinutes} min`}
          {session.tutorName && ` · ${session.tutorName}`}
        </p>
      </div>
      <div className="ml-3 shrink-0">
        {isActive ? (
          <Button
            size="sm"
            className="h-8 bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={() => onEnter(session.id)}
          >
            Join Now
          </Button>
        ) : isSoon ? (
          <span className="text-xs font-medium text-amber-600">
            Starting in {formatCountdown(msLeft)}
          </span>
        ) : (
          <span className="text-xs text-slate-400">
            {msLeft > 0 ? `in ${formatCountdown(msLeft)}` : 'Starting now'}
          </span>
        )}
      </div>
    </div>
  )
}

// --- Course Card ---

function CourseCard({
  course,
  isFavorite,
  onFavorite,
  onDetails,
  onSchedule,
  enteringClass,
  onEnterClass,
  onUnregister,
  unregisteringId,
}: {
  course: Course
  isFavorite: boolean
  onFavorite: () => void
  onDetails: () => void
  onSchedule: () => void
  enteringClass: string | null
  onEnterClass: (courseId: string) => void
  onUnregister?: (c: Course) => void
  unregisteringId?: string | null
}) {
  const progress = course.progress
  const progressPercent =
    progress && progress.totalLessons > 0
      ? Math.round((progress.lessonsCompleted / progress.totalLessons) * 100)
      : 0
  const isPending =
    course.enrollment?.startDate && new Date(course.enrollment.startDate) > new Date()
  const isOngoing = !isPending && (!progress || !progress.isCompleted)
  const category = course.subject

  return (
    <div
      className={cn(
        'group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-[20px] text-left transition-all duration-300',
        'border border-[rgba(255,255,255,0.08)]',
        'bg-[rgba(30,40,50,0.65)] backdrop-blur-[12px]',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_24px_rgba(0,0,0,0.14)]',
        'hover:-translate-y-[2px] hover:brightness-105',
        'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_10px_28px_rgba(0,0,0,0.18)]'
      )}
      style={{
        backgroundImage:
          'linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.00) 65%), linear-gradient(145deg, rgba(55, 65, 75, 0.85), rgba(25, 35, 45, 0.95))',
      }}
      onClick={onDetails}
    >
      <div className="flex flex-1 flex-col p-4">
        {/* Header: Name + Handle + Category Badge | Avatar + Heart */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-slate-100">{course.name}</h3>
            {course.tutorHandle && (
              <p className="text-xs font-medium text-slate-300">@{course.tutorHandle}</p>
            )}
            {category && category !== 'general' && (
              <span className="mt-1 inline-block rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                {category}
              </span>
            )}
          </div>
          <div className="flex items-start gap-2">
            {course.tutorImage && (
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/15 bg-white/5 shadow-md">
                <img
                  src={course.tutorImage}
                  alt={course.tutorHandle || 'Tutor'}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={e => {
                e.stopPropagation()
                onFavorite()
              }}
              className="-mr-1 -mt-1 h-7 w-7 text-rose-400 hover:bg-white/10 hover:text-rose-500"
            >
              <Heart className={cn('h-4 w-4', isFavorite && 'fill-current')} />
            </Button>
          </div>
        </div>

        {/* Description — white container, clamped */}
        <div className="mt-2 rounded-xl border border-slate-200/10 bg-white px-3 py-2 shadow-sm">
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-700">
            {course.description || 'No description available'}
          </p>
        </div>

        {/* Sessions + View schedules */}
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
          <div className="flex items-center gap-1 font-medium text-slate-200">
            <BookOpen className="h-3.5 w-3.5 text-slate-400" />
            <span>{course.sessionCount ?? 0} session{course.sessionCount === 1 ? '' : 's'}</span>
          </div>
          <div className="h-3 w-px bg-white/15" />
          <button
            type="button"
            className="inline-flex items-center gap-1 font-medium text-blue-400 hover:text-blue-300 hover:underline"
            onClick={e => {
              e.stopPropagation()
              onSchedule()
            }}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            View schedules
          </button>
        </div>

        {/* Progress + Commenced + Schedule — compact */}
        <div className="mt-3 flex-1 space-y-2">
          {progress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">Progress</span>
                <span className="font-medium text-slate-100">{progressPercent}%</span>
              </div>
              <Progress
                value={progressPercent}
                className="h-1.5 bg-[rgba(255,255,255,0.1)] [&>div]:bg-blue-500"
              />
            </div>
          )}

          {course.enrollment?.startDate && (
            <div className="text-xs text-slate-300">
              Commenced:{' '}
              <span className="font-medium text-slate-100">
                {new Date(course.enrollment.startDate).toLocaleDateString()}
              </span>
            </div>
          )}

          {course.chosenSchedule ? (
            <button
              type="button"
              onClick={onSchedule}
              className="flex w-full items-center justify-between rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10"
            >
              <span className="truncate">
                Schedule:{' '}
                <span className="font-medium text-slate-100">
                  {course.chosenSchedule.name || `Schedule ${course.chosenSchedule.scheduleIndex}`}
                </span>
              </span>
              <span className="ml-2 shrink-0 font-medium text-blue-300">Change</span>
            </button>
          ) : (
            <p className="text-xs font-medium text-slate-400">No schedule selected</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-white/10 p-3">
        {(isOngoing || isPending) && (
          <Button
            className="h-8 w-full flex-1 border-0 bg-emerald-600 text-xs text-white hover:bg-emerald-500"
            disabled={enteringClass === course.id}
            onClick={e => {
              e.stopPropagation()
              onEnterClass(course.id)
            }}
          >
            {enteringClass === course.id
              ? 'Joining...'
              : progressPercent > 0
                ? 'Continue'
                : 'Enter Classroom'}
          </Button>
        )}
        {progress?.isCompleted && (
          <Link href="/student/feedback" className="flex-1" onClick={e => e.stopPropagation()}>
            <Button className="h-8 w-full border-white/20 bg-white/10 text-xs text-slate-100 hover:bg-white/15">
              <Trophy className="mr-1.5 h-3.5 w-3.5 text-yellow-400" />
              View Results
            </Button>
          </Link>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-white/20 bg-white/10 px-3 text-xs text-slate-100 hover:bg-white/15"
          onClick={e => {
            e.stopPropagation()
            onDetails()
          }}
        >
          Details
        </Button>
        {onUnregister && course.enrollment && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-rose-500/30 bg-rose-500/10 px-3 text-xs text-rose-300 hover:bg-rose-500/20 hover:text-rose-200"
            disabled={unregisteringId === course.id}
            onClick={e => {
              e.stopPropagation()
              onUnregister(course)
            }}
          >
            {unregisteringId === course.id ? 'Unregistering...' : 'Unregister'}
          </Button>
        )}
      </div>
    </div>
  )
}

// --- Main Page ---

export default function StudentCoursesPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [selectedScheduleCourse, setSelectedScheduleCourse] = useState<Course | null>(null)
  const [enteringClass, setEnteringClass] = useState<string | null>(null)
  const [upcomingSessions, setUpcomingSessions] = useState<SessionItem[]>([])
  const [unregisteringId, setUnregisteringId] = useState<string | null>(null)

  useEffect(() => {
    loadCourses()
    loadUpcomingSessions()
  }, [])

  async function loadCourses() {
    try {
      const res = await fetch('/api/student/enrollments', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        const enrollments = data.enrollments || []

        const mappedCourses = enrollments.map((e: any) => {
          const startDate = e.startDate || e.enrolledAt
          return {
            id: e.courseId,
            name: e.course?.name || 'Unknown Course',
            variantName: formatCourseVariantName(
              e.course?.variantCategory,
              e.course?.variantNationality
            ),
            description: e.course?.description || null,
            subject: e.course?.categories?.[0] || 'general',
            tutorHandle: e.course?.tutorHandle || null,
            tutorImage: e.course?.tutorImage || null,
            difficulty: 'All Levels',
            estimatedHours: 0,
            _count: {
              modules: 0,
              lessons: e.course?._count?.lessons || 0,
              batches: 0,
            },
            sessionCount: e.sessionCount ?? e.course?.sessionCount ?? 0,
            chosenSchedule: e.chosenSchedule ?? null,
            availability: {
              summary: null,
              slots: e.course?.schedule || [],
            },
            progress: {
              lessonsCompleted: e.progress?.lessonsCompleted ?? 0,
              totalLessons: e.progress?.totalLessons ?? e.course?._count?.lessons ?? 0,
              averageScore: e.progress?.averageScore ?? null,
              isCompleted: e.progress?.isCompleted ?? false,
            },
            enrollment: {
              startDate: startDate,
            },
          }
        })

        setCourses(mappedCourses)
      } else {
        const errData = await res.json().catch(() => ({}))
        console.error('Failed to load enrollments:', res.status, errData)
        toast.error(errData?.error || 'Failed to load your courses. Please try again.')
        setCourses([])
      }
    } catch (error) {
      console.error('Error loading courses:', error)
      toast.error('Failed to load your courses. Please try again.')
      setCourses([])
    } finally {
      setLoading(false)
    }
  }

  async function loadUpcomingSessions() {
    try {
      const res = await fetch('/api/student/calendar/events?upcoming=true', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        const sessions = (data.events || [])
          .filter((e: any) => e.type === 'session')
          .map((e: any) => ({
            id: e.id,
            title: e.title,
            scheduledAt: e.scheduledAt,
            status: e.status,
            durationMinutes: e.durationMinutes,
            tutorName: e.tutorName,
          }))
          .sort(
            (a: SessionItem, b: SessionItem) =>
              new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
          )
          .slice(0, 5)
        setUpcomingSessions(sessions)
      }
    } catch (error) {
      console.error('Error loading upcoming sessions:', error)
    }
  }

  async function handleEnterClass(courseId: string) {
    setEnteringClass(courseId)
    try {
      const res = await fetch(`/api/student/courses/${courseId}/enter`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.classroomUrl) {
          router.push(data.classroomUrl)
        } else {
          toast.error('Classroom link not available.')
        }
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to enter classroom.')
      }
    } catch (error) {
      toast.error('Failed to enter classroom.')
    } finally {
      setEnteringClass(null)
    }
  }

  async function handleUnregister(course: Course) {
    setUnregisteringId(course.id)
    try {
      const res = await fetch('/api/student/enrollments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: course.id }),
      })
      if (res.ok) {
        toast.success('Successfully unregistered from course.')
        setCourses(prev => prev.filter(c => c.id !== course.id))
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to unregister.')
      }
    } catch (error) {
      toast.error('Failed to unregister.')
    } finally {
      setUnregisteringId(null)
    }
  }

  function toggleFavorite(courseId: string) {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(courseId)) {
        next.delete(courseId)
      } else {
        next.add(courseId)
      }
      return next
    })
  }

  const ongoingCourses = courses.filter(
    c => !c.progress?.isCompleted && (!c.enrollment?.startDate || new Date(c.enrollment.startDate) <= new Date())
  )
  const completedCourses = courses.filter(c => c.progress?.isCompleted)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">My Courses</h1>
          <p className="mt-1 text-slate-500">
            {courses.length > 0
              ? `You are enrolled in ${courses.length} course${courses.length === 1 ? '' : 's'}.`
              : 'You are not enrolled in any courses yet.'}
          </p>
        </div>

        {/* Upcoming Sessions */}
        {upcomingSessions.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">Upcoming Sessions</h2>
            <div className="space-y-3">
              {upcomingSessions.map(session => (
                <UpcomingSessionItem
                  key={session.id}
                  session={session}
                  onEnter={handleEnterClass}
                />
              ))}
            </div>
          </section>
        )}

        {/* Ongoing Courses */}
        {ongoingCourses.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">In Progress</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {ongoingCourses.map(course => (
                <CourseCard
                  key={course.id}
                  course={course}
                  isFavorite={favorites.has(course.id)}
                  onFavorite={() => toggleFavorite(course.id)}
                  onDetails={() => setSelectedCourse(course)}
                  onSchedule={() => setSelectedScheduleCourse(course)}
                  enteringClass={enteringClass}
                  onEnterClass={handleEnterClass}
                  onUnregister={handleUnregister}
                  unregisteringId={unregisteringId}
                />
              ))}
            </div>
          </section>
        )}

        {/* Completed Courses */}
        {completedCourses.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">Completed</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {completedCourses.map(course => (
                <CourseCard
                  key={course.id}
                  course={course}
                  isFavorite={favorites.has(course.id)}
                  onFavorite={() => toggleFavorite(course.id)}
                  onDetails={() => setSelectedCourse(course)}
                  onSchedule={() => setSelectedScheduleCourse(course)}
                  enteringClass={enteringClass}
                  onEnterClass={handleEnterClass}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {!loading && courses.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="mb-4 h-12 w-12 text-slate-300" />
            <h3 className="text-lg font-medium text-slate-700">No courses yet</h3>
            <p className="mt-1 text-slate-500">
              Browse our catalog and enroll in your first course.
            </p>
            <Button
              className="mt-4 bg-blue-600 text-white hover:bg-blue-500"
              onClick={() => router.push('/student/subjects')}
            >
              Browse Courses
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function formatCourseVariantName(variantCategory?: string | null, variantNationality?: string | null) {
  if (!variantCategory && !variantNationality) return undefined
  const parts = []
  if (variantCategory) parts.push(variantCategory)
  if (variantNationality) parts.push(variantNationality)
  return parts.join(' — ')
}
