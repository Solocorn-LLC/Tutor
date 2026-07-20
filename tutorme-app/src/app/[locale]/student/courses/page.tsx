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
import { Tabs, TabsContent } from '@/components/ui/tabs'
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
import { CountryFlag } from '@/components/country-flag'

function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase()
  return '#' + '00000'.substring(0, 6 - c.length) + c
}

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
  variantNationality?: string | null
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
  lessonTitle?: string | null
  lessonNumber?: number | null
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
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="truncate font-semibold text-gray-900">{session.title}</h4>
                <span
                  className={cn(
                    'rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                    badgeClass
                  )}
                >
                  {status.replace('_', ' ')}
                </span>
                {session.lessonTitle && (
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                    {session.lessonNumber
                      ? `Lesson ${session.lessonNumber}: ${session.lessonTitle}`
                      : session.lessonTitle}
                  </span>
                )}
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
  const [activeTab, setActiveTab] = useState<'mine' | 'pending' | 'completed' | 'favorites'>(
    (searchParams.get('tab') as any) || 'mine'
  )
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

  // Initial data load: enrollments are shared across all course tabs, so fetch once.
  useEffect(() => {
    loadCourses()
    loadFavorites()
    window.addEventListener('storage', loadFavorites)
    return () => window.removeEventListener('storage', loadFavorites)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            tutorName: e.course?.tutorName || null,
            // The tutor's uploaded profile photo lives in profile.avatarUrl
            // (returned as tutorAvatar); user.image (tutorImage) is usually null
            // for credential tutors. Carry both so the card can show the photo.
            tutorAvatar: e.course?.tutorAvatar || null,
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
                  <p className="text-sm text-gray-600">Category</p>
                  <p className="font-medium capitalize text-gray-900">{detailCourse?.subject}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">Tutor Name</p>
                  <p className="font-medium text-gray-900">
                    {detailCourse?.tutorName || detailCourse?.tutorHandle || 'Unknown'}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">Total Lessons</p>
                  <p className="font-medium text-gray-900">{detailCourse?._count?.lessons || 0}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">No. of Sessions</p>
                  <p className="font-medium text-gray-900">{detailCourse?.sessionCount || 0}</p>
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl pb-0.5 shadow-[0_14px_45px_rgba(0,0,0,0.14)]">
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
          ]}
        >
          <div className="scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-4">
            {isLoading ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map(i => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader className="h-48 bg-gray-200" />
                  </Card>
                ))}
              </div>
            ) : (
              <>
                <TabsContent value="mine" className="h-full overflow-hidden">
                  {ongoing.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <BookOpen className="mx-auto mb-4 h-16 w-16 text-gray-300" />
                      <h3 className="text-lg font-medium text-gray-900">
                        No courses in this section
                      </h3>
                    </div>
                  ) : (
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
                </TabsContent>

                <TabsContent value="pending" className="h-full overflow-hidden">
                  {upcoming.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <BookOpen className="mx-auto mb-4 h-16 w-16 text-gray-300" />
                      <h3 className="text-lg font-medium text-gray-900">
                        No courses in this section
                      </h3>
                    </div>
                  ) : (
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
                </TabsContent>

                <TabsContent value="completed" className="h-full overflow-hidden">
                  {completed.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <BookOpen className="mx-auto mb-4 h-16 w-16 text-gray-300" />
                      <h3 className="text-lg font-medium text-gray-900">
                        No courses in this section
                      </h3>
                    </div>
                  ) : (
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
                </TabsContent>

                <TabsContent value="favorites" className="h-full overflow-hidden">
                  {favorites.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <BookOpen className="mx-auto mb-4 h-16 w-16 text-gray-300" />
                      <h3 className="text-lg font-medium text-gray-900">
                        No courses in this section
                      </h3>
                    </div>
                  ) : (
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
                </TabsContent>
              </>
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
    <section className="mx-auto max-w-7xl">
      <div className="mb-6">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
        </div>
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
  const progress = course.progress
  const category = course.subject
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
        {/* Header: Name + Handle + Category Badge | Session count | Avatar | Heart */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-base font-semibold text-slate-100">{course.name}</h3>
              <button
                onClick={e => {
                  e.stopPropagation()
                  onFavorite()
                }}
                className="shrink-0 text-rose-400 transition-colors hover:text-rose-500"
              >
                <Heart className={cn('h-4 w-4', isFavorite && 'fill-current')} />
              </button>
            </div>
            {course.tutorHandle && (
              <p className="text-xs font-medium text-slate-300">@{course.tutorHandle}</p>
            )}
            {course.subject && course.subject !== 'general' && (
              <span className="mt-1 inline-block rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                {course.subject}
              </span>
            )}
          </div>

          {/* Center: Session count + Avatar */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-medium text-slate-200">
                {course.sessionCount ?? 0} session{course.sessionCount === 1 ? '' : 's'}
              </span>
            </div>
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
        <div className="flex flex-1 items-center gap-2">
          {(isOngoing || isPending) && (
            <Button
              className="h-8 flex-1 border border-white/60 bg-transparent text-xs text-white transition-colors hover:bg-white hover:text-emerald-600"
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
              <Button className="h-8 w-full border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.08)] text-xs text-slate-100 transition-colors hover:bg-[rgba(255,255,255,0.15)]">
                <Trophy className="mr-2 h-4 w-4 text-yellow-400" />
                View Results
              </Button>
            </Link>
          )}
          {onUnregister && course.enrollment && (
            <Button
              variant="outline"
              className="h-8 flex-1 border border-white/60 bg-transparent text-xs text-white transition-colors hover:bg-white hover:text-red-600"
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
        {course.variantNationality && course.variantNationality !== 'Global' && (
          <div className="flex items-center">
            <CountryFlag countryName={course.variantNationality} size="xs" />
          </div>
        )}
      </div>
    </div>
  )
}
