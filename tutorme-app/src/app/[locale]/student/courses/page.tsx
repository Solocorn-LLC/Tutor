/**
 * Course Listing Page
 * Browse and enroll in available courses
 */

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
  tutorHandle?: string | null
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
  if (ms <= 0) return 'Starting now'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function SessionList({
  sessions,
  sessionsCourseName: _sessionsCourseName,
  sessionsTutorHandle: _sessionsTutorHandle,
  showAll,
  onToggleShowAll,
  onEnterSession,
  onRequestMaterials,
  requestingSessionId,
}: {
  sessions: any[]
  sessionsCourseName: string
  sessionsTutorHandle: string
  showAll: boolean
  onToggleShowAll: () => void
  onEnterSession: (sessionId: string) => void
  onRequestMaterials: (sessionId: string) => void
  requestingSessionId: string | null
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const displayed = showAll ? sessions : sessions.slice(0, 3)

  return (
    <div className="space-y-3">
      {displayed.map(session => {
        const scheduledTime = session.scheduledAt ? new Date(session.scheduledAt).getTime() : now
        const status =
          session.status === 'active' || session.status === 'ended'
            ? session.status
            : getSessionStatus(session.scheduledAt, session.status)
        const diff = scheduledTime - now
        const isPassedSession =
          status !== 'ended' && status !== 'active' && scheduledTime + 2 * 60 * 60 * 1000 < now
        const canEnterLive = status === 'active' || status === 'opening_soon'

        const badgeClass =
          status === 'active'
            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
            : status === 'ended'
              ? 'bg-slate-100 text-slate-600 border-slate-200'
              : status === 'opening_soon'
                ? 'bg-amber-100 text-amber-700 border-amber-200'
                : 'bg-sky-100 text-sky-700 border-sky-200'

        return (
          <div
            key={session.id}
            className="flex flex-col justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="truncate font-semibold text-gray-900">{session.title}</h4>
                <span
                  className={cn(
                    'rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                    badgeClass
                  )}
                >
                  {status.replace('_', ' ')}
                </span>
              </div>
              {session.scheduledAt && (
                <div className="flex items-center text-sm text-gray-500">
                  <Clock className="mr-1.5 h-4 w-4 shrink-0" />
                  <span>
                    {new Date(session.scheduledAt).toLocaleString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    {session.durationMinutes ? ` · ${session.durationMinutes} min` : ''}
                    {(status === 'upcoming' || status === 'opening_soon') && diff > 0
                      ? ` · ${formatCountdown(diff)}`
                      : ''}
                  </span>
                </div>
              )}
              {isPassedSession && (
                <p className="text-xs text-amber-600">
                  This session has passed. If it was recorded, content will load automatically.
                  Otherwise, contact your tutor for materials.
                </p>
              )}
            </div>
            <div className="flex min-w-[140px] shrink-0 flex-col gap-2">
              <Button
                onClick={() => onEnterSession(session.id)}
                variant={canEnterLive ? 'default' : 'outline'}
                className={canEnterLive ? 'bg-indigo-600 text-white hover:bg-indigo-700' : ''}
              >
                {status === 'active'
                  ? 'Join'
                  : status === 'ended'
                    ? 'Replay'
                    : canEnterLive
                      ? 'Enter Session'
                      : 'Enter'}
              </Button>
              {isPassedSession && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={requestingSessionId === session.id}
                  onClick={() => onRequestMaterials(session.id)}
                >
                  {requestingSessionId === session.id ? 'Sending...' : 'Request Materials'}
                </Button>
              )}
            </div>
          </div>
        )
      })}
      {sessions.length > 3 && (
        <Button variant="ghost" className="w-full text-sm" onClick={onToggleShowAll}>
          {showAll ? 'Show less' : `Show all ${sessions.length} sessions`}
        </Button>
      )}
    </div>
  )
}

function CoursePageInner() {
  const { showOverlay } = useNavigationOverlay()
  const searchParams = useSearchParams()
  const [courses, setCourses] = useState<Course[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<
    'mine' | 'pending' | 'completed' | 'favorites' | 'following'
  >((searchParams.get('tab') as any) || 'mine')
  const [selectedEnrollment, setSelectedEnrollment] = useState<Course | null>(null)
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [sessionsCourseId, setSessionsCourseId] = useState<string | null>(null)
  const [sessionsCourseName, setSessionsCourseName] = useState<string>('')
  const [sessionsTutorHandle, setSessionsTutorHandle] = useState<string>('')
  const [courseSessions, setCourseSessions] = useState<any[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null)
  const [requestingSessionId, setRequestingSessionId] = useState<string | null>(null)
  const [showAllSessions, setShowAllSessions] = useState(false)

  const handleRequestMaterials = async (sessionId: string) => {
    setRequestingSessionId(sessionId)
    try {
      const res = await fetch(`/api/student/sessions/${sessionId}/request-materials`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        toast.success('Material request sent to tutor.')
      } else {
        toast.error('Failed to send request.')
      }
    } catch {
      toast.error('An error occurred while sending request.')
    } finally {
      setRequestingSessionId(null)
    }
  }

  const loadFavorites = () => {
    try {
      const saved = localStorage.getItem('tutorme-favorites')
      if (saved) {
        const parsed = JSON.parse(saved)
        setFavoriteIds(parsed.courses || [])
      }
    } catch {
      // Ignore
    }
  }

  const toggleFavorite = (courseId: string) => {
    try {
      const saved = localStorage.getItem('tutorme-favorites')
      let parsed = { courses: [] as string[] }
      if (saved) {
        parsed = JSON.parse(saved)
      }
      if (parsed.courses.includes(courseId)) {
        parsed.courses = parsed.courses.filter(id => id !== courseId)
      } else {
        parsed.courses.push(courseId)
      }
      localStorage.setItem('tutorme-favorites', JSON.stringify(parsed))
      setFavoriteIds(parsed.courses)
      // Manually dispatch storage event to hit other tabs if needed, though state is updated locally!
      window.dispatchEvent(new Event('storage'))
    } catch {
      // Ignore
    }
  }

  const [followingTutors, setFollowingTutors] = useState<any[]>([])
  const [isFollowingLoading, setIsFollowingLoading] = useState(false)

  const loadFollowing = async () => {
    setIsFollowingLoading(true)
    try {
      const res = await fetch('/api/follows/list')
      if (res.ok) {
        const data = await res.json()
        setFollowingTutors(data.following || [])
      }
    } catch (error) {
      console.error('Failed to load following tutors:', error)
    } finally {
      setIsFollowingLoading(false)
    }
  }

  useEffect(() => {
    loadFavorites()
    window.addEventListener('storage', loadFavorites)
    return () => window.removeEventListener('storage', loadFavorites)
  }, [])

  // Initial data load: enrollments are shared across all course tabs, so fetch once.
  useEffect(() => {
    loadCourses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Following tab loads its own data when selected.
  useEffect(() => {
    if (activeTab === 'following') {
      loadFollowing()
    }
  }, [activeTab])

  const loadCourses = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/student/enrollments`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        const enrollments = data.enrollments || []

        // Map enrollments to match the expected Course interface
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
      console.error('Failed to load courses:', error)
      toast.error('Failed to load your courses. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const now = new Date()
  const myCourses = courses.filter(c => c.enrollment || c.progress)

  const ongoing = myCourses.filter(
    c =>
      (!c.progress || !c.progress.isCompleted) &&
      c.enrollment?.startDate &&
      new Date(c.enrollment.startDate) <= now
  )

  const upcoming = myCourses.filter(
    c =>
      !c.progress?.isCompleted &&
      (!c.enrollment?.startDate || new Date(c.enrollment.startDate) > now)
  )

  const completed = myCourses.filter(c => c.progress?.isCompleted)
  const favorites = courses.filter(c => favoriteIds.includes(c.id))

  const [detailCourse, setDetailCourse] = useState<Course | null>(null)
  const [scheduleCourse, setScheduleCourse] = useState<Course | null>(null)
  const [enteringClass, setEnteringClass] = useState<string | null>(null)
  const [unregisteringId, setUnregisteringId] = useState<string | null>(null)
  const [statsRefreshKey, setStatsRefreshKey] = useState(0)
  const router = useRouter()

  const handleUnregister = useCallback(
    async (course: Course) => {
      if (
        !window.confirm(
          `Unregister from "${course.name}"? You'll lose access to its sessions and materials. If you paid, a partial refund may apply.`
        )
      ) {
        return
      }
      setUnregisteringId(course.id)
      try {
        const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
        const csrf = (await csrfRes.json().catch(() => ({})))?.token ?? null
        const res = await fetch(`/api/student/courses/${course.id}/unenroll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(csrf && { 'X-CSRF-Token': csrf }) },
          credentials: 'include',
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(json?.message ?? 'Failed to unregister from the course')
          return
        }
        if (json?.refund) {
          toast.success('Unregistered — a partial refund has been issued')
        } else {
          toast.success('Unregistered from the course')
        }
        await loadCourses()
        setStatsRefreshKey(k => k + 1)
      } catch {
        toast.error('Failed to unregister from the course')
      } finally {
        setUnregisteringId(null)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const handleEnterClass = useCallback(
    async (courseId: string) => {
      setEnteringClass(courseId)
      setSessionsCourseId(courseId)
      const course = myCourses.find(c => c.id === courseId)
      setSessionsCourseName(course?.name || '')
      setSessionsTutorHandle(course?.tutorHandle || '')
      setSessionLoadError(null)
      setCourseSessions([])
      setIsLoadingSessions(true)
      try {
        const res = await fetch(`/api/student/courses/${courseId}/sessions`, {
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          setCourseSessions(data.sessions || [])
        } else {
          const errorData = await res.json().catch(() => ({}))
          console.error('Session load failed:', errorData, res.status)
          const msg = errorData.detail || errorData.error || res.statusText || `HTTP ${res.status}`
          setSessionLoadError(msg)
        }
      } catch (e) {
        console.error('Session load exception:', e)
        setSessionLoadError('Network error while loading sessions')
      } finally {
        setEnteringClass(null)
        setIsLoadingSessions(false)
      }
    },
    [myCourses]
  )

  return (
    <div className="text-foreground flex min-h-full flex-col bg-white px-3 lg:h-full lg:overflow-hidden lg:px-4">
      {/* Hero */}
      <div className="mb-4 flex-shrink-0">
        <StudentHeroSection
          title="My Courses"
          showGreeting={false}
          refreshSignal={statsRefreshKey}
        />
      </div>

      {/* Course Details Modal */}
      <Dialog open={!!detailCourse} onOpenChange={open => !open && setDetailCourse(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">{detailCourse?.name}</DialogTitle>
            {detailCourse?.tutorHandle && (
              <p className="text-sm font-medium text-indigo-600">@{detailCourse.tutorHandle}</p>
            )}
          </DialogHeader>
          <div className="space-y-4 p-6">
            <DialogPanel className="space-y-4 p-6">
              <p className="text-base leading-relaxed text-gray-600">
                {detailCourse?.description || 'No description provided.'}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">Subject</p>
                  <p className="font-medium capitalize text-gray-900">{detailCourse?.subject}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">Difficulty</p>
                  <p className="font-medium text-gray-900">{detailCourse?.difficulty}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">Total Lessons</p>
                  <p className="font-medium text-gray-900">{detailCourse?._count?.lessons || 0}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">Estimated Hours</p>
                  <p className="font-medium text-gray-900">{detailCourse?.estimatedHours || 0}</p>
                </div>
              </div>

              {detailCourse?.enrollment?.startDate && (
                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-sm text-blue-700">
                    <span className="font-semibold">Commencement Date:</span>{' '}
                    {new Date(detailCourse.enrollment.startDate).toLocaleDateString()}
                  </p>
                </div>
              )}
            </DialogPanel>
          </div>
          <DialogFooter align="end" className="gap-3">
            <Button
              variant="modal-secondary-dark"
              className="h-10"
              onClick={() => setDetailCourse(null)}
            >
              Close Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Modal — shared named-schedule view (side by side). Highlights
          the student's current schedule and lets them switch (cascades). */}
      <ScheduleViewModal
        courseId={scheduleCourse?.id ?? null}
        courseName={scheduleCourse?.name}
        selectedScheduleId={scheduleCourse?.chosenSchedule?.scheduleId ?? null}
        onClose={() => setScheduleCourse(null)}
        onSwitch={async (scheduleId: string) => {
          if (!scheduleCourse) return
          try {
            const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
            const csrf = (await csrfRes.json().catch(() => ({})))?.token ?? null
            const res = await fetch('/api/student/enrollments/schedule', {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(csrf && { 'X-CSRF-Token': csrf }),
              },
              credentials: 'include',
              body: JSON.stringify({ courseId: scheduleCourse.id, scheduleId }),
            })
            if (!res.ok) {
              const data = await res.json().catch(() => ({}))
              toast.error(data?.error ?? 'Failed to switch schedule')
              return
            }
            toast.success('Schedule updated')
            setScheduleCourse(null)
            await loadCourses()
          } catch {
            toast.error('Failed to switch schedule')
          }
        }}
      />

      {/* Tabs */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-0.5">
        <SessionCalendarPanel
          value={activeTab}
          onValueChange={value => {
            setActiveTab(value as typeof activeTab)
            router.push(`?tab=${value}`, { scroll: false })
          }}
          variant="orange"
          tabs={[
            { value: 'mine', label: `Ongoing (${ongoing.length})` },
            { value: 'pending', label: `Pending (${upcoming.length})` },
            { value: 'completed', label: `Completed (${completed.length})` },
            { value: 'favorites', label: `Favorites (${favorites.length})` },
            { value: 'following', label: `Following (${followingTutors.length})` },
          ]}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {isLoading ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map(i => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader className="h-48 bg-gray-200" />
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-12">
                {activeTab === 'mine' && (
                  <CourseSection
                    title="Ongoing Courses"
                    description="Courses you've started — your start date has passed and you haven't finished them yet. Join live sessions and keep learning."
                    courses={ongoing}
                    favoriteIds={favoriteIds}
                    toggleFavorite={toggleFavorite}
                    onDetails={setDetailCourse}
                    onSchedule={setScheduleCourse}
                    enteringClass={enteringClass}
                    onEnterClass={handleEnterClass}
                    onUnregister={handleUnregister}
                    unregisteringId={unregisteringId}
                  />
                )}
                {activeTab === 'pending' && (
                  <CourseSection
                    title="Pending Courses"
                    description="Courses you're enrolled in that haven't started yet — their start date is still in the future. They'll move to Ongoing once they begin."
                    courses={upcoming}
                    favoriteIds={favoriteIds}
                    toggleFavorite={toggleFavorite}
                    onDetails={setDetailCourse}
                    onSchedule={setScheduleCourse}
                    enteringClass={enteringClass}
                    onEnterClass={handleEnterClass}
                    onUnregister={handleUnregister}
                    unregisteringId={unregisteringId}
                  />
                )}
                {activeTab === 'completed' && (
                  <CourseSection
                    title="Completed Courses"
                    description="Courses you've finished — you've completed all lessons. Revisit materials and recordings anytime."
                    courses={completed}
                    favoriteIds={favoriteIds}
                    toggleFavorite={toggleFavorite}
                    onDetails={setDetailCourse}
                    onSchedule={setScheduleCourse}
                    enteringClass={enteringClass}
                    onEnterClass={handleEnterClass}
                    onUnregister={handleUnregister}
                    unregisteringId={unregisteringId}
                  />
                )}
                {activeTab === 'favorites' && (
                  <CourseSection
                    title="Favorite Courses"
                    description="Courses you've saved to revisit later. Favoriting doesn't enrol you — open one to enrol or view details."
                    courses={favorites}
                    favoriteIds={favoriteIds}
                    toggleFavorite={toggleFavorite}
                    onDetails={setDetailCourse}
                    onSchedule={setScheduleCourse}
                    enteringClass={enteringClass}
                    onEnterClass={handleEnterClass}
                  />
                )}
                {activeTab === 'following' && (
                  <section className="flex min-h-0 flex-1 flex-col">
                    <div className="mb-6 flex items-center justify-between">
                      <h2 className="text-xl font-bold text-gray-900">Following tutors</h2>
                      <Badge variant="outline">{followingTutors.length} tutors</Badge>
                    </div>
                    {isFollowingLoading ? (
                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map(i => (
                          <Card key={i} className="border-border bg-card animate-pulse">
                            <CardHeader className="space-y-3">
                              <div className="flex items-center gap-3">
                                <div className="bg-muted h-10 w-10 rounded-full" />
                                <div className="flex-1 space-y-2">
                                  <div className="bg-muted h-4 w-3/4 rounded" />
                                  <div className="bg-muted h-3 w-1/2 rounded" />
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="bg-muted h-4 rounded" />
                              <div className="bg-muted h-4 rounded" />
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : followingTutors.length === 0 ? (
                      <div className="flex flex-1 flex-col items-center justify-center text-center">
                        <Heart className="mx-auto mb-4 h-16 w-16 text-gray-300" />
                        <h3 className="text-lg font-medium text-gray-900">No followed tutors</h3>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {followingTutors.map(tutor => (
                          <div
                            key={tutor.id}
                            className={cn(
                              'group relative flex flex-col overflow-hidden rounded-[20px] text-left transition-all duration-300',
                              'border border-[rgba(255,255,255,0.12)]',
                              'bg-[rgba(30,40,50,0.65)] backdrop-blur-[12px]',
                              'shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_8px_24px_rgba(0,0,0,0.14)]',
                              'hover:-translate-y-[2px] hover:brightness-105',
                              'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_10px_28px_rgba(0,0,0,0.18)]'
                            )}
                            style={{
                              backgroundImage:
                                'linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.00) 65%), linear-gradient(145deg, rgba(70, 110, 180, 0.75), rgba(25, 55, 110, 0.95))',
                            }}
                          >
                            <div className="flex h-full flex-col p-5">
                              <div className="flex items-start gap-4">
                                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.03)] shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
                                  {resolvePublicUrl(tutor.avatarUrl) ? (
                                    <img
                                      src={resolvePublicUrl(tutor.avatarUrl)}
                                      alt={tutor.name}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-[rgba(255,255,255,0.05)] text-lg font-bold text-slate-100">
                                      {tutor.name?.charAt(0)}
                                    </div>
                                  )}
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col pt-1">
                                  <h3 className="truncate text-lg font-semibold text-slate-50">
                                    {tutor.name}
                                  </h3>
                                  <p className="mt-1 text-xs font-medium text-slate-300">
                                    @{tutor.username}
                                  </p>
                                </div>
                              </div>

                              {tutor.bio && (
                                <p className="mt-4 line-clamp-2 text-xs text-slate-300">
                                  {tutor.bio}
                                </p>
                              )}

                              <div className="mb-4 mt-4 flex flex-wrap gap-1.5">
                                {tutor.specialties?.slice(0, 3).map((specialty: string) => (
                                  <span
                                    key={specialty}
                                    className="rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.08)] px-2.5 py-0.5 text-[11px] text-slate-200"
                                  >
                                    {specialty}
                                  </span>
                                ))}
                              </div>

                              <div className="mt-auto border-t border-[rgba(255,255,255,0.1)] pt-4">
                                <Link
                                  href={`/u/${tutor.username}`}
                                  onClick={() => showOverlay()}
                                  className="flex w-full items-center justify-center rounded-full border border-[rgba(255,255,255,0.25)] bg-[rgba(255,255,255,0.08)] py-2 text-sm font-medium text-slate-100 backdrop-blur-[6px] transition-colors hover:bg-[rgba(255,255,255,0.15)] hover:text-white"
                                >
                                  View Profile
                                </Link>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {((activeTab === 'mine' && ongoing.length === 0) ||
                  (activeTab === 'pending' && upcoming.length === 0) ||
                  (activeTab === 'completed' && completed.length === 0) ||
                  (activeTab === 'favorites' && favorites.length === 0)) && (
                  <div className="flex flex-1 flex-col items-center justify-center text-center">
                    <BookOpen className="mx-auto mb-4 h-16 w-16 text-gray-300" />
                    <h3 className="text-lg font-medium text-gray-900">
                      No courses in this section
                    </h3>
                  </div>
                )}
              </div>
            )}
          </div>
        </SessionCalendarPanel>
      </div>

      {selectedEnrollment && (
        <PreferenceEnrollmentDialog
          open={!!selectedEnrollment}
          onOpenChange={open => {
            if (!open) setSelectedEnrollment(null)
          }}
          courseId={selectedEnrollment.id}
          courseName={selectedEnrollment.name}
          availabilitySlots={selectedEnrollment.availability?.slots ?? []}
          onSubmitted={() => {
            setSelectedEnrollment(null)
            loadCourses()
          }}
        />
      )}

      {/* Course Sessions Modal */}
      <Dialog open={!!sessionsCourseId} onOpenChange={open => !open && setSessionsCourseId(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-600" />
              Course Sessions
            </DialogTitle>
            <DialogDescription>Select a session to enter.</DialogDescription>
          </DialogHeader>
          <div className="pt-4">
            <div className="rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white p-6 text-[#1F2933] shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
              {isLoadingSessions ? (
                <DialogPanel className="p-6">
                  <div className="flex justify-center p-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
                  </div>
                </DialogPanel>
              ) : sessionLoadError ? (
                <DialogPanel className="p-6">
                  <div className="py-8 text-center">
                    <p className="text-sm font-medium text-red-700">Failed to load sessions</p>
                    <p className="mt-1 text-xs text-red-600">{sessionLoadError}</p>
                    <Button
                      variant="modal-secondary-dark"
                      size="sm"
                      className="mt-3 h-10"
                      onClick={() => {
                        if (sessionsCourseId) handleEnterClass(sessionsCourseId)
                      }}
                    >
                      Retry
                    </Button>
                  </div>
                </DialogPanel>
              ) : courseSessions.length === 0 ? (
                <DialogPanel className="p-6">
                  <div className="py-6 text-center">
                    <p className="text-sm font-medium text-gray-700">
                      No live sessions have been created yet.
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Your tutor will start a session based on the course schedule.
                    </p>
                    {(() => {
                      const course = myCourses.find(c => c.id === sessionsCourseId)
                      const slots = course?.availability?.slots || []
                      if (slots.length > 0) {
                        return (
                          <div className="mt-3 space-y-1.5">
                            <p className="text-xs font-medium text-gray-600">Upcoming schedule:</p>
                            {slots.map((slot: any, idx: number) => (
                              <div
                                key={idx}
                                className="mx-auto flex max-w-xs items-center justify-between rounded-md border bg-white px-3 py-1.5 text-xs"
                              >
                                <span className="font-medium text-gray-700">{slot.day}</span>
                                <span className="text-gray-500">
                                  {slot.time} ({slot.durationMinutes || 60} mins)
                                </span>
                              </div>
                            ))}
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>
                </DialogPanel>
              ) : (
                <SessionList
                  sessions={courseSessions}
                  sessionsCourseName={sessionsCourseName}
                  sessionsTutorHandle={sessionsTutorHandle}
                  showAll={showAllSessions}
                  onToggleShowAll={() => setShowAllSessions(!showAllSessions)}
                  onEnterSession={(sessionId: string) => {
                    setSessionsCourseId(null)
                    const nameParam = sessionsCourseName
                      ? `&courseName=${encodeURIComponent(sessionsCourseName)}`
                      : ''
                    const tutorParam = sessionsTutorHandle
                      ? `&tutorHandle=${encodeURIComponent(sessionsTutorHandle)}`
                      : ''
                    router.push(`/student/feedback?sessionId=${sessionId}${nameParam}${tutorParam}`)
                  }}
                  onRequestMaterials={handleRequestMaterials}
                  requestingSessionId={requestingSessionId}
                />
              )}
            </div>
          </div>
          <DialogFooter align="end" className="gap-3">
            <Button
              variant="modal-secondary-dark"
              className="h-10"
              onClick={() => setSessionsCourseId(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function CoursePage() {
  return (
    <Suspense fallback={null}>
      <CoursePageInner />
    </Suspense>
  )
}

function CourseSection({
  title,
  description,
  courses,
  favoriteIds,
  toggleFavorite,
  onDetails,
  onSchedule,
  enteringClass,
  onEnterClass,
  onUnregister,
  unregisteringId,
}: {
  title: string
  description?: string
  courses: Course[]
  favoriteIds: string[]
  toggleFavorite: (id: string) => void
  onDetails: (c: Course) => void
  onSchedule: (c: Course) => void
  enteringClass: string | null
  onEnterClass: (courseId: string) => void
  onUnregister?: (c: Course) => void
  unregisteringId?: string | null
}) {
  return (
    <section>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
        </div>
        <Badge variant="outline" className="shrink-0">
          {courses.length} courses
        </Badge>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {courses.map(course => (
          <CourseCard
            key={course.id}
            course={course}
            isFavorite={favoriteIds.includes(course.id)}
            onFavorite={() => toggleFavorite(course.id)}
            onDetails={() => onDetails(course)}
            onSchedule={() => onSchedule(course)}
            enteringClass={enteringClass}
            onEnterClass={onEnterClass}
            onUnregister={onUnregister}
            unregisteringId={unregisteringId}
          />
        ))}
      </div>
    </section>
  )
}

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
  const SubjectIcon = SUBJECT_ICONS[course.subject] || SUBJECT_ICONS.default
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
        'hover:-translate-y-[2px] hover:brightness-105',
        'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_10px_28px_rgba(0,0,0,0.18)]'
      )}
      style={{
        backgroundImage:
          'linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.00) 65%), linear-gradient(145deg, rgba(55, 65, 75, 0.85), rgba(25, 35, 45, 0.95))',
      }}
      onClick={onDetails}
    >
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between">
          <div className="rounded-lg bg-[rgba(255,255,255,0.1)] p-3">
            <SubjectIcon className="h-6 w-6 text-slate-100" />
          </div>
          <div className="flex items-start gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md bg-[rgba(255,255,255,0.08)] text-slate-300"
              title="Group course"
            >
              <Users className="h-4 w-4" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={e => {
                e.stopPropagation()
                onFavorite()
              }}
              className="-mr-2 -mt-2 h-8 w-8 text-rose-400 hover:bg-[rgba(255,255,255,0.1)] hover:text-rose-500"
            >
              <Heart className={cn('h-4 w-4', isFavorite && 'fill-current')} />
            </Button>
          </div>
        </div>
        <h3 className="mt-4 text-xl font-semibold text-slate-100">{course.name}</h3>
        {course.variantName && (
          <p className="mt-0.5 text-sm font-medium text-blue-300">{course.variantName}</p>
        )}
        {course.tutorHandle && (
          <p className="mt-1 text-sm font-medium text-slate-300">@{course.tutorHandle}</p>
        )}
        <p className="mt-2 line-clamp-2 text-sm text-slate-400">
          {course.description || 'No description available'}
        </p>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-300">
          <Clock className="h-3.5 w-3.5" />
          <button
            type="button"
            className="font-medium text-blue-400 hover:underline"
            onClick={e => {
              e.stopPropagation()
              onSchedule()
            }}
          >
            Schedule
          </button>
          {course.availability?.summary && (
            <span className="truncate text-slate-400">({course.availability.summary})</span>
          )}
        </div>

        <div className="mt-6 flex-1 space-y-4">
          <div className="flex flex-wrap gap-4 text-sm text-slate-300">
            <div className="flex items-center gap-1">
              <Target className="h-4 w-4" />
              <span>
                {course.sessionCount ?? 0} session{course.sessionCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">Progress</span>
                <span className="font-medium text-slate-100">{progressPercent}%</span>
              </div>
              <Progress
                value={progressPercent}
                className="h-2 bg-[rgba(255,255,255,0.1)] [&>div]:bg-blue-500"
              />
            </div>
          )}

          {course.enrollment?.startDate && (
            <div className="rounded-md border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] p-2 text-xs text-slate-300">
              Commence{isPending ? 's' : 'd'} on:{' '}
              <span className="font-medium text-slate-100">
                {new Date(course.enrollment.startDate).toLocaleDateString()}
              </span>
            </div>
          )}

          {course.chosenSchedule ? (
            <button
              type="button"
              onClick={onSchedule}
              className="flex w-full items-center justify-between rounded-md border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] p-2 text-xs text-slate-300 transition-colors hover:bg-[rgba(255,255,255,0.1)]"
            >
              <span>
                Schedule:{' '}
                <span className="font-medium text-slate-100">
                  {course.chosenSchedule.name || `Schedule ${course.chosenSchedule.scheduleIndex}`}
                </span>
              </span>
              <span className="font-medium text-blue-300">Change</span>
            </button>
          ) : (
            <p className="text-xs font-medium text-slate-400">No schedule selected</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-t border-[rgba(255,255,255,0.1)] p-4">
        {(isOngoing || isPending) && (
          <Button
            className="h-9 w-full flex-1 border-0 bg-emerald-600 text-white hover:bg-emerald-500"
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
          <Link href={`/student/feedback`} className="flex-1" onClick={e => e.stopPropagation()}>
            <Button className="h-9 w-full border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.08)] text-slate-100 hover:bg-[rgba(255,255,255,0.15)]">
              <Trophy className="mr-2 h-4 w-4 text-yellow-400" />
              View Results
            </Button>
          </Link>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-9 border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.08)] px-3 text-slate-100 hover:bg-[rgba(255,255,255,0.15)]"
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
            className="h-9 border-rose-500/30 bg-rose-500/10 px-3 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200"
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
