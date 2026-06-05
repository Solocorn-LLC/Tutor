'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

import {
  CreateClassDialog,
  StatsCards,
  UpcomingClassesCard,
  InteractiveCalendar,
  type UpcomingClass,

} from './components'
import { DEFAULT_TIMEZONE, SUPPORTED_TIMEZONES } from './components/InteractiveCalendar'
import { ModernHeroSection } from './components/ModernHeroSection'

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
  name: string
  categories?: string[] | null
  isPublished?: boolean | null
  price?: number | null
  currency?: string | null
  enrollmentCount: number
  sessionCount?: number
  upcomingSessionsCount?: number
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
  durationMinutes?: number
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
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null)
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)

  useEffect(() => {
    if (searchParams.get('create') === '1') setShowCreateDialog(true)
    if (searchParams.get('course') === '1') router.push('/tutor/courses/new')
  }, [searchParams, router])
  const [stats, setStats] = useState(defaultStats)
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
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null)

  // Cancel Course Modal State
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [selectedCourseForCancel, setSelectedCourseForCancel] = useState<EnrolledCourse | null>(
    null
  )
  const [courseSessions, setCourseSessions] = useState<CourseSession[]>([])
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
      const [statsRes, classesRes, allStudentsRes, enrolledRes, oneOnOneRes] =
        await Promise.allSettled([
          fetch('/api/tutor/stats', { credentials: 'include' }),
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
        const pending = (d.requests ?? []).filter(
          (req: OneOnOneRequest) => req.status === 'PENDING'
        )
        setOneOnOneRequests(pending)
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

  useEffect(() => {
    if (session?.user?.id) {
      setLoading(true)
      fetchData()
    } else {
      setLoading(false)
    }
  }, [session?.user?.id, fetchData])

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
      setRespondingRequestId(requestId)
      try {
        const res = await fetch('/api/one-on-one/respond', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ requestId, action }),
        })
        if (res.ok) {
          setOneOnOneRequests(prev => prev.filter(r => r.requestId !== requestId))
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

  const handleOpenSessionsModal = useCallback(async (course: EnrolledCourse) => {
    if (loadingSessionsRef.current) return
    loadingSessionsRef.current = true
    setSelectedCourseForCancel(course)
    setCancelModalOpen(true)
    setCourseSessions([])
    setSessionLoadError(null)
    setLoadingSessions(true)

    try {
      const res = await fetch(`/api/tutor/courses/${course.id}/sessions`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setCourseSessions(data.sessions || [])
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

  const handleEnterCourseClassroom = useCallback(
    async (course: EnrolledCourse, scheduledAt?: string | null) => {
      if (launchingCourseId) return
      setLaunchingCourseId(course.id)
      try {
        const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
        const csrfData = await csrfRes.json().catch(() => ({}))
        const csrfToken = csrfData?.token ?? null

        const res = await fetch('/api/class/rooms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            courseId: course.id,
            title: course.name,
            subject: (course.categories || [])[0] || course.name || 'General',
            maxStudents: 50,
            durationMinutes: scheduledAt
              ? (course.schedule?.find(() => true)?.durationMinutes ?? 60)
              : 60,
            scheduledAt,
          }),
        })

        const result = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (res.status === 409) {
            toast.info(
              'You have an active or scheduled session for this slot. Please select it below.'
            )
            handleOpenSessionsModal(course)
            return
          }
          toast.error(result?.error || 'Failed to launch classroom')
          return
        }

        const sessionId = result?.session?.sessionId
        if (!sessionId) {
          toast.error('Classroom created but no session ID returned')
          return
        }
        // Navigate directly to live session page (Live tab)
        router.push(withLocalePath(`/tutor/classroom?sessionId=${sessionId}`))
      } catch {
        toast.error('Failed to launch classroom')
      } finally {
        setLaunchingCourseId(null)
      }
    },
    [launchingCourseId, router, handleOpenSessionsModal]
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

  const getNextSessionText = () => {
    if (!classes || classes.length === 0) return null
    const now = new Date().getTime()

    // Find the first class that is in the future
    const upcoming = classes
      .map(c => ({ ...c, time: new Date(c.scheduledAt).getTime() }))
      .filter(c => c.time > now)
      .sort((a, b) => a.time - b.time)[0]

    if (!upcoming) return null

    const diff = upcoming.time - now
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 48) {
      return new Date(upcoming.time).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    }
    if (hours > 0) return `in ${hours}h ${minutes}m`
    return `in ${minutes}m`
  }

  return (
    <div className="min-h-screen">
      <div className="w-full px-3 lg:px-4">
        {/* Modern Hero Section */}
        <div className="mb-8">
          <ModernHeroSection
            stats={stats}
            loading={loading}
            nextSession={getNextSessionText() || undefined}
          />
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
            <Button
              variant="outline"
              size="sm"
              className="ml-2 transition-all duration-200 hover:bg-muted"
              onClick={() => {
                setLoading(true)
                fetchData()
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Dashboard Stats */}
        <div className="mb-8 space-y-4">
          <Card className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 gap-6 divide-y divide-border/20 md:grid-cols-2 md:divide-x md:divide-y-0">
                <div className="py-2 text-center md:py-0">
                  <h3 className="text-muted-foreground text-lg font-medium">Total Classes</h3>
                  <p className="mt-2 text-4xl font-bold text-foreground">{stats.totalClasses}</p>
                </div>
                <div className="py-2 text-center md:px-6 md:py-0">
                  <h3 className="text-muted-foreground text-lg font-medium">Active Students</h3>
                  <p className="mt-2 text-4xl font-bold text-foreground">{stats.totalStudents}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 1-on-1 Requests */}
        <div className="mb-8">
          <Card className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle className="text-card-foreground">1-on-1 Requests</CardTitle>
                <p className="text-muted-foreground text-xs">Pending requests from students</p>
              </div>
              <Button asChild variant="outline" size="sm" className="transition-all duration-200 hover:bg-muted/80">
                <Link href={withLocalePath('/tutor/notifications')}>View all</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {oneOnOneRequests.length === 0 ? (
                <div className="text-muted-foreground rounded-lg border border-dashed border-border/30 p-6 text-center text-sm">
                  No pending 1-on-1 requests.
                </div>
              ) : (
                oneOnOneRequests.slice(0, 3).map(request => (
                  <div
                    key={request.requestId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/20 bg-muted/30 p-4 transition-all duration-200 hover:border-border/40 hover:bg-muted/50"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate font-semibold text-foreground">
                        @{request.student?.handle || 'student'}
                      </p>
                      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                        <span>
                          {new Date(request.requestedDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                        <span>•</span>
                        <span>
                          {request.startTime} - {request.endTime}
                        </span>
                        <span>•</span>
                        <span>{request.timezone}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={respondingRequestId === request.requestId}
                        onClick={() => handleOneOnOneResponse(request.requestId, 'accept')}
                        className="transition-all duration-200"
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive transition-all duration-200 hover:bg-destructive/10"
                        disabled={respondingRequestId === request.requestId}
                        onClick={() => handleOneOnOneResponse(request.requestId, 'reject')}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))
              )}
              {oneOnOneRequests.length > 3 ? (
                <p className="text-muted-foreground text-xs">
                  +{oneOnOneRequests.length - 3} more pending requests
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="mb-8">
          <Card className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
            <Tabs defaultValue="courses" className="w-full">
              <CardHeader className="pb-0">
                <div className="flex items-center gap-3">
                  <TabsList className="grid w-full max-w-md grid-cols-3 bg-[#2D2B4E] p-1 rounded-xl">
                    <TabsTrigger
                      value="courses"
                      className="rounded-lg text-white/70 hover:text-white data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-sm"
                    >
                      Active Courses
                    </TabsTrigger>
                    <TabsTrigger
                      value="calendar"
                      className="rounded-lg text-white/70 hover:text-white data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-sm"
                    >
                      Calendar
                    </TabsTrigger>
                    <TabsTrigger
                      value="availability"
                      className="rounded-lg text-white/70 hover:text-white data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-sm"
                    >
                      My Availability
                    </TabsTrigger>
                  </TabsList>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="h-10 w-[190px] rounded-sm border border-gray-300 bg-white/50 text-sm text-gray-800 shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-white/70 hover:border-gray-400 hover:shadow-md focus-visible:!shadow-none focus:outline-none focus-visible:outline-none">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg border border-gray-200 bg-none bg-white/50 p-1.5 shadow-lg backdrop-blur-md w-[var(--radix-select-trigger-width)]">
                      {SUPPORTED_TIMEZONES.map(tz => (
                        <SelectItem key={tz} value={tz} className="text-gray-800 focus:text-gray-800 hover:bg-gray-100 focus:bg-gray-100 mx-1.5 focus:outline-none rounded-md">
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <TabsContent value="calendar">
                  <InteractiveCalendar initialView="day" dayClickMode="create" loading={loading} embedded timezone={timezone} onTimezoneChange={setTimezone} />
                </TabsContent>
                <TabsContent value="availability">
                  <InteractiveCalendar
                    initialView="availability"
                    dayClickMode="availability"
                    loading={loading}
                    availabilityOnly
                    embedded
                    timezone={timezone}
                    onTimezoneChange={setTimezone}
                  />
                </TabsContent>
                <TabsContent value="courses">
                  <CardTitle className="mb-4 text-card-foreground">Courses With Enrolled Students</CardTitle>
                  <div className="space-y-3">
                  {enrolledCourses.length === 0 ? (
                    <div className="text-muted-foreground rounded-lg border border-dashed border-border/30 p-6 text-center text-sm">
                      No courses have enrolled students yet.
                    </div>
                  ) : (
                    enrolledCourses.map(course => {
                      const courseClasses = classes.filter(c => c.courseId === course.id)
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
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/20 bg-muted/30 p-4 transition-all duration-200 hover:border-border/40 hover:bg-muted/50"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-semibold text-foreground">
                                {course.nationality && course.nationality !== 'Global'
                                  ? `${course.name} — ${course.variantCategory || (course.categories || [])[0] || 'General'} — ${course.nationality}`
                                  : course.name}
                              </p>
                            </div>
                            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                              <span>{(course.categories || [])[0] || 'Untitled'}</span>
                              {course.price ? (
                                <span>
                                  • {course.currency ?? 'USD'} {course.price}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge
                                variant={hasActive || isWithin1Hour ? 'default' : 'secondary'}
                                className={cn(
                                  'cursor-pointer transition-all duration-200',
                                  hasActive
                                    ? 'bg-success text-success-foreground hover:brightness-110'
                                    : isWithin1Hour
                                      ? 'bg-warning text-warning-foreground hover:brightness-110'
                                      : 'border-border/30 bg-muted/50 text-muted-foreground hover:bg-muted/70'
                                )}
                                onClick={() => handleOpenSessionsModal(course)}
                              >
                                {course.upcomingSessionsCount
                                  ? `${course.upcomingSessionsCount} session${course.upcomingSessionsCount === 1 ? '' : 's'}`
                                  : course.schedule && course.schedule.length > 0
                                    ? `${course.schedule.length} slot${course.schedule.length === 1 ? '' : 's'}`
                                    : '0 sessions'}
                              </Badge>
                              <Link
                                href={withLocalePath(`/tutor/courses/${course.id}/enrollments`)}
                              >
                                <Badge
                                  variant="secondary"
                                  className="cursor-pointer border-border/30 bg-muted/50 text-muted-foreground transition-all duration-200 hover:bg-muted/70"
                                >
                                  {course.enrollmentCount} enrolled
                                </Badge>
                              </Link>
                            </div>
                            {courseClasses.length > 0 ? (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleOpenSessionsModal(course)}
                                className="transition-all duration-200"
                              >
                                <Eye className="mr-1 h-3 w-3" />
                                View Sessions
                              </Button>
                            ) : (
                              <Button
                                variant="default"
                                size="sm"
                                disabled={launchingCourseId === course.id}
                                onClick={() => handleEnterCourseClassroom(course)}
                                className="transition-all duration-200"
                              >
                                {launchingCourseId === course.id ? (
                                  <div className="mr-1 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                ) : (
                                  <Video className="mr-1 h-3 w-3" />
                                )}
                                Create Session
                              </Button>
                            )}
                            <Button asChild variant="outline" size="sm" className="transition-all duration-200 hover:bg-muted/80">
                              <Link
                                href={withLocalePath(
                                  `/tutor/insights?tab=builder&courseId=${course.id}&mode=edit`
                                )}
                              >
                                Edit
                              </Link>
                            </Button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
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

        {/* Course Sessions Modal */}
        <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="text-primary h-5 w-5" />
                Course Sessions
              </DialogTitle>
              <DialogDescription>
                {selectedCourseForCancel && (
                  <>
                    Manage sessions for{' '}
                    <strong>
                      {selectedCourseForCancel.nationality &&
                      selectedCourseForCancel.nationality !== 'Global'
                        ? `${selectedCourseForCancel.name} — ${selectedCourseForCancel.variantCategory || (selectedCourseForCancel.categories || [])[0] || 'General'} — ${selectedCourseForCancel.nationality}`
                        : selectedCourseForCancel.name}
                    </strong>
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4">
              {loadingSessions ? (
                <div className="flex items-center justify-center py-8">
                  <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
                </div>
              ) : sessionLoadError ? (
                <div className="rounded-lg border border-dashed border-destructive/20 p-6 text-center text-sm">
                  <AlertCircle className="text-destructive/50 mx-auto mb-2 h-8 w-8" />
                  <p className="font-medium text-destructive">Failed to load sessions</p>
                  <p className="text-muted-foreground mt-1 text-xs">{sessionLoadError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 transition-all duration-200"
                    onClick={() =>
                      selectedCourseForCancel && handleOpenSessionsModal(selectedCourseForCancel)
                    }
                  >
                    Retry
                  </Button>
                </div>
              ) : courseSessions.length === 0 ? (
                <div className="text-muted-foreground rounded-lg border border-dashed border-border/30 p-6 text-center text-sm">
                  <Calendar className="text-muted-foreground/50 mx-auto mb-2 h-8 w-8" />
                  <p>No sessions found for this course.</p>
                  {selectedCourseForCancel && (
                    <Button
                      size="sm"
                      className="mt-3 transition-all duration-200"
                      disabled={launchingCourseId === selectedCourseForCancel.id}
                      onClick={() => handleEnterCourseClassroom(selectedCourseForCancel)}
                    >
                      {launchingCourseId === selectedCourseForCancel.id ? (
                        <div className="mr-1 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <Video className="mr-1 h-3 w-3" />
                      )}
                      Create session
                    </Button>
                  )}
                </div>
              ) : (
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-3 pr-4">
                    {courseSessions.map(session => {
                      const isVirtual = session.isVirtual === true
                      const _isPassedSession =
                        !isVirtual &&
                        session.scheduledAt &&
                        new Date(session.scheduledAt).getTime() + 2 * 60 * 60 * 1000 < Date.now()
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
                          className="flex items-center justify-between rounded-lg border border-border/30 bg-card/50 p-3 transition-all duration-200 hover:border-border/50 hover:bg-card"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-medium">{session.title}</p>
                              <Badge
                                variant="outline"
                                className={cn('text-[10px] uppercase tracking-wide', badgeClass)}
                              >
                                {displayStatus}
                              </Badge>
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
                                className="text-destructive transition-all duration-200 hover:bg-destructive/10 hover:text-destructive/80"
                              >
                                {cancellingSessionId === session.id ? (
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                ) : (
                                  <Ban className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            {isVirtual ? (
                              <Button
                                variant="default"
                                size="sm"
                                disabled={launchingCourseId === selectedCourseForCancel?.id}
                                onClick={() =>
                                  handleEnterCourseClassroom(
                                    selectedCourseForCancel!,
                                    session.scheduledAt
                                  )
                                }
                                className="transition-all duration-200"
                              >
                                {launchingCourseId === selectedCourseForCancel?.id ? (
                                  <div className="mr-1 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                ) : (
                                  <Video className="mr-1 h-3 w-3" />
                                )}
                                Create Session
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
                </ScrollArea>
              )}
            </div>

            <Separator className="my-4" />

            <DialogFooter className="flex items-center justify-between sm:justify-between">
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <AlertCircle className="h-4 w-4" />
                <span>Cancelling a session will notify enrolled students</span>
              </div>
              <Button
                variant="modal-secondary"
                onClick={() => setCancelModalOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
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
