'use client'

import { Suspense } from 'react'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  PreferenceEnrollmentDialog,
  type ScheduleItem,
} from '@/components/course/PreferenceEnrollmentDialog'
import { ScheduleViewModal } from '@/components/course/ScheduleViewModal'
import { formatCourseVariantName } from '@/lib/courses/variant-name'
import {
  Clock,
  Calendar,
  ChevronRight,
  Play,
  Trophy,
  Target,
  Code,
  Calculator,
  FlaskConical,
  Languages,
  Heart,
  BookOpen,
  User,
  Users,
} from 'lucide-react'
import { StudentHeroSection } from '@/app/[locale]/student/dashboard/components/StudentHeroSection'
import { SessionCalendarPanel } from '@/components/session-calendar-panel'
import { useNavigationOverlay } from '@/components/navigation/NavigationOverlay'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogPanel,
} from '@/components/ui/dialog'
import { cn, resolvePublicUrl } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Course {
  id: string
  name: string
  variantName?: string
  description: string | null
  subject: string
  difficulty: string
  estimatedHours: number
  tutorName?: string | null
  tutorHandle?: string | null
  tutorImage?: string | null
  tutorAvatar?: string | null
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
}

function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase()
  return '#' + '00000'.substring(0, 6 - c.length) + c
}

// --- Page ---

