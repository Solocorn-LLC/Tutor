'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogPanel,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DEFAULT_LOCALE } from '@/lib/i18n/config'
import {
  FileText,
  Star,
  UserCheck,
  UserPlus,
  CheckCircle,
  Copy,
  Share2,
  LayoutGrid,
  List,
  PanelsTopLeft,
  CalendarDays,
  Calendar,
  Clock,
  DollarSign,
  Loader2,
  Video,
  Search,
  ExternalLink,
  User,
  BookOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { format, parseISO, addDays, startOfWeek, isSameDay } from 'date-fns'

interface PublicTutorResponse {
  tutor: {
    id: string
    name: string
    username: string
    bio: string
    avatarUrl: string | null
    specialties: string[]
    credentials: string
    hourlyRate: number | null
    tutorSince?: string | null
    country?: string | null
    activeCourses?: number | null
    socialLinks?: {
      tiktok?: string | null
      youtube?: string | null
      instagram?: string | null
      facebook?: string | null
    } | null
  }
  courses: Array<{
    id: string
    name: string
    description?: string | null
    categories: string[]
    estimatedHours?: number | null
    enrollmentCount: number
    lessonCount: number
    price?: number | null
    isFree?: boolean
    currency?: string | null
    scheduleSummary?: string | null
    country?: string | null
    schedule?: any[]
    liveSessionsTotal?: number
    liveSessionsCompleted?: number
    enrollmentStatus?: 'ongoing' | 'ended'
  }>
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function StarRating({
  rating,
  count,
  className,
}: {
  rating: number | null
  count?: number
  className?: string
}) {
  if (rating === null) return null
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
      <span className="font-medium text-inherit">{rating.toFixed(1)}</span>
      {count !== undefined && count > 0 && <span className="text-sm opacity-70">({count})</span>}
    </div>
  )
}

interface TimeSlot {
  date: string
  startTime: string
  endTime: string
  dayOfWeek: number
  timezone: string
}

interface AvailabilityData {
  available: boolean
  hourlyRate: number
  pricingIncomplete?: boolean
  reason?: string
  currency: string
  timezone: string
  slots: TimeSlot[]
}

// Book 1 on 1 Dialog Component
function Book1on1Dialog({
  open,
  onOpenChange,
  tutor,
  username,
  locale,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tutor: PublicTutorResponse['tutor']
  username: string
  locale: string
}) {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [availability, setAvailability] = useState<AvailabilityData | null>(null)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [hasPendingRequest, setHasPendingRequest] = useState(false)
  const [activeRequest, setActiveRequest] = useState<{ id: string; status: string } | null>(null)

  useEffect(() => {
    if (open && tutor.id) {
      loadAvailability()
      checkExistingRequest()
    }
  }, [open, tutor.id])

  const loadAvailability = async () => {
    setLoading(true)
    setAvailabilityError(null)
    setAvailability(null)
    try {
      const start = new Date().toISOString()
      const end = addDays(new Date(), 21).toISOString() // 3 weeks
      const res = await fetch(
        `/api/public/tutors/${encodeURIComponent(username)}/availability?start=${start}&end=${end}`
      )
      if (res.ok) {
        const data = await res.json()
        setAvailability(data)
        if (data.pricingIncomplete) {
          setAvailabilityError('Pricing not set')
        }
      } else {
        const error = await res.json().catch(() => ({}))
        setAvailabilityError(error.error || 'Failed to load availability')
        toast.error(error.error || 'Failed to load availability')
      }
    } catch {
      setAvailabilityError('Failed to load availability')
      toast.error('Failed to load availability')
    } finally {
      setLoading(false)
    }
  }

  const checkExistingRequest = async () => {
    if (!session?.user) return
    try {
      const res = await fetch(`/api/one-on-one/status?tutorId=${encodeURIComponent(tutor.id)}`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setHasPendingRequest(data.hasActiveRequest)
        setActiveRequest(data.request)
      }
    } catch {
      // ignore
    }
  }

  const handleSubmit = async () => {
    if (!selectedSlot || !session?.user) {
      toast.error('Please select a time slot')
      return
    }

    setSubmitting(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch('/api/one-on-one/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          tutorId: tutor.id,
          proposedSlots: [
            {
              date: selectedSlot.date,
              startTime: selectedSlot.startTime,
              endTime: selectedSlot.endTime,
            },
          ],
          duration: 60,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        toast.success('Booking request sent! The tutor will review and confirm.')
        setHasPendingRequest(true)
        setActiveRequest({ id: data.request.id, status: data.request.status })
        onOpenChange(false)
      } else if (res.status === 409) {
        toast.info('You already have a pending request with this tutor')
        setHasPendingRequest(true)
        if (data.existingRequestId) {
          setActiveRequest({ id: data.existingRequestId, status: data.status })
        }
      } else {
        toast.error(data.error || 'Failed to send request')
      }
    } catch {
      toast.error('Failed to send request')
    } finally {
      setSubmitting(false)
    }
  }

  // Group slots by date
  const slotsByDate = useMemo(() => {
    if (!availability?.slots) return {}
    const grouped: Record<string, TimeSlot[]> = {}
    availability.slots.forEach(slot => {
      if (!grouped[slot.date]) grouped[slot.date] = []
      grouped[slot.date].push(slot)
    })
    return grouped
  }, [availability])

  const dates = useMemo(() => Object.keys(slotsByDate).sort(), [slotsByDate])

  if (!session?.user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Book 1 on 1 Session</DialogTitle>
            <DialogDescription>Please log in to book a session with {tutor.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-6 pt-0">
            <DialogPanel className="py-8 text-center">
              <Button variant="modal-primary" asChild className="h-10">
                <Link href={`/${locale}/login`}>Log In</Link>
              </Button>
            </DialogPanel>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (hasPendingRequest && activeRequest) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Booking Request Pending</DialogTitle>
            <DialogDescription>
              You already have a pending booking request with {tutor.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-6 pt-0">
            <DialogPanel>
              <p className="font-medium text-gray-900">Status: {activeRequest.status}</p>
              <p className="mt-2 text-sm text-gray-600">
                Please wait for the tutor to respond. You will receive a notification once they
                accept or reject your request.
              </p>
            </DialogPanel>
          </div>
          <DialogFooter className="gap-3">
            <Button variant="modal-secondary" onClick={() => onOpenChange(false)} className="h-10">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Book 1 on 1 Session with {tutor.name}
          </DialogTitle>
          <DialogDescription>
            Select an available time slot for your one-hour session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-auto p-6 pt-0">
          {loading ? (
            <DialogPanel>
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            </DialogPanel>
          ) : availabilityError ? (
            <DialogPanel className="py-6 text-center">
              {availabilityError === 'Pricing not set' ? (
                <div className="space-y-2">
                  <p className="font-medium text-gray-900">
                    This tutor is available for one-on-one sessions but has not set a price yet.
                  </p>
                  <p className="text-sm text-gray-600">
                    Please check back later or contact the tutor directly.
                  </p>
                </div>
              ) : (
                <p className="text-gray-600">
                  {availability?.reason === 'disabled'
                    ? 'This tutor is not currently offering one-on-one sessions.'
                    : availabilityError}
                </p>
              )}
            </DialogPanel>
          ) : (
            <>
              {/* Price info */}
              <DialogPanel className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-gray-900">
                  {availability?.currency} {availability?.hourlyRate} per session (1 hour)
                </span>
              </DialogPanel>

              {/* Timezone info */}
              <DialogPanel className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4" />
                <span>Times shown in: {availability?.timezone}</span>
              </DialogPanel>

              {/* Calendar slots */}
              <DialogPanel>
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-4 pr-4">
                    {dates.length === 0 ? (
                      <div className="py-6 text-center text-gray-600">
                        No available slots in the next 3 weeks.
                      </div>
                    ) : (
                      dates.map(date => {
                        const dateObj = parseISO(date)
                        const daySlots = slotsByDate[date]
                        return (
                          <div key={date} className="space-y-2">
                            <h4 className="flex items-center gap-2 font-medium text-gray-900">
                              <Calendar className="h-4 w-4 text-blue-500" />
                              {format(dateObj, 'EEEE, MMMM d, yyyy')}
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {daySlots.map((slot, idx) => (
                                <Button
                                  key={`${slot.date}-${slot.startTime}-${idx}`}
                                  variant={
                                    selectedSlot?.date === slot.date &&
                                    selectedSlot?.startTime === slot.startTime
                                      ? 'default'
                                      : 'outline'
                                  }
                                  size="sm"
                                  onClick={() => setSelectedSlot(slot)}
                                >
                                  {slot.startTime} - {slot.endTime}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </ScrollArea>
              </DialogPanel>

              {selectedSlot && (
                <DialogPanel>
                  <p className="font-medium text-gray-900">Selected:</p>
                  <p className="text-sm text-gray-600">
                    {format(parseISO(selectedSlot.date), 'EEEE, MMMM d, yyyy')} at{' '}
                    {selectedSlot.startTime} - {selectedSlot.endTime}
                  </p>
                </DialogPanel>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-3">
          <Button variant="modal-secondary" onClick={() => onOpenChange(false)} className="h-10">
            Cancel
          </Button>
          <Button
            variant="modal-primary"
            onClick={handleSubmit}
            disabled={!selectedSlot || submitting || loading}
            className="h-10"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              'Confirm Booking Request'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function PublicTutorPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const locale = typeof params?.locale === 'string' ? params.locale : 'en'
  const username = typeof params?.username === 'string' ? params.username : ''
  const normalizedUsername = useMemo(() => username.trim().replace(/^@+/, ''), [username])
  const publicPath = useMemo(() => {
    if (!normalizedUsername) return ''
    const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`
    return `${prefix}/u/${normalizedUsername}`
  }, [locale, normalizedUsername])
  const publicUrl = useMemo(
    () =>
      typeof window !== 'undefined' && publicPath
        ? `${window.location.origin}${publicPath}`
        : publicPath,
    [publicPath]
  )

  const canShare =
    typeof navigator !== 'undefined' &&
    typeof (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share ===
      'function'

  const handleCopyPublicUrl = async () => {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      toast.success('Public URL copied')
    } catch {
      toast.error('Unable to copy public URL')
    }
  }

  const handleSharePublicUrl = async () => {
    if (!publicUrl || !normalizedUsername || !canShare) return
    try {
      await (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share?.({
        title: `Tutor profile @${normalizedUsername}`,
        url: publicUrl,
      })
    } catch {
      // ignore share cancel
    }
  }

  const stripAt = (value: unknown): string => {
    if (typeof value !== 'string') return ''
    return value.replace(/^@+/, '').trim()
  }

  const [data, setData] = useState<PublicTutorResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [launchingCourseId, setLaunchingCourseId] = useState<string | null>(null)
  const [studentJoiningCourseId, setStudentJoiningCourseId] = useState<string | null>(null)
  const [followState, setFollowState] = useState({
    isFollowing: false,
    followerCount: 0,
    loading: true,
  })
  const [catalogLayout, setCatalogLayout] = useState<'grid' | 'list' | 'compact'>('compact')
  const [courseSearchQuery, setCourseSearchQuery] = useState('')
  const [courseCountryFilter, setCourseCountryFilter] = useState('global')
  const [courseSortOrder, setCourseSortOrder] = useState<'newest' | 'price_asc' | 'price_desc'>(
    'newest'
  )
  const searchParams = useSearchParams()
  const [bookDialogOpen, setBookDialogOpen] = useState(() => searchParams.get('book') === '1')
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<Set<string>>(new Set())
  const [enrollingCourseId, setEnrollingCourseId] = useState<string | null>(null)
  const [scheduleCourse, setScheduleCourse] = useState<
    PublicTutorResponse['courses'][number] | null
  >(null)
  const [detailsCourse, setDetailsCourse] = useState<PublicTutorResponse['courses'][number] | null>(
    null
  )
  const [classroomPickerCourse, setClassroomPickerCourse] = useState<
    PublicTutorResponse['courses'][number] | null
  >(null)
  const [classroomPickerSessions, setClassroomPickerSessions] = useState<
    Array<{
      id?: string
      sessionId?: string
      courseId?: string | null
      status?: string
      scheduledAt?: string | Date | null
    }>
  >([])

  useEffect(() => {
    loadTutorData()
  }, [username])

  useEffect(() => {
    if (!data?.tutor?.id) return
    loadFollowState(data.tutor.id)
  }, [data?.tutor?.id])

  const courseCountryOptions = useMemo(() => {
    if (!data?.courses) return []
    const countries = new Set<string>()
    data.courses.forEach(c => {
      if (c.country && typeof c.country === 'string' && c.country.trim()) {
        countries.add(c.country.trim())
      }
    })
    return Array.from(countries).sort()
  }, [data?.courses])

  useEffect(() => {
    if (session?.user?.role === 'STUDENT') {
      loadStudentEnrollments()
    }
  }, [session?.user?.role])

  const loadStudentEnrollments = async () => {
    try {
      const res = await fetch('/api/student/enrollments', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        const ids = new Set<string>((data.enrollments || []).map((e: any) => e.courseId))
        setEnrolledCourseIds(ids)
      }
    } catch {
      // ignore
    }
  }

  const loadTutorData = async () => {
    setLoading(true)
    try {
      const normalized = username.replace(/^@+/, '').toLowerCase()
      const res = await fetch(`/api/public/tutors/${encodeURIComponent(normalized)}`, {
        cache: 'no-store',
      })

      if (!res.ok) throw new Error('Not found')

      const tutorData = await res.json()

      // Use real database data
      setData({
        ...tutorData,
        courses: tutorData.courses.map((course: any) => ({
          ...course,
          rating: course.rating || null,
          reviewCount: course.reviewCount || 0,
          price: course.price || 0,
        })),
      })
    } catch {
      // Handle error
    } finally {
      setLoading(false)
    }
  }

  const loadFollowState = async (tutorId: string) => {
    setFollowState(prev => ({ ...prev, loading: true }))
    try {
      const res = await fetch(`/api/follows?tutorId=${encodeURIComponent(tutorId)}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        setFollowState(prev => ({ ...prev, loading: false }))
        return
      }
      const followData = await res.json()
      setFollowState({
        isFollowing: Boolean(followData?.isFollowing),
        followerCount: Number(followData?.followerCount ?? 0),
        loading: false,
      })
    } catch {
      setFollowState(prev => ({ ...prev, loading: false }))
    }
  }

  const toggleFollow = async () => {
    if (!data?.tutor?.id || followState.loading) return

    setFollowState(prev => ({ ...prev, loading: true }))
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch('/api/follows', {
        method: followState.isFollowing ? 'DELETE' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ tutorId: data.tutor.id }),
      })

      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 401) {
          toast.info('Please log in to follow tutors')
        } else {
          toast.error(result?.error || 'Unable to update follow status')
        }
        setFollowState(prev => ({ ...prev, loading: false }))
        return
      }

      setFollowState({
        isFollowing: Boolean(result?.isFollowing),
        followerCount: Number(result?.followerCount ?? followState.followerCount),
        loading: false,
      })
      toast.success(result?.isFollowing ? 'You are now following this tutor' : 'Unfollowed tutor')
    } catch {
      toast.error('Unable to update follow status')
      setFollowState(prev => ({ ...prev, loading: false }))
    }
  }

  const filteredCourses = useMemo(() => {
    let result = data?.courses ?? []

    if (courseSearchQuery) {
      const q = courseSearchQuery.toLowerCase()
      result = result.filter(
        c =>
          c.name?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.categories?.some((cat: string) => cat.toLowerCase().includes(q))
      )
    }

    if (courseCountryFilter !== 'global') {
      result = result.filter(c => c.country === courseCountryFilter)
    }

    if (courseSortOrder === 'price_asc') {
      result = [...result].sort((a, b) => (a.price || 0) - (b.price || 0))
    } else if (courseSortOrder === 'price_desc') {
      result = [...result].sort((a, b) => (b.price || 0) - (a.price || 0))
    }

    return result
  }, [data?.courses, courseSearchQuery, courseCountryFilter, courseSortOrder])

  const sortedClassroomPickerSessions = useMemo(() => {
    const now = Date.now()
    const sessions = [...classroomPickerSessions]
    sessions.sort((a, b) => {
      const aStart = new Date(a.scheduledAt ?? 0).getTime()
      const bStart = new Date(b.scheduledAt ?? 0).getTime()
      const aOngoing = a.status === 'active' && aStart <= now
      const bOngoing = b.status === 'active' && bStart <= now
      if (aOngoing !== bOngoing) return aOngoing ? -1 : 1
      const aUpcoming = aStart >= now
      const bUpcoming = bStart >= now
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1
      if (aUpcoming && bUpcoming) return aStart - bStart
      return bStart - aStart
    })
    return sessions
  }, [classroomPickerSessions])

  if (loading) {
    return (
      <div className="w-full p-4 sm:p-6">
        <Card className="animate-pulse">
          <CardHeader>
            <div className="bg-muted h-8 w-1/3 rounded" />
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="w-full p-4 sm:p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <h2 className="text-xl font-bold">Tutor not found</h2>
            <Button asChild className="mt-4">
              <Link href={`/${locale}/tutors`}>Browse Tutors</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const tutor = data?.tutor
  const isTutorOwner = session?.user?.role === 'TUTOR' && session?.user?.id === tutor?.id

  const handleEnterClassroom = async (course: PublicTutorResponse['courses'][number]) => {
    if (!isTutorOwner) return
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
          subject: course.categories[0] || 'general',
          description: course.description || undefined,
          maxStudents: 50,
          durationMinutes: 60,
        }),
      })

      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 401) {
          toast.info('Please log in as the course tutor to enter the classroom')
        } else {
          toast.error(result?.error || 'Unable to launch classroom')
        }
        return
      }

      const sessionId = result?.room?.id || result?.session?.roomId || result?.session?.id
      if (!sessionId) {
        toast.error('Classroom created but no session ID returned')
        return
      }
      router.push(`/${locale}/tutor/insights?sessionId=${sessionId}&courseId=${course.id}`)
    } catch {
      toast.error('Unable to launch classroom')
    } finally {
      setLaunchingCourseId(null)
    }
  }

  const handleStudentEnterClassroom = async (course: PublicTutorResponse['courses'][number]) => {
    if (isTutorOwner) return
    if (!session?.user || session.user.role !== 'STUDENT') {
      toast.info('Please log in as a student to join classrooms')
      return
    }
    if (studentJoiningCourseId) return

    setStudentJoiningCourseId(course.id)
    try {
      if (!enrolledCourseIds.has(course.id)) {
        toast.info('Please enroll in the course first.')
        router.push(`/${locale}/courses/${course.id}`)
        return
      }

      const roomsRes = await fetch(
        `/api/class/rooms?courseId=${encodeURIComponent(course.id)}&includeScheduled=1`,
        { credentials: 'include' }
      )
      const roomsData = await roomsRes.json().catch(() => ({}))
      const sessions = (roomsData?.sessions ?? []) as Array<{
        id?: string
        sessionId?: string
        courseId?: string | null
        status?: string
        scheduledAt?: string | Date | null
      }>

      const matching = sessions.filter(s => s.courseId === course.id && (s.id || s.sessionId))

      if (matching.length === 0) {
        toast.info('No upcoming sessions are scheduled yet.')
        return
      }

      setClassroomPickerCourse(course)
      setClassroomPickerSessions(matching)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to join classroom')
    } finally {
      setStudentJoiningCourseId(null)
    }
  }

  const handleEnrollClick = (course: PublicTutorResponse['courses'][number]) => {
    if (!session?.user) {
      toast.info('Please log in to enroll')
      router.push(`/${locale}/login`)
      return
    }
    const subject = course.categories?.[0] || 'general'
    router.push(
      `/${locale}/student/subjects/${encodeURIComponent(subject)}/courses/${encodeURIComponent(course.id)}`
    )
  }

  const hasSocialLinks = Boolean(
    tutor.socialLinks?.tiktok ||
      tutor.socialLinks?.youtube ||
      tutor.socialLinks?.instagram ||
      tutor.socialLinks?.facebook
  )

  const headerCardClass =
    'group relative overflow-hidden rounded-[20px] p-[1px] shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(0,0,0,0.10)]'
  const headerInnerClass =
    'rounded-[20px] bg-[linear-gradient(135deg,#0B3A9B_0%,#1D4ED8_35%,#0A2F78_100%)] px-8 py-6 text-white'
  const panelCardClass =
    'group rounded-[18px] bg-white p-6 shadow-[0_6px_20px_rgba(0,0,0,0.06)] transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(0,0,0,0.08)]'

  return (
    <div className="min-h-screen w-full bg-white p-4 sm:p-6">
      <div className="mx-auto w-full max-w-7xl">
        <section className={headerCardClass}>
          <div className={headerInnerClass}>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-5">
                <Avatar className="h-24 w-24 rounded-2xl border border-white/40 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                  <AvatarImage src={tutor.avatarUrl || undefined} alt="Tutor avatar" />
                  <AvatarFallback className="rounded-2xl bg-white/15 text-lg font-semibold text-white">
                    {tutor.name ? tutor.name.slice(0, 2).toUpperCase() : 'TU'}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="truncate text-3xl font-bold leading-tight">{tutor.name || '@'}</h1>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-semibold text-emerald-50 ring-1 ring-emerald-300/30">
                      <CheckCircle className="h-4 w-4" />
                      Verified
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-white/80">Solocorn Tutor</div>

                  <div className="mt-4 flex flex-wrap items-center gap-6 rounded-full bg-white/10 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <CalendarDays className="h-4 w-4 text-white/70" />
                      <div className="leading-tight">
                        <div className="text-xs font-semibold text-white/70">Tutor Since</div>
                        <div className="text-sm font-semibold">
                          {tutor.tutorSince ? new Date(tutor.tutorSince).toLocaleDateString() : '—'}
                        </div>
                      </div>
                    </div>
                    <div className="hidden h-8 w-px bg-white/15 lg:block" />
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-4 w-4 text-white/70" />
                      <div className="leading-tight">
                        <div className="text-xs font-semibold text-white/70">Active Courses</div>
                        <div className="text-sm font-semibold">
                          {typeof tutor.activeCourses === 'number'
                            ? tutor.activeCourses
                            : (data?.courses?.length ?? 0)}
                        </div>
                      </div>
                    </div>
                    <div className="hidden h-8 w-px bg-white/15 lg:block" />
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-white/70" />
                      <div className="leading-tight">
                        <div className="text-xs font-semibold text-white/70">Country</div>
                        <div className="text-sm font-semibold">{tutor.country || '—'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white/10 p-4 lg:w-auto">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    size="lg"
                    className="w-full bg-white text-[#0B3A9B] hover:bg-white/90 sm:w-auto"
                    onClick={() => setBookDialogOpen(true)}
                  >
                    <Video className="mr-2 h-4 w-4" />
                    Book 1 on 1
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full border-white/50 bg-transparent text-white hover:bg-white/10 sm:w-auto"
                    onClick={() => void toggleFollow()}
                    disabled={followState.loading}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    {followState.isFollowing ? 'Following' : 'Follow'}
                  </Button>
                </div>
                <div className="flex items-start gap-3 text-sm text-white/85">
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                    <Star className="h-4 w-4 text-white/80" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold">Let&apos;s learn and achieve your goals together.</div>
                    <div className="text-white/70">Book a session or follow to stay updated.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className={panelCardClass}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                <User className="h-4 w-4 text-slate-700" />
              </div>
              <div className="text-lg font-semibold text-slate-900">About Me</div>
            </div>

            <div className="mt-4 space-y-4 text-sm text-slate-700">
              {tutor.bio?.trim() ? (
                <p className="whitespace-pre-wrap leading-relaxed">{tutor.bio}</p>
              ) : (
                <>
                  <div className="font-semibold text-slate-900">
                    Hi, I&apos;m {tutor.name?.split(' ')?.[0] || 'your tutor'}.
                  </div>
                  <ul className="space-y-2 leading-relaxed">
                    <li>
                      <span className="font-semibold text-slate-900">What I teach:</span> Core
                      concepts + exam strategies for your target subjects.
                    </li>
                    <li>
                      <span className="font-semibold text-slate-900">Who I help:</span> Students who
                      want clarity, confidence, and measurable progress.
                    </li>
                    <li>
                      <span className="font-semibold text-slate-900">How I teach:</span> Clear
                      explanations, practice-first sessions, and feedback you can act on.
                    </li>
                  </ul>
                </>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className={panelCardClass}>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                  <ExternalLink className="h-4 w-4 text-slate-700" />
                </div>
                <div className="text-lg font-semibold text-slate-900">My Public Page</div>
              </div>

              {publicUrl ? (
                <div className="mt-4">
                  <div className="break-all text-lg font-semibold text-slate-900">{publicUrl}</div>
                  <div className="mt-1 text-sm font-semibold text-[#F17623]">@{tutor.username}</div>
                  <div className="mt-4 flex items-center gap-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-[#1D4ED8]"
                      onClick={() => void handleCopyPublicUrl()}
                      disabled={!publicUrl}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy link
                    </Button>
                    {canShare ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-[#1D4ED8]"
                        onClick={() => void handleSharePublicUrl()}
                      >
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  Add a username below to generate your public link.
                </div>
              )}
            </div>

            <div className={panelCardClass}>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                  <LayoutGrid className="h-4 w-4 text-slate-700" />
                </div>
                <div className="text-lg font-semibold text-slate-900">Social Media Accounts</div>
              </div>

              <div className="mt-4">
                {hasSocialLinks ? (
                  <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                    {tutor.socialLinks?.tiktok ? (
                      <div>
                        <span className="font-semibold text-slate-900">TikTok:</span>{' '}
                        @{stripAt(tutor.socialLinks.tiktok)}
                      </div>
                    ) : null}
                    {tutor.socialLinks?.youtube ? (
                      <div>
                        <span className="font-semibold text-slate-900">YouTube:</span>{' '}
                        @{stripAt(tutor.socialLinks.youtube)}
                      </div>
                    ) : null}
                    {tutor.socialLinks?.instagram ? (
                      <div>
                        <span className="font-semibold text-slate-900">Instagram:</span>{' '}
                        @{stripAt(tutor.socialLinks.instagram)}
                      </div>
                    ) : null}
                    {tutor.socialLinks?.facebook ? (
                      <div>
                        <span className="font-semibold text-slate-900">Facebook:</span>{' '}
                        @{stripAt(tutor.socialLinks.facebook)}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">No accounts linked</div>
                )}
              </div>
            </div>

            <div className={panelCardClass}>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                  <PanelsTopLeft className="h-4 w-4 text-slate-700" />
                </div>
                <div className="text-lg font-semibold text-slate-900">Categories</div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {tutor.specialties.length > 0 ? (
                  tutor.specialties.map((s, i) => (
                    <span
                      key={`${s}-${i}`}
                      className="rounded-full bg-slate-100 px-4 py-1.5 text-sm font-semibold text-slate-800 shadow-sm"
                    >
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">General tutoring</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={cn(panelCardClass, 'mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
              <UserCheck className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Verified Tutor</div>
              <div className="text-sm text-slate-600">This tutor has been verified by Solocorn.</div>
            </div>
          </div>
          <a
            href="https://solocorn.co/verification"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-[#1D4ED8] hover:underline"
          >
            Learn more about verification
          </a>
        </div>
      </div>

      <div className={cn(panelCardClass, 'mt-8 overflow-hidden p-0')}>
        <div className="space-y-4 p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Course Catalog</h2>
              <p className="mt-1 text-slate-500">Published courses by @{tutor.username}</p>
            </div>

            <div className="flex flex-1 flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:justify-end">
              <div className="relative flex w-full max-w-lg items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="search"
                    placeholder="Search course..."
                    className="h-10 w-full border-slate-200 bg-slate-50/50 pl-9"
                    value={courseSearchQuery}
                    onChange={e => setCourseSearchQuery(e.target.value)}
                  />
                </div>
                <Select
                  value={courseCountryFilter}
                  onValueChange={(val: any) => setCourseCountryFilter(val)}
                >
                  <SelectTrigger className="h-10 w-[120px] border-slate-200 bg-slate-50/50">
                    <SelectValue placeholder="Country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global</SelectItem>
                    {courseCountryOptions.map(country => (
                      <SelectItem key={country} value={country}>
                        {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={courseSortOrder}
                  onValueChange={(val: any) => setCourseSortOrder(val)}
                >
                  <SelectTrigger className="h-10 w-[140px] border-slate-200 bg-slate-50/50">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="price_asc">Price: Low to High</SelectItem>
                    <SelectItem value="price_desc">Price: High to Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div
                className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-1 shadow-sm"
                role="group"
                aria-label="Course layout"
              >
                <Button
                  type="button"
                  variant={catalogLayout === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  className={cn('h-8 gap-1 px-3', catalogLayout === 'grid' && 'bg-white shadow-sm')}
                  onClick={() => setCatalogLayout('grid')}
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline">Grid</span>
                </Button>
                <Button
                  type="button"
                  variant={catalogLayout === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  className={cn('h-8 gap-1 px-3', catalogLayout === 'list' && 'bg-white shadow-sm')}
                  onClick={() => setCatalogLayout('list')}
                >
                  <List className="h-4 w-4" />
                  <span className="hidden sm:inline">List</span>
                </Button>
                <Button
                  type="button"
                  variant={catalogLayout === 'compact' ? 'default' : 'ghost'}
                  size="sm"
                  className={cn(
                    'h-8 gap-1 px-3',
                    catalogLayout === 'compact' && 'bg-white shadow-sm'
                  )}
                  onClick={() => setCatalogLayout('compact')}
                >
                  <PanelsTopLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Compact</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="px-6 pb-8 sm:px-8">
          {filteredCourses.length === 0 ? (
            <div className="rounded-[14px] border border-[rgba(0,0,0,0.04)] bg-slate-50/50 py-12 text-center">
              <BookOpen className="mx-auto mb-3 h-12 w-12 text-slate-300" />
              <p className="text-sm text-slate-500">No published courses found.</p>
            </div>
          ) : (
            <div
              className={cn(
                catalogLayout === 'grid' &&
                  'grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:aspect-square',
                catalogLayout === 'compact' &&
                  'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 [&>*]:aspect-square',
                catalogLayout === 'list' && 'flex flex-col gap-4'
              )}
            >
              {filteredCourses.map(
                (
                  course: PublicTutorResponse['courses'][number] & {
                    rating?: number | null
                    reviewCount?: number
                  }
                ) => {
                  const scheduleText = course.scheduleSummary?.trim() || 'Schedule to be announced'
                  const enrollmentStatus = course.enrollmentStatus ?? 'ongoing'
                  const liveTotal = course.liveSessionsTotal ?? 0
                  const liveDone = course.liveSessionsCompleted ?? 0
                  const liveLine =
                    liveTotal > 0
                      ? `${liveDone} of ${liveTotal} live sessions completed`
                      : liveDone > 0
                        ? `${liveDone} live session(s) completed`
                        : 'No live sessions on record yet'
                  const desc =
                    course.description?.trim() || 'No description provided for this course yet.'
                  const isList = catalogLayout === 'list'
                  const isCompact = catalogLayout === 'compact'

                  return (
                    <div
                      key={course.id}
                      className={cn(
                        'group relative flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] text-left transition-all duration-300',
                        'border border-[rgba(255,255,255,0.08)]',
                        'bg-[rgba(30,40,50,0.65)] backdrop-blur-[12px]',
                        'shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_25px_rgba(0,0,0,0.30)]',
                        'hover:-translate-y-[2px] hover:brightness-105',
                        'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_14px_30px_rgba(0,0,0,0.40)]',
                        isList &&
                          'aspect-auto min-h-0 flex-row items-stretch sm:min-h-[148px] [&>*]:first:shrink-0',
                        isCompact && 'text-xs'
                      )}
                      style={{
                        backgroundImage:
                          'linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.00) 65%), linear-gradient(145deg, rgba(55, 65, 75, 0.85), rgba(25, 35, 45, 0.95))',
                      }}
                    >
                      <div
                        className={cn(
                          'flex flex-1 p-4',
                          isList && 'min-w-0 flex-col pr-3 sm:flex-row sm:items-center sm:gap-6',
                          isCompact && 'p-3'
                        )}
                      >
                        <div
                          className={cn('flex min-w-0 flex-col', isList ? 'flex-1' : 'flex-1 pr-4')}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h3
                              className={cn(
                                'line-clamp-2 font-semibold text-slate-100',
                                isCompact ? 'text-sm' : 'text-base'
                              )}
                            >
                              {course.name}
                            </h3>
                          </div>
                          <p className="mt-0.5 text-xs font-medium text-slate-300">
                            @{tutor.username}
                          </p>
                          <p
                            className={cn(
                              'mt-2 line-clamp-3 text-slate-400',
                              isCompact ? 'line-clamp-2 text-[11px]' : 'text-sm'
                            )}
                          >
                            {desc}
                          </p>

                          {!isList && (
                            <dl
                              className={cn(
                                'mt-auto space-y-1.5 pt-3 text-slate-300',
                                isCompact ? 'text-[11px]' : 'text-xs sm:text-sm'
                              )}
                            >
                              <div className="flex gap-1">
                                <dd className="font-medium text-slate-200">
                                  {course.lessonCount} lessons
                                </dd>
                              </div>
                              <div className="flex items-start gap-1">
                                <dd className="min-w-0 text-slate-200">
                                  {course.scheduleSummary ? (
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.preventDefault()
                                        setScheduleCourse(course)
                                      }}
                                      className="inline-flex items-center gap-1 font-medium text-blue-400 transition-colors hover:text-blue-300 hover:underline"
                                    >
                                      <CalendarDays className="h-3.5 w-3.5" />
                                      Schedule <ExternalLink className="h-3 w-3" />
                                    </button>
                                  ) : (
                                    <span className="flex shrink-0 items-center gap-0.5 font-medium text-slate-300">
                                      <CalendarDays className="h-3.5 w-3.5" />
                                      Schedule to be announced
                                    </span>
                                  )}
                                </dd>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <Badge
                                  variant={enrollmentStatus === 'ended' ? 'outline' : 'default'}
                                  className={cn(
                                    'text-[10px] font-semibold transition-all hover:brightness-105 sm:text-xs',
                                    enrollmentStatus === 'ongoing'
                                      ? 'border-transparent bg-emerald-600 text-white hover:bg-emerald-600'
                                      : 'border-[rgba(255,255,255,0.2)] text-slate-300'
                                  )}
                                >
                                  {enrollmentStatus === 'ended'
                                    ? 'Enrollment ended'
                                    : 'Enrollment ongoing'}
                                </Badge>
                              </div>
                            </dl>
                          )}
                        </div>

                        {/* Middle column (ONLY IN LIST MODE): Lessons, Schedule, Enrollment */}
                        {isList && (
                          <div className="flex min-w-[200px] shrink-0 flex-col gap-2.5 py-1">
                            <div className="flex items-center gap-2 text-sm text-slate-200">
                              <BookOpen className="h-4 w-4 text-slate-400" />
                              <span>{course.lessonCount} lessons</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-200">
                              <CalendarDays className="h-4 w-4 text-slate-400" />
                              {course.scheduleSummary ? (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.preventDefault()
                                    setScheduleCourse(course)
                                  }}
                                  className="inline-flex items-center gap-1 font-medium text-blue-400 transition-colors hover:text-blue-300 hover:underline"
                                >
                                  Schedule <ExternalLink className="h-3 w-3" />
                                </button>
                              ) : (
                                <span className="font-medium text-slate-300">
                                  Schedule to be announced
                                </span>
                              )}
                            </div>
                            <div className="pt-0.5">
                              <Badge
                                variant={enrollmentStatus === 'ended' ? 'outline' : 'default'}
                                className={cn(
                                  'text-[10px] font-semibold transition-all hover:brightness-105 sm:text-xs',
                                  enrollmentStatus === 'ongoing'
                                    ? 'border-transparent bg-emerald-600 text-white hover:bg-emerald-600'
                                    : 'border-[rgba(255,255,255,0.2)] text-slate-300'
                                )}
                              >
                                {enrollmentStatus === 'ended'
                                  ? 'Enrollment ended'
                                  : 'Enrollment ongoing'}
                              </Badge>
                            </div>
                          </div>
                        )}

                        {/* Right column: Badge + Avatar */}
                        <div
                          className={cn(
                            'flex w-24 shrink-0 flex-col items-end justify-between sm:w-28',
                            isList && 'ml-4 h-full py-1'
                          )}
                        >
                          <Badge
                            variant="secondary"
                            className="mb-2 shrink-0 border-0 bg-blue-600 text-[10px] text-white transition-all hover:bg-blue-700 hover:brightness-105 sm:text-xs"
                          >
                            {course.categories[0] || 'general'}
                          </Badge>
                          <div className="mt-auto h-24 w-24 shrink-0 overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.03)] shadow-[0_6px_16px_rgba(0,0,0,0.35)] sm:h-28 sm:w-28">
                            {tutor.avatarUrl ? (
                              <img
                                src={tutor.avatarUrl}
                                alt={tutor.username}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-[rgba(255,255,255,0.05)] text-slate-300">
                                <User className="h-8 w-8 opacity-50" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div
                        className={cn(
                          'flex flex-col gap-3 border-t border-[rgba(255,255,255,0.1)] px-4 py-3',
                          isList
                            ? 'w-full min-w-[180px] max-w-[200px] justify-center border-l border-t-0'
                            : 'w-full justify-between',
                          isCompact && 'gap-2 px-3 py-2'
                        )}
                      >
                        {!isList && (
                          <div className="flex w-full flex-wrap items-center justify-between gap-2">
                            <StarRating
                              rating={course.rating ?? null}
                              count={course.reviewCount}
                              className="text-slate-200"
                            />
                            {course.isFree ? (
                              <span className="text-sm font-bold text-emerald-400">Free</span>
                            ) : course.price != null && course.price > 0 ? (
                              <span className="text-sm font-bold text-slate-100">
                                ${course.price}{' '}
                                <span className="text-[10px] font-normal text-slate-400">
                                  / 1h session
                                </span>
                              </span>
                            ) : (
                              <span className="text-sm font-bold text-emerald-400">Free</span>
                            )}
                          </div>
                        )}

                        {isList && (
                          <div className="flex w-full flex-col gap-4 px-2">
                            <div>
                              {course.isFree ? (
                                <span className="text-lg font-bold text-emerald-400">Free</span>
                              ) : course.price != null && course.price > 0 ? (
                                <span className="text-lg font-bold text-slate-100">
                                  ${course.price}{' '}
                                  <span className="text-xs font-normal text-slate-400">
                                    / 1h session
                                  </span>
                                </span>
                              ) : (
                                <span className="text-lg font-bold text-emerald-400">Free</span>
                              )}
                            </div>
                            <div className="h-px w-full bg-[rgba(255,255,255,0.1)]" />
                          </div>
                        )}

                        <div
                          className={cn(
                            'mt-auto flex w-full flex-wrap items-center gap-4 pt-2',
                            isList ? 'justify-between px-2' : 'justify-start'
                          )}
                        >
                          <button
                            type="button"
                            className={cn(
                              'inline-flex items-center text-sm font-medium text-slate-300 transition-colors hover:text-white disabled:opacity-50',
                              isCompact && 'text-xs'
                            )}
                            onClick={() => setDetailsCourse(course)}
                          >
                            <FileText className="mr-1.5 h-3.5 w-3.5" />
                            Details
                          </button>

                          {isTutorOwner ? (
                            <button
                              type="button"
                              className={cn(
                                'inline-flex items-center text-sm font-medium text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-50',
                                isCompact && 'text-xs'
                              )}
                              onClick={() => handleEnterClassroom(course)}
                              disabled={launchingCourseId === course.id}
                            >
                              <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                              {launchingCourseId === course.id ? 'Launching…' : 'Classroom'}
                            </button>
                          ) : (
                            <>
                              {session?.user?.role === 'STUDENT' &&
                                course.enrollmentStatus !== 'ended' && (
                                  <>
                                    {enrolledCourseIds.has(course.id) ? (
                                      <button
                                        type="button"
                                        className={cn(
                                          'inline-flex items-center text-sm font-medium text-emerald-400 disabled:opacity-50',
                                          isCompact && 'text-xs'
                                        )}
                                        disabled
                                      >
                                        <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                                        Enrolled
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className={cn(
                                          'inline-flex items-center text-sm font-medium text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-50',
                                          isCompact && 'text-xs'
                                        )}
                                        onClick={() => handleEnrollClick(course)}
                                        disabled={enrollingCourseId === course.id}
                                      >
                                        {enrollingCourseId === course.id ? (
                                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                                        )}
                                        {enrollingCourseId === course.id ? 'Enrolling…' : 'Enroll'}
                                      </button>
                                    )}
                                  </>
                                )}
                              <button
                                type="button"
                                className={cn(
                                  'inline-flex items-center text-sm font-medium text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-50',
                                  isCompact && 'text-xs'
                                )}
                                onClick={() => void handleStudentEnterClassroom(course)}
                                disabled={studentJoiningCourseId === course.id}
                              >
                                <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                                {studentJoiningCourseId === course.id ? 'Enrolling…' : 'Classroom'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                }
              )}
            </div>
          )}
        </div>
      </div>

      {/* Book 1 on 1 Dialog */}
      <Book1on1Dialog
        open={bookDialogOpen}
        onOpenChange={setBookDialogOpen}
        tutor={tutor}
        username={normalizedUsername}
        locale={locale}
      />

      <Dialog open={!!detailsCourse} onOpenChange={open => !open && setDetailsCourse(null)}>
        <DialogContent className="flex h-[80vh] w-[80vw] max-w-4xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-2xl">{detailsCourse?.name}</DialogTitle>
            <DialogDescription className="mt-2 text-base">
              {detailsCourse?.description || 'No description provided.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-auto p-6 pt-0">
            <DialogPanel>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-gray-600">Category</div>
                  <div className="text-base font-semibold text-gray-900">
                    {detailsCourse?.categories?.[0] || 'general'}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-gray-600">Sessions</div>
                  <div className="text-base font-semibold text-gray-900">
                    {detailsCourse?.lessonCount} lessons
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-gray-600">Price</div>
                  <div className="text-base font-semibold text-gray-900">
                    {detailsCourse?.isFree
                      ? 'Free'
                      : detailsCourse?.price != null
                        ? `$${detailsCourse.price} / 1h session`
                        : 'Free'}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-gray-600">Schedule</div>
                  <div className="text-base font-semibold text-gray-900">
                    {detailsCourse?.scheduleSummary?.trim() || 'Schedule to be announced'}
                  </div>
                </div>
              </div>
            </DialogPanel>
            <DialogPanel>
              <h3 className="mb-4 text-lg font-semibold text-gray-900">About this course</h3>
              <p className="whitespace-pre-wrap leading-relaxed text-gray-600">
                {detailsCourse?.description || 'More details will be available soon.'}
              </p>
            </DialogPanel>
          </div>
          <DialogFooter className="gap-3">
            <Button
              variant="modal-secondary"
              onClick={() => setDetailsCourse(null)}
              className="h-10"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!scheduleCourse} onOpenChange={open => !open && setScheduleCourse(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{scheduleCourse?.name}</DialogTitle>
            <DialogDescription>{scheduleCourse?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-6 pt-0">
            <DialogPanel>
              <h4 className="mb-2 text-sm font-semibold text-gray-900">Weekly Schedule</h4>
              {scheduleCourse?.schedule && scheduleCourse.schedule.length > 0 ? (
                <div className="space-y-2">
                  {scheduleCourse.schedule.map((slot: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-gray-200 p-2 text-sm"
                    >
                      <span className="font-medium text-gray-900">{slot.dayOfWeek}</span>
                      <span className="text-gray-600">
                        {slot.startTime} ({slot.durationMinutes} mins)
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No fixed schedule for this course.</p>
              )}
            </DialogPanel>
          </div>
          <DialogFooter className="gap-3">
            <Button
              variant="modal-secondary"
              onClick={() => setScheduleCourse(null)}
              className="h-10"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!classroomPickerCourse}
        onOpenChange={open => {
          if (!open) {
            setClassroomPickerCourse(null)
            setClassroomPickerSessions([])
          }
        }}
      >
        <DialogContent className="h-[80vh] w-[80vw] max-w-none overflow-auto">
          <DialogHeader>
            <DialogTitle>Choose a session</DialogTitle>
            <DialogDescription>{classroomPickerCourse?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-6 pt-0">
            {sortedClassroomPickerSessions.map(s => {
              const id = (s.id || s.sessionId) as string
              const scheduledAtMs = new Date(s.scheduledAt ?? 0).getTime()
              const enterOpensAtMs = scheduledAtMs - 20 * 60 * 1000
              const nowMs = Date.now()
              const canEnter = nowMs >= enterOpensAtMs
              return (
                <DialogPanel
                  key={id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-gray-900">
                        {new Date(scheduledAtMs).toLocaleString()}
                      </div>
                      <Badge variant={s.status === 'active' ? 'default' : 'secondary'}>
                        {s.status === 'active' ? 'Live' : 'Scheduled'}
                      </Badge>
                    </div>
                    {!canEnter && (
                      <div className="mt-1 text-xs text-gray-600">
                        You can enter 20 minutes before start. Please come back at{' '}
                        {new Date(enterOpensAtMs).toLocaleTimeString()}.
                      </div>
                    )}
                  </div>
                  <Button
                    variant="modal-primary"
                    size="sm"
                    className="h-10"
                    onClick={() => {
                      if (!canEnter) {
                        toast.info(
                          `Please wait until ${new Date(enterOpensAtMs).toLocaleTimeString()} to enter.`
                        )
                        return
                      }
                      setClassroomPickerCourse(null)
                      setClassroomPickerSessions([])
                      router.push(`/${locale}/student/feedback?sessionId=${encodeURIComponent(id)}`)
                    }}
                    disabled={!canEnter}
                  >
                    Enter
                  </Button>
                </DialogPanel>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
