'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { OneOnOneRescheduleDialog } from '@/components/booking/one-on-one-reschedule-dialog'
import {
  OneOnOneRequestCard,
  groupIntoSeries,
} from '@/components/one-on-one/one-on-one-request-card'
import { resolveOneOnOneSession, joinableRequestId } from '@/lib/one-on-one/enter-classroom'
import { CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'

import {
  Plus,
  Settings,
  BookOpen,
  Library,
  ChevronRight,
  Sparkles,
  Video,
  Info,
  X,
  Trash2,
  Calendar,
  Clock,
  Users,
  AlertCircle,
  Ban,
  CalendarClock,
  Pencil,
  Presentation,
  ArrowLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ScheduleViewModal } from '@/components/course/ScheduleViewModal'

import {
  CreateClassDialog,
  CreateSessionForm,
  type CreateSessionFormRef,
  StatsCards,
  UpcomingClassesCard,
  InteractiveCalendar,
  type UpcomingClass,
} from './components'
import { DEFAULT_TIMEZONE, type CalendarView } from './components/InteractiveCalendar'
import { SessionCalendarPanel } from '@/components/session-calendar-panel'
import { ModernHeroSection } from './components/ModernHeroSection'
import { TutorPendingRescheduleBanner } from './components/TutorPendingRescheduleBanner'
import { CountryFlag } from '@/components/country-flag'
import { ClassroomDialog } from '@/components/classroom/ClassroomDialog'

function SessionCountdown({ scheduledAt }: { scheduledAt: string }) {
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    const target = new Date(scheduledAt).getTime()
    const tick = () => {
      const diff = target - Date.now()
      if (diff <= 0) {
        setCountdown('Starting now')
        return
      }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setCountdown(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      )
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [scheduledAt])

  if (!countdown) return null

  return (
    <span className="flex items-center gap-1 text-xs font-medium text-emerald-300">
      <Clock className="h-3 w-3" />
      <span className="tabular-nums">{countdown}</span>
    </span>
  )
}

function DashboardSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="w-full space-y-6">
        <div className="bg-muted h-8 w-1/3 animate-pulse rounded" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-muted h-24 animate-pulse rounded" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="bg-muted h-64 animate-pulse rounded" />
          </div>
          <div className="space-y-6">
            <div className="bg-muted h-48 animate-pulse rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}

const defaultStats = {
  totalClasses: 0,
  totalStudents: 0,
  upcomingClasses: 0,
  earnings: 0,
  currency: 'SGD' as string,
}

type ScheduleSlot = {
  dayOfWeek: string
  startTime: string
  durationMinutes: number
}

type EnrolledCourse = {
  id: string
  /** The template course id to open in the scheduler/builder (id is the published variant). */
  templateCourseId?: string
  name: string
  categories?: string[] | null
  isPublished?: boolean | null
  price?: number | null
  currency?: string | null
  enrollmentCount: number
  sessionCount?: number
  upcomingSessionsCount?: number
  /** Count of weekly-pattern CourseSchedule rows (present even before sessions materialize). */
  scheduleCount?: number
  schedule?: ScheduleSlot[] | null
  nationality?: string
  variantCategory?: string
}

type CourseSession = {
  id: string
  title: string
  subject: string
  description?: string | null
  scheduledAt: string | null
  startedAt: string | null
  endedAt: string | null
  maxStudents: number
  enrolledStudents: number
  status: string
  roomUrl?: string | null
  isVirtual?: boolean
  /** null/absent = a one-time session; set = materialized from the course schedule */
  scheduleId?: string | null
  /** Display name of the linked schedule, e.g. "Schedule 1" (null for one-time). */
  scheduleName?: string | null
  durationMinutes?: number
  /** The lesson this session covers (auto-assigned on publish, tutor-editable). */
  lessonId?: string | null
  lessonTitle?: string | null
}

type CourseLessonOption = {
  id: string
  title: string
  order: number
}

type OneOnOneRequest = {
  requestId: string
  studentId: string
  requestedDate: string
  startTime: string
  endTime: string
  timezone: string
  costPerSession: number
  status: string
  durationMinutes?: number | null
  currency?: string | null
  seriesId?: string | null
  seriesIndex?: number | null
  createdAt?: string | null
  paymentDueAt?: string | null
  paidAt?: string | null
  student?: {
    userId?: string | null
    handle?: string | null
    email?: string | null
    image?: string | null
  } | null
}

// Inner component that uses searchParams
function TutorDashboardContent() {
  const { data: session } = useSession()
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const locale = typeof params?.locale === 'string' ? params.locale : 'en'
  const hasLocalePrefix = pathname.startsWith(`/${locale}/`)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [scheduleCourse, setScheduleCourse] = useState<{ id: string; name: string } | null>(null)
  const createSessionFormRef = useRef<CreateSessionFormRef>(null)
  // View state for the Course Sessions modal: 'list' or 'create'
  const [sessionsView, setSessionsView] = useState<'list' | 'create'>('list')
  // Course name + variant for the sessions modal (from the sessions API).
  const [sessionsCourseMeta, setSessionsCourseMeta] = useState<{
    name: string | null
    variantName: string
  } | null>(null)
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null)
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const [calendarView, setCalendarView] = useState<CalendarView>('day')
  const [activeTab, setActiveTab] = useState('courses')

  useEffect(() => {
    if (searchParams.get('create') === '1') setShowCreateDialog(true)
    if (searchParams.get('course') === '1') router.push('/tutor/courses/new')
  }, [searchParams, router])
  const [stats, setStats] = useState(defaultStats)
  const [heroStats, setHeroStats] = useState({
    sessionsToday: 0,
    activeCourses: 0,
    enrollments: 0,
    oneOnOneRequests: 0,
  })
  const [classes, setClasses] = useState<UpcomingClass[]>([])
  const [enrolledCourses, setEnrolledCourses] = useState<EnrolledCourse[]>([])
  const [allStudents, setAllStudents] = useState<
    Array<{ id: string; name: string; email: string; courseCount: number; classCount: number }>
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [launchingCourseId, setLaunchingCourseId] = useState<string | null>(null)
  const [oneAccountTipDismissed, setOneAccountTipDismissed] = useState(true)
  const [oneOnOneRequests, setOneOnOneRequests] = useState<OneOnOneRequest[]>([])
  const [rescheduleRequestId, setRescheduleRequestId] = useState<string | null>(null)
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null)
  const [joiningRequestId, setJoiningRequestId] = useState<string | null>(null)

  const [classroomDialogOpen, setClassroomDialogOpen] = useState(false)
  const [classroomCourse, setClassroomCourse] = useState<EnrolledCourse | null>(null)

  // Cancel Course Modal State
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [selectedCourseForCancel, setSelectedCourseForCancel] = useState<EnrolledCourse | null>(
    null
  )
  const [courseSessions, setCourseSessions] = useState<CourseSession[]>([])
  const [courseLessonOptions, setCourseLessonOptions] = useState<CourseLessonOption[]>([])
  const [savingLessonSessionId, setSavingLessonSessionId] = useState<string | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const loadingSessionsRef = useRef(false)
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null)
  const [cancellingSessionId, setCancellingSessionId] = useState<string | null>(null)
  useEffect(() => {
    try {
      setOneAccountTipDismissed(
        localStorage.getItem('tutor-dashboard-one-account-tip-dismissed') === '1'
      )
    } catch {
      setOneAccountTipDismissed(false)
    }
  }, [])
  const showOneAccountTip = !oneAccountTipDismissed
  const dismissOneAccountTip = () => {
    setOneAccountTipDismissed(true)
    try {
      localStorage.setItem('tutor-dashboard-one-account-tip-dismissed', '1')
    } catch {}
  }

  const fetchData = useCallback(async () => {
    if (!session?.user?.id) return
    setError(null)
    try {
      const [statsRes, heroStatsRes, classesRes, allStudentsRes, enrolledRes, oneOnOneRes] =
        await Promise.allSettled([
          fetch('/api/tutor/stats', { credentials: 'include' }),
          fetch('/api/tutor/dashboard/hero-stats', { credentials: 'include' }),
          fetch('/api/tutor/classes', { credentials: 'include' }),
          fetch('/api/tutor/students', { credentials: 'include' }),
          fetch('/api/tutor/courses/enrolled', { credentials: 'include' }),
          fetch('/api/one-on-one/request?role=received', { credentials: 'include' }),
        ])

      const failures: string[] = []

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const d = await statsRes.value.json()
        setStats({
          totalClasses: d.totalClasses ?? 0,
          totalStudents: d.totalStudents ?? 0,
          upcomingClasses: d.upcomingClasses ?? 0,
          earnings: d.earnings ?? 0,
          currency: d.currency ?? 'SGD',
        })
      } else {
        failures.push('stats')
      }

      if (heroStatsRes.status === 'fulfilled' && heroStatsRes.value.ok) {
        const d = await heroStatsRes.value.json()
        setHeroStats({
          sessionsToday: d.sessionsToday ?? 0,
          activeCourses: d.activeCourses ?? 0,
          enrollments: d.enrollments ?? 0,
          oneOnOneRequests: d.oneOnOneRequests ?? 0,
        })
      } else {
        failures.push('hero-stats')
      }

      if (classesRes.status === 'fulfilled' && classesRes.value.ok) {
        const d = await classesRes.value.json()
        setClasses(d.classes ?? [])
      } else {
        failures.push('classes')
      }

      if (allStudentsRes.status === 'fulfilled' && allStudentsRes.value.ok) {
        const d = await allStudentsRes.value.json()
        setAllStudents(d.students ?? [])
      } else {
        failures.push('students')
      }

      if (enrolledRes.status === 'fulfilled' && enrolledRes.value.ok) {
        const d = await enrolledRes.value.json()
        setEnrolledCourses(d.courses ?? [])
      } else {
        failures.push('enrolled-courses')
      }

      if (oneOnOneRes.status === 'fulfilled' && oneOnOneRes.value.ok) {
        const d = await oneOnOneRes.value.json()
        // Show pending requests (accept/reject) plus confirmed bookings
        // (accept/paid) so the tutor can reschedule them.
        const relevant = (d.requests ?? []).filter((req: OneOnOneRequest) =>
          ['PENDING', 'ACCEPTED', 'PAID'].includes(req.status)
        )
        setOneOnOneRequests(relevant)
      }

      if (failures.length >= 2) {
        setError('Failed to load dashboard data')
      }
    } catch {
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [session?.user?.id])

  // Lightweight refresh of just the live-class list — used to keep the
  // "Rejoin live" button in sync without re-pulling the whole dashboard.
  const refreshClasses = useCallback(async () => {
    if (!session?.user?.id) return
    try {
      const res = await fetch('/api/tutor/classes', { credentials: 'include' })
      if (res.ok) {
        const d = await res.json()
        setClasses(d.classes ?? [])
      }
    } catch {
      // best-effort; the next refresh will retry
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (session?.user?.id) {
      setLoading(true)
      fetchData()
    } else {
      setLoading(false)
    }
  }, [session?.user?.id, fetchData])

  // Keep the active-session state fresh so the "Rejoin live" button reliably
  // appears after a tutor backs out of the live classroom. A session only
  // flips to 'active' once the tutor is inside the room, and backing out is a
  // client-side navigation that doesn't always remount this page or fire
  // `focus` — so poll on an interval and refresh on focus / tab-visibility /
  // bfcache restore (`pageshow`).
  useEffect(() => {
    if (!session?.user?.id) return
    const refresh = () => {
      if (document.visibilityState === 'visible') refreshClasses()
    }
    const interval = setInterval(refresh, 20000)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [session?.user?.id, refreshClasses])

  const handleClassCreated = useCallback(
    (classData?: { id: string; [key: string]: unknown }) => {
      if (classData) {
        // Add the new class to the list immediately
        const newClass: UpcomingClass = {
          id: classData.id,
          title: (classData.title as string) || 'New Class',
          subject: (classData.subject as string) || '',
          scheduledAt: (classData.scheduledAt as string) || new Date().toISOString(),
          duration: (classData.durationMinutes as number) || 60,
          maxStudents: (classData.maxStudents as number) || 50,
          enrolledStudents: 0,
          status: (classData.status as string) || 'scheduled',
        }
        setClasses(prev => [newClass, ...prev])
        // Update stats
        setStats(prev => ({
          ...prev,
          totalClasses: prev.totalClasses + 1,
          upcomingClasses: prev.upcomingClasses + 1,
        }))
      } else {
        fetchData()
      }
    },
    [fetchData]
  )

  const handleRemoveClass = useCallback(async (classId: string) => {
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch(`/api/tutor/classes/${classId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
        },
        credentials: 'include',
      })

      if (res.ok) {
        setClasses(prev => prev.filter(c => c.id !== classId))
        setStats(prev => ({
          ...prev,
          totalClasses: Math.max(0, prev.totalClasses - 1),
          upcomingClasses: Math.max(0, prev.upcomingClasses - 1),
        }))
        toast.success('Session removed successfully')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to remove session')
      }
    } catch {
      toast.error('Failed to remove session')
    }
  }, [])

  const handleOneOnOneResponse = useCallback(
    async (requestId: string, action: 'accept' | 'reject') => {
      // Rejecting declines the student's request (and the whole series). Confirm
      // first so an inadvertent click doesn't turn a student away.
      if (
        action === 'reject' &&
        !window.confirm(
          'Reject this booking request? The student will be notified that you declined.'
        )
      ) {
        return
      }
      setRespondingRequestId(requestId)
      try {
        const res = await fetch('/api/one-on-one/respond', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ requestId, action }),
        })
        if (res.ok) {
          // Accepting/rejecting a series resolves ALL its rows — drop every
          // sibling that shares the seriesId, not just the head that was clicked.
          setOneOnOneRequests(prev => {
            const responded = prev.find(r => r.requestId === requestId)
            const sid = responded?.seriesId
            return prev.filter(r => (sid ? r.seriesId !== sid : r.requestId !== requestId))
          })
          toast.success(`Request ${action === 'accept' ? 'accepted' : 'rejected'}`)
        } else {
          const data = await res.json().catch(() => ({}))
          toast.error(data.error || 'Unable to respond to request')
        }
      } catch {
        toast.error('Unable to respond to request')
      } finally {
        setRespondingRequestId(null)
      }
    },
    []
  )

  const handleJoinOneOnOne = useCallback(
    async (requestId: string) => {
      setJoiningRequestId(requestId)
      const sessionId = await resolveOneOnOneSession(requestId)
      if (sessionId) router.push(`/call/${sessionId}`)
      setJoiningRequestId(null)
    },
    [router]
  )

  const handleOpenSessionsModal = useCallback(async (course: EnrolledCourse) => {
    if (loadingSessionsRef.current) return
    loadingSessionsRef.current = true
    setSelectedCourseForCancel(course)
    setCancelModalOpen(true)
    setCourseSessions([])
    setCourseLessonOptions([])
    setSessionLoadError(null)
    setLoadingSessions(true)

    try {
      const res = await fetch(`/api/tutor/courses/${course.id}/sessions`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setCourseSessions(data.sessions || [])
        setCourseLessonOptions(data.lessons || [])
        setSessionsCourseMeta(data.course || { name: course.name, variantName: '' })
      } else {
        const errData = await res.json().catch(() => ({}))
        console.error('Tutor session load failed:', errData, res.status)
        setSessionLoadError(errData.error || res.statusText || 'Failed to load sessions')
      }
    } catch (e) {
      console.error('Tutor session load exception:', e)
      setSessionLoadError('Network error. Please try again.')
    } finally {
      loadingSessionsRef.current = false
      setLoadingSessions(false)
    }
  }, [])

  const handleStartClass = useCallback(
    async (sessionId: string) => {
      if (launchingCourseId) return
      setLaunchingCourseId(sessionId)
      try {
        const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
        const csrfData = await csrfRes.json().catch(() => ({}))
        const csrfToken = csrfData?.token ?? null

        const res = await fetch(`/api/tutor/classes/${sessionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
          credentials: 'include',
        })

        const result = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(result?.error || 'Failed to start session')
          return
        }

        const updatedSessionId = result?.session?.id
        if (!updatedSessionId) {
          toast.error('Session started but no session ID returned')
          return
        }
        router.push(withLocalePath(`/tutor/classroom?sessionId=${updatedSessionId}`))
      } catch {
        toast.error('Failed to start session')
      } finally {
        setLaunchingCourseId(null)
      }
    },
    [launchingCourseId, router]
  )

  const handleCancelSession = useCallback(async (sessionId: string, reason?: string) => {
    setCancellingSessionId(sessionId)

    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch(`/api/tutor/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
        },
        credentials: 'include',
        body: JSON.stringify({ action: 'cancel', reason }),
      })

      if (res.ok) {
        setCourseSessions(prev =>
          prev.map(s =>
            s.id === sessionId ? { ...s, status: 'ended', endedAt: new Date().toISOString() } : s
          )
        )
        toast.success('Session cancelled successfully')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to cancel session')
      }
    } catch {
      toast.error('Failed to cancel session')
    } finally {
      setCancellingSessionId(null)
    }
  }, [])

  const handleAssignLesson = useCallback(
    async (sessionId: string, lessonId: string) => {
      const nextLessonId = lessonId || null
      // Optimistic update so the picker feels instant.
      const prevSessions = courseSessions
      setSavingLessonSessionId(sessionId)
      setCourseSessions(prev =>
        prev.map(s =>
          s.id === sessionId
            ? {
                ...s,
                lessonId: nextLessonId,
                lessonTitle: courseLessonOptions.find(l => l.id === nextLessonId)?.title ?? null,
              }
            : s
        )
      )

      try {
        const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
        const csrfData = await csrfRes.json().catch(() => ({}))
        const csrfToken = csrfData?.token ?? null

        const res = await fetch(`/api/tutor/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
          },
          credentials: 'include',
          body: JSON.stringify({ action: 'set-lesson', lessonId: nextLessonId }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setCourseSessions(prevSessions) // roll back
          toast.error(data.error || 'Failed to update lesson')
          return
        }
        toast.success(nextLessonId ? 'Lesson updated' : 'Lesson cleared')
      } catch {
        setCourseSessions(prevSessions) // roll back
        toast.error('Failed to update lesson')
      } finally {
        setSavingLessonSessionId(null)
      }
    },
    [courseSessions, courseLessonOptions]
  )

  const withLocalePath = useCallback(
    (path: string) => {
      if (path.startsWith('http')) return path
      if (hasLocalePrefix) {
        if (path.startsWith(`/${locale}/`)) return path
        if (path.startsWith('/')) return `/${locale}${path}`
        return `/${locale}/${path}`
      }
      if (path.startsWith('/')) return path
      return `/${path}`
    },
    [hasLocalePrefix, locale]
  )

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getNextSessionTime = () => {
    if (!classes || classes.length === 0) return null
    const now = new Date().getTime()

    // Find the first class that is in the future
    const upcoming = classes
      .map(c => ({ ...c, time: new Date(c.scheduledAt).getTime() }))
      .filter(c => c.time > now)
      .sort((a, b) => a.time - b.time)[0]

    if (!upcoming) return null
    return upcoming.scheduledAt
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div className="flex h-full w-full flex-col px-3 lg:px-4">
        {/* Modern Hero Section */}
        <div className="mb-2 flex-shrink-0">
          <ModernHeroSection
            stats={stats}
            heroStats={heroStats}
            loading={loading}
            nextSessionAt={getNextSessionTime() || undefined}
          />
        </div>

        {/* Reschedule proposals awaiting student agreement */}
        <TutorPendingRescheduleBanner />

        {error && (
          <div className="border-destructive/20 bg-destructive/10 text-destructive mb-4 flex-shrink-0 rounded-xl border p-3 text-sm">
            {error}
            <Button
              variant="outline"
              size="sm"
              className="hover:bg-muted ml-2 transition-all duration-200"
              onClick={() => {
                setLoading(true)
                fetchData()
              }}
            >
              Retry
            </Button>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-0.5">
          <SessionCalendarPanel
            value={activeTab}
            onValueChange={setActiveTab}
            tabs={[
              { value: 'courses', label: 'Sessions' },
              { value: 'calendar', label: 'Calendar' },
              { value: 'availability', label: 'My Availability' },
              { value: 'oneOnOne', label: '1-on-1 Requests' },
            ]}
            showCalendarControls={activeTab === 'calendar' || activeTab === 'availability'}
            calendarView={calendarView}
            onCalendarViewChange={setCalendarView}
            timezone={timezone}
            onTimezoneChange={setTimezone}
          >
            <TabsContent
              value="calendar"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <InteractiveCalendar
                initialView="day"
                dayClickMode="create"
                loading={loading}
                embedded
                timezone={timezone}
                onTimezoneChange={setTimezone}
                view={calendarView}
                onViewChange={setCalendarView}
              />
            </TabsContent>
            <TabsContent
              value="availability"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <InteractiveCalendar
                initialView="availability"
                dayClickMode="availability"
                loading={loading}
                availabilityOnly
                embedded
                timezone={timezone}
                onTimezoneChange={setTimezone}
                view={calendarView}
                onViewChange={setCalendarView}
              />
            </TabsContent>
            <TabsContent
              value="courses"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div className="h-full overflow-y-auto">
                <CardTitle className="text-card-foreground mb-4 flex items-center gap-2">
                  Session Schedule
                  <span className="text-muted-foreground text-sm font-normal">
                    {new Date().toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </CardTitle>
                <div className="space-y-3">
                  {enrolledCourses.length === 0 ? (
                    <div className="text-muted-foreground border-border/30 rounded-lg border border-dashed p-6 text-center text-sm">
                      No courses have enrolled students yet.
                    </div>
                  ) : (
                    enrolledCourses.map(course => {
                      const courseClasses = classes.filter(c => c.courseId === course.id)
                      // "View Sessions" should appear whenever there's anything to view:
                      // a materialized class, a counted session, or a weekly schedule
                      // (which the sessions modal materializes on open). Keying only off
                      // `classes` (upcoming/active liveSession rows) made a course that
                      // has schedules but no upcoming session wrongly show "Schedule
                      // sessions".
                      const hasViewableSessions =
                        courseClasses.length > 0 ||
                        (course.sessionCount ?? 0) > 0 ||
                        (course.scheduleCount ?? 0) > 0 ||
                        (course.schedule?.length ?? 0) > 0
                      const hasActive = courseClasses.some(
                        c =>
                          c.status === 'active' || c.status === 'live' || c.status === 'preparing'
                      )
                      const nextSession = courseClasses.find(c => c.status === 'scheduled')
                      const isWithin1Hour =
                        nextSession &&
                        new Date(nextSession.scheduledAt).getTime() - Date.now() <= 3600000

                      return (
                        <div
                          key={course.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/20 bg-[#36454F] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-all duration-200 hover:shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-semibold text-white">
                                {course.nationality && course.nationality !== 'Global' ? (
                                  <span className="inline-flex items-center gap-1">
                                    {course.name} —{' '}
                                    {course.variantCategory ||
                                      (course.categories || [])[0] ||
                                      'General'}{' '}
                                    —{' '}
                                    <CountryFlag
                                      countryName={course.nationality}
                                      size="xs"
                                      showLabel
                                    />
                                  </span>
                                ) : (
                                  course.name
                                )}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                              <span className="text-white">
                                {(course.categories || [])[0] || 'Untitled'}
                              </span>
                              {course.price ? (
                                <span className="text-white/70">
                                  • {course.currency ?? 'USD'} {course.price}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 text-xs">
                              <Badge
                                variant="outline"
                                className="cursor-pointer border-white/30 bg-[#36454F] text-white transition-all duration-200 hover:bg-[#4a5a65]"
                                onClick={() => handleOpenSessionsModal(course)}
                              >
                                {course.sessionCount
                                  ? `${course.sessionCount} session${course.sessionCount === 1 ? '' : 's'}`
                                  : course.schedule && course.schedule.length > 0
                                    ? `${course.schedule.length} slot${course.schedule.length === 1 ? '' : 's'}`
                                    : '0 sessions'}
                              </Badge>
                              <Link
                                href={withLocalePath(`/tutor/courses/${course.id}/enrollments`)}
                              >
                                <Badge
                                  variant="outline"
                                  className="cursor-pointer border-white/30 bg-[#36454F] text-white transition-all duration-200 hover:bg-[#4a5a65]"
                                >
                                  {course.enrollmentCount} enrolled
                                </Badge>
                              </Link>
                            </div>
                            {/* Countdown to next session */}
                            {nextSession && (
                              <SessionCountdown scheduledAt={nextSession.scheduledAt} />
                            )}
                            {hasActive &&
                              (() => {
                                // A session is live right now — give a one-click
                                // way back into the classroom. Leaving the live
                                // room (back arrow) doesn't end the session, so a
                                // tutor must be able to rejoin without hunting
                                // through the sessions modal.
                                const live = courseClasses.find(
                                  c =>
                                    c.status === 'active' ||
                                    c.status === 'live' ||
                                    c.status === 'preparing'
                                )
                                return live ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      router.push(
                                        withLocalePath(`/tutor/classroom?sessionId=${live.id}`)
                                      )
                                    }
                                    className="border-transparent bg-emerald-500 text-white transition-all duration-200 hover:border-transparent hover:bg-white hover:text-emerald-500"
                                  >
                                    <Video className="mr-1 h-3 w-3" />
                                    Rejoin live
                                  </Button>
                                ) : null
                              })()}
                            {/* Classroom lobby: review past sessions, see the next
                                session's countdown, and get pulled in when it
                                starts. Uses the published course id (course.id) —
                                the one live sessions live under. */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setClassroomCourse(course)
                                setClassroomDialogOpen(true)
                              }}
                              className="border-transparent bg-emerald-500 text-white transition-all duration-200 hover:bg-white hover:text-emerald-500"
                            >
                              <Presentation className="mr-1 h-3 w-3" />
                              Classroom
                            </Button>
                            {/* When sessions exist, the "N sessions" count badge above
                                already opens the sessions modal, so a separate "View
                                Sessions" button here was redundant and has been removed.
                                With no sessions yet, send the tutor to the scheduler
                                (course details page) to add slots and publish. */}
                            {!hasViewableSessions && (
                              <Button
                                asChild
                                variant="default"
                                size="sm"
                                className="bg-blue-600 text-white transition-all duration-200 hover:bg-white hover:text-blue-600"
                              >
                                <Link
                                  href={withLocalePath(
                                    `/tutor/courses/${course.templateCourseId ?? course.id}`
                                  )}
                                >
                                  <CalendarClock className="mr-1 h-3 w-3" />
                                  Schedule sessions
                                </Link>
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-white/30 bg-[#36454F] text-white transition-all duration-200 hover:border-transparent hover:bg-white hover:text-red-500"
                              onClick={() =>
                                router.push(
                                  withLocalePath(
                                    // The builder edits the TEMPLATE course (where the
                                    // lessons live). `course.id` is the published
                                    // variant, which has no builder lessons — opening
                                    // it showed an empty course after publishing.
                                    // NOTE: no `mode=edit` — that flag forces the builder
                                    // into detached/localStorage mode, which reads nothing
                                    // from the DB (empty course) and can wipe the real
                                    // lessons on save. A published course must load/save
                                    // against the DB.
                                    `/tutor/insights?tab=builder&courseId=${course.templateCourseId || course.id}`
                                  )
                                )
                              }
                            >
                              <Pencil className="mr-1 h-3 w-3" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-white/30 bg-[#36454F] text-white transition-all duration-200 hover:border-transparent hover:bg-white hover:text-purple-500"
                              onClick={() =>
                                setScheduleCourse({ id: course.id, name: course.name })
                              }
                            >
                              <CalendarClock className="mr-1 h-3 w-3" />
                              Schedule
                            </Button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </TabsContent>
            <TabsContent
              value="oneOnOne"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div className="h-full overflow-y-auto">
                <div className="mb-4 flex items-center justify-between">
                  <CardTitle className="text-card-foreground">Pending 1-on-1 Requests</CardTitle>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="hover:bg-muted/80 transition-all duration-200"
                  >
                    <Link href={withLocalePath('/tutor/communications')}>View all</Link>
                  </Button>
                </div>
                <div className="space-y-3">
                  {oneOnOneRequests.length === 0 ? (
                    <div className="text-muted-foreground border-border/30 rounded-lg border border-dashed p-6 text-center text-sm">
                      No pending 1 on 1 requests.
                    </div>
                  ) : (
                    groupIntoSeries(oneOnOneRequests).map(group => {
                      // Accept/reject/reschedule target the series head; the API
                      // applies the action to the whole series.
                      const request = group.head
                      return (
                        <OneOnOneRequestCard
                          key={request.seriesId ?? request.requestId}
                          request={request}
                          perspective="tutor"
                          variant="light"
                          series={group.series}
                          actions={
                            request.status === 'PENDING' ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={respondingRequestId === request.requestId}
                                  onClick={() =>
                                    handleOneOnOneResponse(request.requestId, 'accept')
                                  }
                                >
                                  {group.series ? 'Accept all' : 'Accept'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:bg-destructive/10"
                                  disabled={respondingRequestId === request.requestId}
                                  onClick={() =>
                                    handleOneOnOneResponse(request.requestId, 'reject')
                                  }
                                >
                                  {group.series ? 'Reject all' : 'Reject'}
                                </Button>
                              </>
                            ) : (
                              <>
                                {(() => {
                                  const joinId =
                                    request.status === 'PAID'
                                      ? joinableRequestId(group.members)
                                      : null
                                  return joinId ? (
                                    <Button
                                      size="sm"
                                      disabled={joiningRequestId === joinId}
                                      onClick={() => handleJoinOneOnOne(joinId)}
                                    >
                                      <Video className="mr-1.5 h-3.5 w-3.5" />
                                      {joiningRequestId === joinId ? 'Opening…' : 'Join session'}
                                    </Button>
                                  ) : null
                                })()}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setRescheduleRequestId(request.requestId)}
                                >
                                  Reschedule
                                </Button>
                              </>
                            )
                          }
                        />
                      )
                    })
                  )}
                </div>
              </div>
            </TabsContent>
          </SessionCalendarPanel>
        </div>

        {/* Create Class Dialog */}
        <CreateClassDialog
          open={showCreateDialog}
          onOpenChange={open => {
            setShowCreateDialog(open)
            if (!open) setScheduleDate(null)
          }}
          onClassCreated={handleClassCreated}
          redirectToClass={false}
          initialDate={scheduleDate}
        />

        <ClassroomDialog
          open={classroomDialogOpen}
          onOpenChange={setClassroomDialogOpen}
          courseId={classroomCourse?.id ?? null}
          courseName={classroomCourse?.name ?? ''}
          nationality={classroomCourse?.nationality ?? null}
          variantCategory={classroomCourse?.variantCategory ?? null}
          categories={classroomCourse?.categories ?? null}
        />

        {/* Course Sessions Modal */}
        <Dialog
          open={cancelModalOpen}
          onOpenChange={open => {
            if (!open) {
              setSessionsView('list')
            }
            setCancelModalOpen(open)
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border border-slate-200 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                {sessionsView === 'create' ? (
                  <>
                    <Video className="text-primary h-5 w-5" />
                    Create Class
                  </>
                ) : (
                  <>
                    <Calendar className="text-primary h-5 w-5" />
                    Course Sessions
                  </>
                )}
              </DialogTitle>
              <DialogDescription className="text-white/80">
                {sessionsView === 'create'
                  ? 'Schedule a single session using this course curriculum'
                  : selectedCourseForCancel && (
                      <>
                        Manage sessions for{' '}
                        <strong>
                          {selectedCourseForCancel.nationality &&
                          selectedCourseForCancel.nationality !== 'Global' ? (
                            <span className="inline-flex items-center gap-1">
                              {selectedCourseForCancel.name} —{' '}
                              {selectedCourseForCancel.variantCategory ||
                                (selectedCourseForCancel.categories || [])[0] ||
                                'General'}{' '}
                              —{' '}
                              <CountryFlag
                                countryName={selectedCourseForCancel.nationality}
                                size="xs"
                                showLabel
                              />
                            </span>
                          ) : (
                            selectedCourseForCancel.name
                          )}
                        </strong>
                      </>
                    )}
              </DialogDescription>
            </DialogHeader>

            <div className="relative mt-4 h-[520px]">
              {/* Create Class view */}
              <div
                className={cn(
                  'absolute inset-0 transition-opacity duration-300',
                  sessionsView === 'create' ? 'opacity-100' : 'pointer-events-none opacity-0'
                )}
              >
                {sessionsView === 'create' && selectedCourseForCancel && (
                  <div className="flex h-full flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto">
                      <CreateSessionForm
                        ref={createSessionFormRef}
                        courseId={selectedCourseForCancel.id}
                        courseName={selectedCourseForCancel.name}
                        onCancel={() => setSessionsView('list')}
                        onSuccess={() => {
                          setSessionsView('list')
                          if (selectedCourseForCancel) {
                            toast.success('One-time session created')
                            handleOpenSessionsModal({
                              id: selectedCourseForCancel.id,
                              name: selectedCourseForCancel.name,
                            } as EnrolledCourse)
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Session list view */}
              <div
                className={cn(
                  'transition-opacity duration-300',
                  sessionsView === 'list'
                    ? 'opacity-100'
                    : 'pointer-events-none absolute inset-0 opacity-0'
                )}
              >
                <div className="h-[520px] text-white">
                  {loadingSessions ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
                    </div>
                  ) : sessionLoadError ? (
                    <div className="border-destructive/20 rounded-lg border border-dashed p-6 text-center text-sm">
                      <AlertCircle className="text-destructive/50 mx-auto mb-2 h-8 w-8" />
                      <p className="text-destructive font-medium">Failed to load sessions</p>
                      <p className="text-muted-foreground mt-1 text-xs">{sessionLoadError}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 transition-all duration-200"
                        onClick={() =>
                          selectedCourseForCancel &&
                          handleOpenSessionsModal(selectedCourseForCancel)
                        }
                      >
                        Retry
                      </Button>
                    </div>
                  ) : courseSessions.length === 0 ? (
                    <div className="text-muted-foreground border-border/30 rounded-lg border border-dashed p-6 text-center text-sm">
                      <Calendar className="text-muted-foreground/50 mx-auto mb-2 h-8 w-8" />
                      <p>No sessions found for this course.</p>
                      <p className="mt-1 text-xs">
                        Sessions are created from the time slots in the course schedule.
                      </p>
                      {selectedCourseForCancel && (
                        <Button asChild size="sm" className="mt-3 transition-all duration-200">
                          <Link
                            href={withLocalePath(
                              `/tutor/courses/${selectedCourseForCancel.templateCourseId ?? selectedCourseForCancel.id}`
                            )}
                          >
                            <CalendarClock className="mr-1 h-3 w-3" />
                            Set up the schedule
                          </Link>
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="scrollbar-hide h-[520px] space-y-3 overflow-y-auto pr-2">
                      {courseSessions.length > 6 && (
                        <p className="text-muted-foreground pb-1 text-xs">
                          {courseSessions.length} sessions — scroll to see all
                        </p>
                      )}
                      <div className="space-y-3">
                        {courseSessions.map(session => {
                          const isVirtual = session.isVirtual === true
                          const _isPassedSession =
                            !isVirtual &&
                            session.scheduledAt &&
                            new Date(session.scheduledAt).getTime() + 2 * 60 * 60 * 1000 <
                              Date.now()
                          const isScheduled = session.status === 'scheduled'
                          const isActive = session.status === 'active'
                          const isEnded = session.status === 'ended'
                          const isPast =
                            session.scheduledAt &&
                            new Date(session.scheduledAt).getTime() < Date.now() - 5 * 60 * 1000
                          const canCancel = !isVirtual && (isScheduled || isActive) && !isPast

                          // For virtual sessions, compute dynamic status
                          let displayStatus = session.status
                          if (isVirtual && session.scheduledAt) {
                            const diff = new Date(session.scheduledAt).getTime() - Date.now()
                            if (diff <= 0) displayStatus = 'opening_soon'
                            else if (diff <= 60 * 60 * 1000) displayStatus = 'opening_soon'
                            else displayStatus = 'upcoming'
                          }

                          const badgeClass =
                            isActive || displayStatus === 'active'
                              ? 'bg-success/15 text-success border-success/25'
                              : isEnded
                                ? 'bg-muted text-muted-foreground border-border/30'
                                : displayStatus === 'opening_soon'
                                  ? 'bg-warning/15 text-warning border-warning/25'
                                  : 'bg-info/15 text-info border-info/25'

                          return (
                            <div
                              key={session.id}
                              className="border-border/30 bg-card hover:border-border/50 flex items-center justify-between rounded-lg border p-3 transition-all duration-200 hover:bg-white"
                            >
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate font-medium text-gray-900">
                                    {sessionsCourseMeta?.name
                                      ? (() => {
                                          const [cat, nat] = sessionsCourseMeta.variantName
                                            ? sessionsCourseMeta.variantName.split(' — ')
                                            : []
                                          if (nat && nat !== 'Global') {
                                            return (
                                              <span className="inline-flex items-center gap-1">
                                                {sessionsCourseMeta.name} — {cat} —{' '}
                                                <CountryFlag
                                                  countryName={nat}
                                                  size="xs"
                                                  showLabel
                                                />
                                              </span>
                                            )
                                          }
                                          return `${sessionsCourseMeta.name}${cat ? ` — ${cat}` : ''}`
                                        })()
                                      : session.title}
                                  </p>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'text-[10px] uppercase tracking-wide',
                                      badgeClass
                                    )}
                                  >
                                    {displayStatus}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'text-[10px] uppercase tracking-wide',
                                      isVirtual || session.scheduleId
                                        ? 'bg-info/10 text-info border-info/25'
                                        : 'bg-warning/10 text-warning border-warning/25'
                                    )}
                                  >
                                    {isVirtual || session.scheduleId ? 'From schedule' : 'One-time'}
                                  </Badge>
                                  {session.scheduleName && (
                                    <Badge
                                      variant="outline"
                                      className="border-primary/25 bg-primary/10 text-primary text-[10px] uppercase tracking-wide"
                                    >
                                      {session.scheduleName}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                  {session.scheduledAt && (
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {new Date(session.scheduledAt).toLocaleDateString('en-US', {
                                        weekday: 'short',
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                      })}
                                    </span>
                                  )}
                                  {session.scheduledAt && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {new Date(session.scheduledAt).toLocaleTimeString('en-US', {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                  )}
                                  {!isVirtual && (
                                    <span className="flex items-center gap-1">
                                      <Users className="h-3 w-3" />
                                      {session.enrolledStudents ?? 0} / {session.maxStudents ?? 50}
                                    </span>
                                  )}
                                  {isVirtual && session.durationMinutes && (
                                    <span>{session.durationMinutes} min</span>
                                  )}
                                </div>
                                {session.description && (
                                  <p className="text-muted-foreground truncate text-xs">
                                    {session.description}
                                  </p>
                                )}
                                {!isVirtual && courseLessonOptions.length > 0 && (
                                  <div className="flex items-center gap-2 pt-0.5">
                                    <BookOpen className="text-muted-foreground h-3 w-3 shrink-0" />
                                    <label className="sr-only" htmlFor={`lesson-${session.id}`}>
                                      Lesson this session covers
                                    </label>
                                    <select
                                      id={`lesson-${session.id}`}
                                      value={session.lessonId ?? ''}
                                      disabled={savingLessonSessionId === session.id}
                                      onChange={e => handleAssignLesson(session.id, e.target.value)}
                                      className="border-border/40 bg-background max-w-[220px] truncate rounded-md border px-2 py-1 text-xs text-gray-900 disabled:opacity-60"
                                    >
                                      <option value="">No lesson assigned</option>
                                      {courseLessonOptions.map((l, i) => (
                                        <option key={l.id} value={l.id}>
                                          {`Lesson ${i + 1}: ${l.title}`}
                                        </option>
                                      ))}
                                    </select>
                                    {savingLessonSessionId === session.id && (
                                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="ml-4 flex items-center gap-2">
                                {canCancel && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      if (
                                        confirm(
                                          'Are you sure you want to cancel this session? Students will be notified.'
                                        )
                                      ) {
                                        handleCancelSession(session.id, 'Cancelled by tutor')
                                      }
                                    }}
                                    disabled={cancellingSessionId === session.id}
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive/80 transition-all duration-200"
                                  >
                                    {cancellingSessionId === session.id ? (
                                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    ) : (
                                      <Ban className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                                {isVirtual ? (
                                  // Upcoming slot from the schedule that isn't materialized yet.
                                  // It becomes startable automatically once published into range;
                                  // tutors add/extend slots via the scheduler (footer button), not
                                  // by creating an ad-hoc session here.
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled
                                    title="This scheduled slot opens automatically — manage it from the course scheduler."
                                  >
                                    Upcoming
                                  </Button>
                                ) : isScheduled ? (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    disabled={launchingCourseId === session.id}
                                    onClick={() => handleStartClass(session.id)}
                                    className="transition-all duration-200"
                                  >
                                    {launchingCourseId === session.id ? (
                                      <div className="mr-1 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    ) : (
                                      <Video className="mr-1 h-3 w-3" />
                                    )}
                                    Start Session
                                  </Button>
                                ) : isActive ? (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() =>
                                      router.push(
                                        withLocalePath(`/tutor/classroom?sessionId=${session.id}`)
                                      )
                                    }
                                    className="transition-all duration-200"
                                  >
                                    Join Session
                                  </Button>
                                ) : (
                                  <Button variant="ghost" size="sm" disabled>
                                    {isEnded ? 'Ended' : 'N/A'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Separator className="my-4" />

            <DialogFooter className="flex items-center justify-end sm:justify-end">
              <div className="flex flex-wrap items-center gap-2">
                {selectedCourseForCancel && sessionsView === 'list' && (
                  <Button variant="modal-primary-dark" onClick={() => setSessionsView('create')}>
                    <Video className="mr-1 h-4 w-4" />
                    Create Class
                  </Button>
                )}
                {sessionsView === 'create' && (
                  <>
                    <Button variant="modal-secondary-dark" onClick={() => setSessionsView('list')}>
                      Cancel
                    </Button>
                    <Button
                      variant="modal-primary-dark"
                      onClick={() => createSessionFormRef.current?.submit()}
                    >
                      <Video className="mr-1 h-4 w-4" />
                      Publish Class
                    </Button>
                  </>
                )}
                {sessionsView === 'list' && (
                  <Button variant="modal-secondary-dark" onClick={() => setCancelModalOpen(false)}>
                    Close
                  </Button>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <ScheduleViewModal
        courseId={scheduleCourse?.id ?? null}
        courseName={scheduleCourse?.name}
        canCreate
        onClose={() => setScheduleCourse(null)}
      />
      {rescheduleRequestId && (
        <OneOnOneRescheduleDialog
          requestId={rescheduleRequestId}
          open
          onOpenChange={o => !o && setRescheduleRequestId(null)}
          onChanged={fetchData}
        />
      )}
    </div>
  )
}

// Main export wrapped in Suspense
export default function TutorDashboard() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <TutorDashboardContent />
    </Suspense>
  )
}