export default function StudentCoursesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { showOverlay } = useNavigationOverlay()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [enrollingCourse, setEnrollingCourse] = useState<Course | null>(null)
  const [scheduleViewCourse, setScheduleViewCourse] = useState<Course | null>(null)
  const [enteringClass, setEnteringClass] = useState<string | null>(null)
  const [unregisteringId, setUnregisteringId] = useState<string | null>(null)
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('enrolled')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [difficultyFilter, setDifficultyFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('newest')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/student/courses', { credentials: 'include' })
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setCourses(data?.courses ?? [])
    } catch {
      setCourses([])
      toast.error('Failed to load courses')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadFavorites = useCallback(async () => {
    try {
      const res = await fetch('/api/student/favorites', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setFavorites(new Set((data?.favorites ?? []).map((f: any) => f.courseId)))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    load()
    loadFavorites()
  }, [load, loadFavorites])

  const toggleFavorite = async (courseId: string) => {
    const isFav = favorites.has(courseId)
    try {
      const res = await fetch(`/api/student/favorites/${courseId}`, {
        method: isFav ? 'DELETE' : 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('failed')
      setFavorites(prev => {
        const next = new Set(prev)
        if (isFav) next.delete(courseId)
        else next.add(courseId)
        return next
      })
      toast.success(isFav ? 'Removed from favorites' : 'Added to favorites')
    } catch {
      toast.error('Failed to update favorite')
    }
  }

  const handleEnterClass = async (courseId: string) => {
    setEnteringClass(courseId)
    try {
      const res = await fetch(`/api/student/courses/${courseId}/enter`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      if (data?.url) {
        showOverlay()
        router.push(data.url)
      } else {
        toast.error('Failed to enter classroom')
      }
    } catch {
      toast.error('Failed to enter classroom')
    } finally {
      setEnteringClass(null)
    }
  }

  const handleUnregister = async (course: Course) => {
    if (!confirm(`Are you sure you want to unenroll from "${course.name}"?`)) return
    setUnregisteringId(course.id)
    try {
      const res = await fetch(`/api/student/courses/${course.id}/unenroll`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('failed')
      toast.success('Unenrolled successfully')
      setCourses(prev => prev.filter(c => c.id !== course.id))
    } catch {
      toast.error('Failed to unenroll')
    } finally {
      setUnregisteringId(null)
    }
  }

  const filteredCourses = courses.filter(course => {
    if (activeTab === 'favorites' && !favorites.has(course.id)) return false
    if (categoryFilter !== 'all' && course.subject !== categoryFilter) return false
    if (difficultyFilter !== 'all' && course.difficulty !== difficultyFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        course.name.toLowerCase().includes(q) ||
        (course.tutorHandle?.toLowerCase() ?? '').includes(q) ||
        course.subject.toLowerCase().includes(q)
      )
    }
    return true
  })

  const sortedCourses = [...filteredCourses].sort((a, b) => {
    if (sortBy === 'newest')
      return (b.enrollment?.startDate ?? '').localeCompare(a.enrollment?.startDate ?? '')
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    if (sortBy === 'progress')
      return (b.progress?.lessonsCompleted ?? 0) - (a.progress?.lessonsCompleted ?? 0)
    return 0
  })

  const enrolledCount = courses.length
  const favoriteCount = courses.filter(c => favorites.has(c.id)).length
  const completedCount = courses.filter(c => c.progress?.isCompleted).length
  const inProgressCount = courses.filter(
    c => !c.progress?.isCompleted && c.progress && c.progress.lessonsCompleted > 0
  ).length

  const categories = Array.from(new Set(courses.map(c => c.subject)))
  const difficulties = Array.from(new Set(courses.map(c => c.difficulty)))

  return (
    <div className="min-h-screen bg-white">
      <StudentHeroSection title="My Courses" />

      <div className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Enrolled" value={enrolledCount} icon={BookOpen} />
          <StatCard label="In Progress" value={inProgressCount} icon={Play} />
          <StatCard label="Completed" value={completedCount} icon={Trophy} />
          <StatCard label="Favorites" value={favoriteCount} icon={Heart} />
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <SessionCalendarPanel
            value={activeTab}
            onValueChange={setActiveTab}
            variant="blue"
            tabs={[
              { value: 'enrolled', label: 'Enrolled', icon: BookOpen },
              { value: 'favorites', label: 'Favorites', icon: Heart },
              { value: 'completed', label: 'Completed', icon: Trophy },
            ]}
          />

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="all">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>

            <select
              value={difficultyFilter}
              onChange={e => setDifficultyFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="all">All Difficulties</option>
              {difficulties.map(d => (
                <option key={d} value={d}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="newest">Newest First</option>
              <option value="name">Name</option>
              <option value="progress">Progress</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search courses..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Course Grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-[20px] bg-slate-100" />
            ))}
          </div>
        ) : sortedCourses.length === 0 ? (
          <div className="py-16 text-center">
            <BookOpen className="mx-auto mb-4 h-12 w-12 text-slate-300" />
            <h3 className="text-lg font-medium text-slate-700">No courses found</h3>
            <p className="mt-1 text-sm text-slate-500">
              {activeTab === 'favorites'
                ? 'You have no favorite courses yet.'
                : activeTab === 'completed'
                  ? 'You have not completed any courses yet.'
                  : 'You are not enrolled in any courses yet.'}
            </p>
            <Button className="mt-4" onClick={() => router.push('/student/subjects')}>
              Browse Courses
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sortedCourses.map(course => (
              <CourseCard
                key={course.id}
                course={course}
                isFavorite={favorites.has(course.id)}
                onFavorite={() => toggleFavorite(course.id)}
                onEnterClass={() => handleEnterClass(course.id)}
                onDetails={() => setExpandedCourseId(course.id)}
                onSchedule={() => setScheduleViewCourse(course)}
                onUnregister={() => handleUnregister(course)}
                enteringClass={enteringClass}
                unregisteringId={unregisteringId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Course Detail Dialog */}
      <Dialog open={!!expandedCourseId} onOpenChange={() => setExpandedCourseId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{courses.find(c => c.id === expandedCourseId)?.name}</DialogTitle>
            <DialogDescription>Course details and information</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {(() => {
              const course = courses.find(c => c.id === expandedCourseId)
              if (!course) return null
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100">
                      {(() => {
                        const Icon = SUBJECT_ICONS[course.subject] || SUBJECT_ICONS.default
                        return <Icon className="h-8 w-8 text-slate-500" />
                      })()}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{course.name}</h3>
                      <p className="text-sm text-slate-500">
                        {course.tutorHandle && `@${course.tutorHandle}`}
                        {course.subject && ` · ${course.subject}`}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-700">
                      {course.description || 'No description available'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="text-xs text-slate-500">Difficulty</p>
                      <p className="text-sm font-medium text-slate-900">{course.difficulty}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="text-xs text-slate-500">Estimated Hours</p>
                      <p className="text-sm font-medium text-slate-900">{course.estimatedHours}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="text-xs text-slate-500">Modules</p>
                      <p className="text-sm font-medium text-slate-900">{course._count.modules}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="text-xs text-slate-500">Lessons</p>
                      <p className="text-sm font-medium text-slate-900">{course._count.lessons}</p>
                    </div>
                  </div>

                  {course.progress && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Progress</span>
                        <span className="font-medium text-slate-900">
                          {Math.round(
                            (course.progress.lessonsCompleted / course.progress.totalLessons) * 100
                          )}
                          %
                        </span>
                      </div>
                      <Progress
                        value={Math.round(
                          (course.progress.lessonsCompleted / course.progress.totalLessons) * 100
                        )}
                        className="h-2"
                      />
                    </div>
                  )}
                </div>
              )
            })()}
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpandedCourseId(null)}>
              Close
            </Button>
            {(() => {
              const course = courses.find(c => c.id === expandedCourseId)
              if (!course) return null
              const progress = course.progress
              const isPending =
                course.enrollment?.startDate && new Date(course.enrollment.startDate) > new Date()
              const isOngoing = !isPending && (!progress || !progress.isCompleted)
              if (isOngoing || isPending) {
                return (
                  <Button
                    onClick={() => {
                      setExpandedCourseId(null)
                      handleEnterClass(course.id)
                    }}
                    disabled={enteringClass === course.id}
                  >
                    {enteringClass === course.id ? 'Joining...' : 'Enter Classroom'}
                  </Button>
                )
              }
              return null
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule View Modal */}
      {scheduleViewCourse && (
        <ScheduleViewModal
          courseId={scheduleViewCourse.id}
          courseName={scheduleViewCourse.name}
          selectedScheduleId={scheduleViewCourse.chosenSchedule?.scheduleId ?? null}
          onClose={() => setScheduleViewCourse(null)}
        />
      )}

      {/* Enrollment Dialog */}
      {enrollingCourse && (
        <PreferenceEnrollmentDialog
          open={true}
          onOpenChange={() => setEnrollingCourse(null)}
          courseId={enrollingCourse.id}
          courseName={enrollingCourse.name}
          availabilitySlots={enrollingCourse.availability.slots}
          onSubmitted={() => {
            setEnrollingCourse(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
          <Icon className="h-5 w-5 text-slate-500" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  )
}

function CourseCard({
  course,
  isFavorite,
  onFavorite,
  onEnterClass,
  onDetails,
  onSchedule,
  onUnregister,
  enteringClass,
  unregisteringId,
}: {
  course: Course
  isFavorite: boolean
  onFavorite: () => void
  onEnterClass: () => void
  onDetails: () => void
  onSchedule: () => void
  onUnregister: () => void
  enteringClass: string | null
  unregisteringId: string | null
}) {
  const progress = course.progress
  const progressPercent =
    progress && progress.totalLessons > 0
      ? Math.round((progress.lessonsCompleted / progress.totalLessons) * 100)
      : 0
  const isPending =
    course.enrollment?.startDate && new Date(course.enrollment.startDate) > new Date()
  const isOngoing = !isPending && (!progress || !progress.isCompleted)

  return (
    <div
      className={cn(
        'group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-[20px] text-left transition-all duration-300',
        'border border-[rgba(255,255,255,0.08)]',
        'bg-[rgba(30,40,50,0.65)] backdrop-blur-[12px]',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_24px_rgba(0,0,0,0.14)]',
        'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_10px_28px_rgba(0,0,0,0.18)]'
      )}
      style={{
        backgroundImage:
          'linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.00) 65%), linear-gradient(145deg, rgba(55, 65, 75, 0.85), rgba(25, 35, 45, 0.95))',
      }}
      onClick={onDetails}
    >
      <div className="flex flex-1 flex-col p-4">
        {/* Header: Name + Heart | Handle + Category Badge | Avatar */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="-mt-0.5 truncate text-base font-semibold leading-tight text-slate-100">
                {course.name}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={e => {
                  e.stopPropagation()
                  onFavorite()
                }}
                className="-mr-1 -mt-1 h-7 w-7 shrink-0 text-rose-400 hover:bg-white/10 hover:text-rose-500"
              >
                <Heart className={cn('h-4 w-4', isFavorite && 'fill-current')} />
              </Button>
            </div>
            {course.tutorHandle && (
              <p className="-mt-0.5 text-xs font-medium text-slate-300">@{course.tutorHandle}</p>
            )}
            {course.subject && course.subject !== 'general' && (
              <span className="mt-1.5 inline-block rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                {course.subject}
              </span>
            )}
          </div>

          {/* Right: Avatar */}
          <div className="flex items-center gap-2">
            {/* Avatar */}
            {(() => {
              const tutorImageUrl = course.tutorAvatar
                ? resolvePublicUrl(course.tutorAvatar)
                : course.tutorImage
                  ? resolvePublicUrl(course.tutorImage)
                  : null
              const initials = course.tutorHandle
                ? course.tutorHandle.slice(1, 3).toUpperCase()
                : course.tutorName
                  ? course.tutorName.slice(0, 2).toUpperCase()
                  : 'T'
              const bgColor = stringToColor(course.tutorHandle || course.tutorName || 'tutor')
              return (
                <div className="relative h-16 w-16">
                  {tutorImageUrl && (
                    <img
                      src={tutorImageUrl}
                      alt={course.tutorHandle || 'Tutor'}
                      className="absolute inset-0 h-full w-full rounded-xl border border-[rgba(255,255,255,0.15)] object-cover"
                      onError={e => {
                        const img = e.target as HTMLImageElement
                        img.style.display = 'none'
                      }}
                    />
                  )}
                  <div
                    className={cn(
                      'flex h-full w-full items-center justify-center rounded-xl border border-[rgba(255,255,255,0.15)]',
                      tutorImageUrl ? 'hidden' : 'flex'
                    )}
                    style={{ backgroundColor: bgColor }}
                  >
                    <span className="text-sm font-bold text-white">{initials}</span>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* Description — white container, clamped to 1 row */}
        <div className="mt-3 rounded-xl border border-slate-200/10 bg-white px-3 py-2 shadow-sm">
          <p className="line-clamp-1 text-xs leading-relaxed text-slate-700">
            {course.description || 'No description available'}
          </p>
        </div>

        {/* Progress */}
        {progress && (
          <div className="mt-3 space-y-1.5">
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

        {/* Combined: Commenced date + Schedule selector */}
        <div className="mt-3 flex gap-2">
          {course.enrollment?.startDate && (
            <div className="flex flex-1 items-center rounded-md border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] p-2 text-xs text-slate-300">
              <span className="truncate">
                Commenced:{' '}
                <span className="font-medium text-slate-100">
                  {new Date(course.enrollment.startDate).toLocaleDateString()}
                </span>
              </span>
            </div>
          )}

          {course.chosenSchedule ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                onSchedule()
              }}
              className="flex flex-1 items-center justify-between rounded-md border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] p-2 text-xs text-slate-300 transition-colors hover:bg-[rgba(255,255,255,0.1)]"
            >
              <span className="truncate font-medium text-slate-100">
                {course.chosenSchedule.name || `Schedule ${course.chosenSchedule.scheduleIndex}`}
              </span>
              <span className="ml-1 shrink-0 font-medium text-blue-300">Change</span>
            </button>
          ) : (
            <p className="flex-1 text-xs font-medium text-slate-400">No schedule selected</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-t border-[rgba(255,255,255,0.1)] p-4">
        {(isOngoing || isPending) && (
          <Button
            className="h-8 flex-1 border-0 bg-emerald-600 text-xs text-white transition-colors hover:bg-white hover:text-emerald-600"
            disabled={enteringClass === course.id}
            onClick={e => {
              e.stopPropagation()
              onEnterClass()
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
          <Link href={`/student/feedback`} className="flex-1" onClick={e => e.stopPropagation()}>
            <Button className="h-8 w-full border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.08)] text-xs text-slate-100 transition-colors hover:bg-[rgba(255,255,255,0.15)]">
              <Trophy className="mr-2 h-4 w-4 text-yellow-400" />
              View Results
            </Button>
          </Link>
        )}
        {/* Session count moved to bottom row */}
        <div className="flex flex-1 items-center justify-center rounded-md border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] px-2 text-xs text-slate-300">
          <Calendar className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
          <span className="font-medium text-slate-200">
            {course.sessionCount ?? 0} session{course.sessionCount === 1 ? '' : 's'}
          </span>
        </div>
        {onUnregister && course.enrollment && (
          <Button
            variant="destructive"
            className="h-8 flex-1 text-xs transition-colors hover:bg-white hover:text-red-600"
            disabled={unregisteringId === course.id}
            onClick={e => {
              e.stopPropagation()
              onUnregister()
            }}
          >
            {unregisteringId === course.id ? 'Unregistering...' : 'Unregister'}
          </Button>
        )}
      </div>
    </div>
  )
}
