'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { UserNav } from '@/components/user-nav'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  ArrowLeft,
  Copy,
  BookOpen,
  Plus,
  Search,
  Filter,
  Video,
  Play,
  Clock,
  Users,
  Calendar,
  CalendarDays,
  List,
  Zap,
  ChevronRight,
  MoreVertical,
  Loader2,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { formatClassTime } from '@/lib/format-class-time'
import { cn } from '@/lib/utils'

interface TutorClass {
  id: string
  courseId?: string
  title: string
  subject: string
  scheduledAt: string
  duration: number
  maxStudents: number
  enrolledStudents: number
  status: 'scheduled' | 'live' | 'completed' | 'cancelled' | 'upcoming' | 'active'
}

interface CourseVariant {
  variantId: string
  category: string
  nationality: string
  languageOfInstruction?: string | null
}

interface CourseLesson {
  lessonId: string
  title: string
}

type FilterStatus = 'all' | 'live' | 'upcoming' | 'scheduled' | 'completed'

function copyJoinLink(classId: string) {
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/student/feedback?sessionId=${classId}`
      : ''
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => toast.success('Join link copied to clipboard'))
  }
}

function getTimeRemaining(scheduledAt: string): string {
  const now = new Date()
  const scheduled = new Date(scheduledAt)
  const diffMs = scheduled.getTime() - now.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 0) return 'Started'
  if (diffMins < 60) return `in ${diffMins} min`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `in ${diffHours} hr`
  const diffDays = Math.floor(diffHours / 24)
  return `in ${diffDays} days`
}

export default function TutorClassesPage() {
  const router = useRouter()
  const [classes, setClasses] = useState<TutorClass[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [calendarEvents, setCalendarEvents] = useState<
    Array<{
      id: string
      title: string
      subject: string
      scheduledAt: string
      duration: number
      status: string
      courseName?: string
      nationality?: string
      variantCategory?: string
    }>
  >([])

  // Schedule training modal state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [scheduleForm, setScheduleForm] = useState({
    title: '',
    subject: 'Training',
    duration: 60,
    hour: 9,
    minute: 0,
  })

  // Variant / Lesson selection dialog state
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [selectedCourseForSession, setSelectedCourseForSession] = useState<TutorClass | null>(null)
  const [courseVariants, setCourseVariants] = useState<CourseVariant[]>([])
  const [courseLessons, setCourseLessons] = useState<CourseLesson[]>([])
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [selectedLessonId, setSelectedLessonId] = useState('')
  const [dialogLoading, setDialogLoading] = useState(false)

  useEffect(() => {
    fetch('/api/tutor/classes', { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load sessions')
        return res.json()
      })
      .then(data => {
        setClasses(data.classes ?? [])
        setError(null)
      })
      .catch(() => setError('Failed to load sessions'))
      .finally(() => setLoading(false))
  }, [])

  // Fetch calendar events when month changes
  useEffect(() => {
    const fetchCalendarEvents = async () => {
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth()
      const start = new Date(year, month, 1).toISOString()
      const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

      try {
        const res = await fetch(`/api/tutor/calendar/events?start=${start}&end=${end}`, {
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          setCalendarEvents(data.events || [])
        }
      } catch {
        // Silent fail for calendar
      }
    }
    fetchCalendarEvents()
  }, [currentDate])

  // Categorize classes
  const categorizedClasses = useMemo(() => {
    const now = new Date()

    return classes.reduce(
      (acc, cls) => {
        const scheduled = new Date(cls.scheduledAt)
        const isLive =
          cls.status === 'live' ||
          (scheduled <= now && scheduled.getTime() + cls.duration * 60000 > now.getTime())
        const isPast =
          scheduled.getTime() + cls.duration * 60000 < now.getTime() || cls.status === 'completed'
        const isUpcoming =
          scheduled > now && scheduled.getTime() - now.getTime() < 24 * 60 * 60 * 1000 // Within 24 hours

        if (isLive) {
          acc.live.push(cls)
        } else if (isPast) {
          acc.past.push(cls)
        } else if (isUpcoming) {
          acc.upcoming.push(cls)
        } else {
          acc.scheduled.push(cls)
        }
        return acc
      },
      {
        live: [] as TutorClass[],
        upcoming: [] as TutorClass[],
        scheduled: [] as TutorClass[],
        past: [] as TutorClass[],
      }
    )
  }, [classes])

  // Filter classes based on search and status filter
  const filteredClasses = useMemo(() => {
    let filtered = classes

    if (filterStatus !== 'all') {
      const categoryMap: Record<string, TutorClass[]> = {
        live: categorizedClasses.live,
        upcoming: categorizedClasses.upcoming,
        scheduled: categorizedClasses.scheduled,
        past: categorizedClasses.past,
        completed: categorizedClasses.past,
      }
      filtered = categoryMap[filterStatus] || classes
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        cls => cls.title.toLowerCase().includes(query) || cls.subject.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [classes, filterStatus, categorizedClasses, searchQuery])

  const createLiveSession = async (
    payload: Record<string, unknown>,
    onSuccess?: (data: { room: { id: string } }) => void
  ) => {
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch('/api/class/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const data = await res.json()
        onSuccess?.(data)
        return data
      } else {
        toast.error('Failed to create live session')
      }
    } catch {
      toast.error('Failed to create live session')
    }
    return null
  }

  const handleCreateInstantClass = async () => {
    const data = await createLiveSession({
      title: 'Instant Live Session',
      subject: 'general',
      maxStudents: 50,
      duration: 60,
      scheduledAt: new Date().toISOString(),
    })
    if (data) {
      toast.success('Instant session created!')
      router.push(`/tutor/insights?sessionId=${data.session.sessionId}`)
    }
  }

  const handleGoLive = async (cls: TutorClass) => {
    if (!cls.courseId) {
      // No course association; navigate directly to the existing session
      router.push(`/tutor/insights?sessionId=${cls.id}`)
      return
    }

    setDialogLoading(true)
    setSelectedCourseForSession(cls)

    try {
      const [variantsRes, courseRes] = await Promise.all([
        fetch(`/api/tutor/courses/${cls.courseId}/publish`, { credentials: 'include' }),
        fetch(`/api/tutor/courses/${cls.courseId}`, { credentials: 'include' }),
      ])

      const variantsData = variantsRes.ok ? await variantsRes.json() : { variants: [] }
      const courseData = courseRes.ok ? await courseRes.json() : { course: null }

      const variants: CourseVariant[] = (variantsData.variants || []).map((v: any) => ({
        variantId: v.variantId,
        category: v.category,
        nationality: v.nationality,
        languageOfInstruction: v.languageOfInstruction,
      }))

      const lessons: CourseLesson[] =
        courseData.course?.modules?.[0]?.lessons?.map((l: any) => ({
          lessonId: l.id,
          title: l.title,
        })) || []

      setCourseVariants(variants)
      setCourseLessons(lessons)

      if (variants.length === 1 && lessons.length === 1) {
        // Auto-select and create session immediately
        const data = await createLiveSession({
          title: cls.title,
          subject: cls.subject,
          courseId: cls.courseId,
          variantId: variants[0].variantId,
          lessonId: lessons[0].lessonId,
          maxStudents: cls.maxStudents,
          duration: cls.duration,
          scheduledAt: cls.scheduledAt,
        })
        if (data) {
          router.push(`/tutor/insights?sessionId=${data.session.sessionId}`)
        }
        resetDialog()
      } else {
        // Pre-select first items if available
        setSelectedVariantId(variants[0]?.variantId || '')
        setSelectedLessonId(lessons[0]?.lessonId || '')
        setSessionDialogOpen(true)
      }
    } catch {
      toast.error('Failed to load course details')
      router.push(`/tutor/insights?sessionId=${cls.id}`)
    } finally {
      setDialogLoading(false)
    }
  }

  const confirmSessionStart = async () => {
    if (!selectedCourseForSession) return
    const cls = selectedCourseForSession

    setDialogLoading(true)
    const data = await createLiveSession({
      title: cls.title,
      subject: cls.subject,
      courseId: cls.courseId,
      variantId: selectedVariantId || undefined,
      lessonId: selectedLessonId || undefined,
      maxStudents: cls.maxStudents,
      duration: cls.duration,
      scheduledAt: cls.scheduledAt,
    })
    setDialogLoading(false)

    if (data) {
      setSessionDialogOpen(false)
      resetDialog()
      router.push(`/tutor/insights?sessionId=${data.session.sessionId}`)
    }
  }

  const resetDialog = () => {
    setSelectedCourseForSession(null)
    setCourseVariants([])
    setCourseLessons([])
    setSelectedVariantId('')
    setSelectedLessonId('')
  }

  const handleScheduleTraining = async () => {
    if (!selectedDate || !scheduleForm.title.trim()) return

    const scheduledAt = new Date(selectedDate)
    scheduledAt.setHours(scheduleForm.hour, scheduleForm.minute)

    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch('/api/class/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
        },
        credentials: 'include',
        body: JSON.stringify({
          title: scheduleForm.title,
          subject: scheduleForm.subject,
          maxStudents: 50,
          duration: scheduleForm.duration,
          scheduledAt: scheduledAt.toISOString(),
        }),
      })

      if (res.ok) {
        toast.success('Training session scheduled!')
        setScheduleModalOpen(false)
        // Refresh the page to show the new class
        window.location.reload()
      } else {
        toast.error('Failed to schedule training')
      }
    } catch (error) {
      toast.error('Failed to schedule training')
    }
  }

  const openScheduleModal = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
    setSelectedDate(date)
    setScheduleForm({
      title: '',
      subject: 'Training',
      duration: 60,
      hour: 9,
      minute: 0,
    })
    setScheduleModalOpen(true)
  }

  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDayOfMonth = new Date(year, month, 1)
    const lastDayOfMonth = new Date(year, month + 1, 0)
    const daysInMonth = lastDayOfMonth.getDate()
    const startingDayOfWeek = firstDayOfMonth.getDay()

    const days = []
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }
    return days
  }

  const getEventsForDay = (day: number) => {
    return calendarEvents.filter(event => {
      const eventDate = new Date(event.scheduledAt)
      return (
        eventDate.getDate() === day &&
        eventDate.getMonth() === currentDate.getMonth() &&
        eventDate.getFullYear() === currentDate.getFullYear()
      )
    })
  }

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  const renderClassCard = (
    cls: TutorClass,
    isLive: boolean = false,
    isUpcoming: boolean = false
  ) => {
    const time = formatClassTime(cls.scheduledAt)
    const timeRemaining = getTimeRemaining(cls.scheduledAt)

    return (
      <div
        key={cls.id}
        className={cn(
          'flex items-center justify-between rounded-lg border p-4 transition-colors',
          isLive ? 'border-red-200 bg-red-50' : 'hover:bg-gray-50'
        )}
      >
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-lg',
              isLive ? 'bg-red-100' : isUpcoming ? 'bg-yellow-100' : 'bg-blue-100'
            )}
          >
            {isLive ? (
              <Video className="h-6 w-6 text-red-600" />
            ) : (
              <BookOpen
                className={cn('h-6 w-6', isUpcoming ? 'text-yellow-600' : 'text-blue-600')}
              />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{cls.title}</h3>
              {isLive && <Badge className="animate-pulse bg-red-500 text-white">🔴 LIVE</Badge>}
              {isUpcoming && !isLive && (
                <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                  ⏰ {timeRemaining}
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-500">
              {cls.subject} • {time.formatted}
              {time.relative && !isLive && !isUpcoming && (
                <span className="font-medium text-blue-600"> • {time.relative}</span>
              )}
            </p>
            <p className="text-xs text-gray-400">
              <Users className="mr-1 inline h-3 w-3" />
              {cls.enrolledStudents}/{cls.maxStudents} students
              {cls.duration > 0 && (
                <>
                  <Clock className="mx-1 inline h-3 w-3" />
                  {cls.duration} min
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyJoinLink(cls.id)}
            title="Copy join link"
          >
            <Copy className="h-4 w-4" />
          </Button>
          {isLive ? (
            <Link href={`/tutor/insights?sessionId=${cls.id}`}>
              <Button size="sm" className={cn(isLive && 'bg-red-600 hover:bg-red-700')}>
                <Play className="mr-1 h-4 w-4" /> Enter
              </Button>
            </Link>
          ) : (
            <Button
              size="sm"
              className={cn(isLive && 'bg-red-600 hover:bg-red-700')}
              onClick={() => handleGoLive(cls)}
              disabled={dialogLoading && selectedCourseForSession?.id === cls.id}
            >
              {dialogLoading && selectedCourseForSession?.id === cls.id ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              Go Live
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="safe-top sticky top-0 z-50 border-b bg-white">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex items-center gap-4">
              <Link href="/tutor/dashboard" className="text-xl font-bold text-blue-600">
                Solocorn
              </Link>
              <Button variant="ghost" size="sm" onClick={() => router.push('/tutor/dashboard')}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Dashboard
              </Button>
            </div>
            <div className="flex items-center">
              <UserNav />
            </div>
          </div>
        </div>
      </nav>

      <main className="w-full px-4 py-8 sm:px-6 lg:px-8">
        {/* Title & Quick Actions */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Coming up</h1>
            <p className="text-sm text-gray-500">Your upcoming live sessions</p>
          </div>
          <div className="flex gap-2">{/* Buttons removed as per training page flow */}</div>
        </div>

        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        )}

        <Tabs
          value={viewMode}
          onValueChange={v => setViewMode(v as 'list' | 'calendar')}
          className="space-y-6"
        >
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="list" className="gap-2">
                <List className="h-4 w-4" /> List
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-2">
                <CalendarDays className="h-4 w-4" /> Calendar
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="list" className="space-y-6">
            {/* Search & Filter */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search sessions..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                {(['all', 'live', 'upcoming', 'scheduled', 'completed'] as FilterStatus[]).map(
                  status => (
                    <Button
                      key={status}
                      variant={filterStatus === status ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilterStatus(status)}
                      className="capitalize"
                    >
                      {status === 'live' && categorizedClasses.live.length > 0 && (
                        <span className="mr-1 h-2 w-2 animate-pulse rounded-full bg-red-500" />
                      )}
                      {status === 'completed' ? 'Completed' : status}
                      {status !== 'all' && (
                        <span className="ml-1 text-xs opacity-70">
                          (
                          {categorizedClasses[status === 'completed' ? 'past' : status]?.length ||
                            0}
                          )
                        </span>
                      )}
                    </Button>
                  )
                )}
              </div>
            </div>

            {/* Content */}
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-200" />
                ))}
              </div>
            ) : classes.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <Calendar className="mx-auto mb-3 h-12 w-12 text-gray-400" />
                    <h3 className="mb-1 text-lg font-medium text-gray-900">No sessions yet</h3>
                    <p className="mb-4 text-sm text-gray-500">
                      Create your first session to get started
                    </p>
                    <div className="flex justify-center gap-2">
                      <Button variant="outline" onClick={handleCreateInstantClass}>
                        <Zap className="mr-2 h-4 w-4" /> Start Instant Session
                      </Button>
                      <Link href="/tutor/dashboard?create=1">
                        <Button>
                          <Plus className="mr-2 h-4 w-4" /> Schedule Session
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* LIVE NOW Section */}
                {categorizedClasses.live.length > 0 &&
                  filterStatus !== 'scheduled' &&
                  filterStatus !== 'completed' && (
                    <Card className="border-red-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-red-600">
                          <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
                          🔴 Live Now ({categorizedClasses.live.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {categorizedClasses.live.map(cls => renderClassCard(cls, true))}
                      </CardContent>
                    </Card>
                  )}

                {/* UPCOMING Section */}
                {categorizedClasses.upcoming.length > 0 &&
                  filterStatus !== 'live' &&
                  filterStatus !== 'completed' && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2">
                          <Clock className="h-5 w-5 text-yellow-600" />⏰ Starting Soon (
                          {categorizedClasses.upcoming.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {categorizedClasses.upcoming.map(cls => renderClassCard(cls, false, true))}
                      </CardContent>
                    </Card>
                  )}

                {/* SCHEDULED Section */}
                {(filterStatus === 'all' || filterStatus === 'scheduled') &&
                  categorizedClasses.scheduled.length > 0 && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2">
                          <Calendar className="h-5 w-5 text-blue-600" />
                          📅 Scheduled ({categorizedClasses.scheduled.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {categorizedClasses.scheduled.map(cls => renderClassCard(cls))}
                      </CardContent>
                    </Card>
                  )}

                {/* COMPLETED Section */}
                {(filterStatus === 'all' || filterStatus === 'completed') &&
                  categorizedClasses.past.length > 0 && (
                    <Card className="opacity-75">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-gray-500">
                          <Clock className="h-5 w-5" />
                          Completed ({categorizedClasses.past.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {categorizedClasses.past.map(cls => renderClassCard(cls))}
                      </CardContent>
                    </Card>
                  )}

                {/* Empty State for Filtered Results */}
                {filteredClasses.length === 0 && classes.length > 0 && (
                  <div className="py-12 text-center">
                    <Filter className="mx-auto mb-3 h-12 w-12 text-gray-400" />
                    <p className="text-gray-600">
                      {filterStatus === 'completed'
                        ? 'No completed sessions yet'
                        : 'No sessions match your filter'}
                    </p>
                    <Button
                      variant="outline"
                      className="mt-2"
                      onClick={() => {
                        setFilterStatus('all')
                        setSearchQuery('')
                      }}
                    >
                      Clear Filters
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="calendar" className="space-y-6">
            {/* Calendar Header */}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={prevMonth}>
                ← Prev
              </Button>
              <h2 className="text-lg font-semibold">
                {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h2>
              <Button variant="outline" size="sm" onClick={nextMonth}>
                Next →
              </Button>
            </div>

            {/* Calendar Grid */}
            <Card>
              <CardContent className="p-6">
                <div className="mb-2 grid grid-cols-7 gap-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="py-2 text-center text-sm font-medium text-gray-500">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {getDaysInMonth(currentDate).map((day, index) => {
                    if (day === null) {
                      return <div key={`empty-${index}`} className="h-24" />
                    }
                    const dayEvents = getEventsForDay(day)
                    const isToday =
                      new Date().getDate() === day &&
                      new Date().getMonth() === currentDate.getMonth() &&
                      new Date().getFullYear() === currentDate.getFullYear()
                    return (
                      <div
                        key={day}
                        onClick={() => openScheduleModal(day)}
                        className={cn(
                          'h-24 cursor-pointer overflow-hidden rounded-lg border p-2 transition-colors hover:bg-gray-50',
                          isToday && 'border-blue-300 bg-blue-50'
                        )}
                      >
                        <div className={cn('mb-1 text-sm font-medium', isToday && 'text-blue-600')}>
                          {day}
                        </div>
                        <div className="space-y-1">
                          {dayEvents.slice(0, 2).map(event => (
                            <Link
                              key={event.id}
                              href={`/tutor/insights?sessionId=${event.id}`}
                              className="block truncate rounded bg-blue-100 p-1 text-xs hover:bg-blue-200"
                            >
                              {event.courseName
                                ? `${event.courseName}${event.nationality && event.nationality !== 'Global' ? ` — ${event.variantCategory || ''} — ${event.nationality}` : ''} — `
                                : ''}
                              {event.title}
                            </Link>
                          ))}
                          {dayEvents.length > 2 && (
                            <div className="text-xs text-gray-500">
                              +{dayEvents.length - 2} more
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Upcoming Events List */}
            <Card>
              <CardHeader>
                <CardTitle>Upcoming This Month</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {calendarEvents.length === 0 ? (
                  <p className="py-4 text-center text-gray-500">No sessions scheduled this month</p>
                ) : (
                  calendarEvents.slice(0, 5).map(event => (
                    <div
                      key={event.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <p className="font-medium">
                          {event.courseName
                            ? `${event.courseName}${event.nationality && event.nationality !== 'Global' ? ` — ${event.variantCategory || ''} — ${event.nationality}` : ''} — `
                            : ''}
                          {event.title}
                        </p>
                        <p className="text-sm text-gray-500">
                          {new Date(event.scheduledAt).toLocaleDateString()} • {event.subject}
                        </p>
                      </div>
                      <Link href={`/tutor/insights?sessionId=${event.id}`}>
                        <Button size="sm">
                          <Play className="mr-1 h-3 w-3" /> Go Live
                        </Button>
                      </Link>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Schedule Training Modal */}
        <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Schedule Training Session</DialogTitle>
              <DialogDescription>
                {selectedDate && (
                  <>
                    Schedule a training session for{' '}
                    <strong>
                      {selectedDate.toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </strong>
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Session Title</Label>
                <Input
                  placeholder="e.g., Advanced Calculus Training"
                  value={scheduleForm.title}
                  onChange={e => setScheduleForm(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Select
                    value={scheduleForm.subject}
                    onValueChange={v => setScheduleForm(prev => ({ ...prev, subject: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Training">Training</SelectItem>
                      <SelectItem value="Mathematics">Mathematics</SelectItem>
                      <SelectItem value="Physics">Physics</SelectItem>
                      <SelectItem value="Chemistry">Chemistry</SelectItem>
                      <SelectItem value="Biology">Biology</SelectItem>
                      <SelectItem value="English">English</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Select
                    value={String(scheduleForm.duration)}
                    onValueChange={v => setScheduleForm(prev => ({ ...prev, duration: Number(v) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="45">45 min</SelectItem>
                      <SelectItem value="60">60 min</SelectItem>
                      <SelectItem value="90">90 min</SelectItem>
                      <SelectItem value="120">120 min</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(scheduleForm.hour)}
                    onValueChange={v => setScheduleForm(prev => ({ ...prev, hour: Number(v) }))}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {i.toString().padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-lg">:</span>
                  <Select
                    value={String(scheduleForm.minute)}
                    onValueChange={v => setScheduleForm(prev => ({ ...prev, minute: Number(v) }))}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">00</SelectItem>
                      <SelectItem value="15">15</SelectItem>
                      <SelectItem value="30">30</SelectItem>
                      <SelectItem value="45">45</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setScheduleModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleScheduleTraining} disabled={!scheduleForm.title.trim()}>
                Schedule Session
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Variant / Lesson Selection Dialog */}
        <Dialog
          open={sessionDialogOpen}
          onOpenChange={open => {
            if (!open) {
              setSessionDialogOpen(false)
              resetDialog()
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Start Live Session</DialogTitle>
              <DialogDescription>
                Select a variant and lesson for <strong>{selectedCourseForSession?.title}</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Variant</Label>
                <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select variant" />
                  </SelectTrigger>
                  <SelectContent>
                    {courseVariants.map(v => (
                      <SelectItem key={v.variantId} value={v.variantId}>
                        {v.category} - {v.nationality}
                      </SelectItem>
                    ))}
                    {courseVariants.length === 0 && (
                      <SelectItem value="none" disabled>
                        No variants available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Lesson</Label>
                <Select value={selectedLessonId} onValueChange={setSelectedLessonId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select lesson" />
                  </SelectTrigger>
                  <SelectContent>
                    {courseLessons.map(l => (
                      <SelectItem key={l.lessonId} value={l.lessonId}>
                        {l.title}
                      </SelectItem>
                    ))}
                    {courseLessons.length === 0 && (
                      <SelectItem value="none" disabled>
                        No lessons available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setSessionDialogOpen(false)
                  resetDialog()
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmSessionStart}
                disabled={
                  dialogLoading ||
                  (courseVariants.length > 0 && !selectedVariantId) ||
                  (courseLessons.length > 0 && !selectedLessonId)
                }
              >
                {dialogLoading ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-1 h-4 w-4" />
                )}
                Start Session
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
