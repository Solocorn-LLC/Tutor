'use client'

import { useEffect, useMemo, useRef, useState, type SVGProps } from 'react'
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
import { ScheduleViewModal } from '@/components/course/ScheduleViewModal'
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
  Link2,
  List,
  Tags,
  CalendarDays,
  Calendar,
  Clock,
  DollarSign,
  Loader2,
  Video,
  Search,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  User,
  BookOpen,
  Instagram,
  Youtube,
  Facebook,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { CountryFlag } from '@/components/country-flag'
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
      x?: string | null
      kakaoTalk?: string | null
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
    variantCategory?: string | null
    schedule?: any[]
    liveSessionsTotal?: number
    liveSessionsCompleted?: number
    enrollmentStatus?: 'ongoing' | 'ended'
    startDate?: string | null
  }>
}

const TikTokIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M208 88.9a71 71 0 0 1-52-22.2v95.5a63.9 63.9 0 1 1-54-63v33.4a30.6 30.6 0 1 0 21 29.1V24h33.1a71 71 0 0 0 52.1 55.3Z" />
  </svg>
)

// X (formerly Twitter) brand glyph.
const XBrandIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)

const KakaoTalkIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 512 512" aria-hidden="true" {...props}>
    <rect width="512" height="512" rx="115" fill="#FEE500" />
    <g transform="translate(256, 256) scale(1.3) translate(-256, -256)">
      <path
        d="M256 120c-79.5 0-144 53.5-144 119.5 0 42 27.5 78.5 69 100.5-3 11-11.5 35-13 41-1.5 5.5 2 8 6.5 5.5 16.5-9 55-33 72.5-46 3 0.5 6 0.5 9 0.5 79.5 0 144-53.5 144-119.5S335.5 120 256 120z"
        fill="#3C1E1E"
      />
      <text
        x="256"
        y="275"
        textAnchor="middle"
        fill="#FEE500"
        fontSize="100"
        fontWeight="bold"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      >
        TALK
      </text>
    </g>
  </svg>
)

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
  const router = useRouter()
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
        // The PK column is `requestId` (Drizzle property), not `id`.
        setActiveRequest(
          data.request
            ? { id: data.request.requestId ?? data.request.id, status: data.request.status }
            : null
        )
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
        setActiveRequest({
          id: data.request.requestId ?? data.request.id,
          status: data.request.status,
        })
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
              <Button variant="modal-primary-dark" asChild className="h-10">
                <Link href={`/${locale}/login`}>Log In</Link>
              </Button>
            </DialogPanel>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (hasPendingRequest && activeRequest) {
    const isAccepted = activeRequest.status === 'ACCEPTED'
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isAccepted ? 'Booking Accepted — Payment Required' : 'Booking Request Pending'}
            </DialogTitle>
            <DialogDescription>
              {isAccepted
                ? `${tutor.name} accepted your booking. Complete payment to confirm your session.`
                : `You already have a pending booking request with ${tutor.name}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-6 pt-0">
            <DialogPanel>
              <p className="font-medium text-gray-900">Status: {activeRequest.status}</p>
              <p className="mt-2 text-sm text-gray-600">
                {isAccepted
                  ? 'Your session is reserved pending payment. Complete payment now to secure it.'
                  : 'Please wait for the tutor to respond. You will receive a notification once they accept or reject your request.'}
              </p>
            </DialogPanel>
          </div>
          <DialogFooter className="gap-3">
            {isAccepted && activeRequest.id && (
              <Button
                variant="modal-primary-dark"
                className="h-10"
                onClick={() => router.push(`/${locale}/payment?requestId=${activeRequest.id}`)}
              >
                Complete Payment
              </Button>
            )}
            <Button
              variant="modal-secondary-dark"
              onClick={() => onOpenChange(false)}
              className="h-10"
            >
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
          <Button
            variant="modal-secondary-dark"
            onClick={() => onOpenChange(false)}
            className="h-10"
          >
            Cancel
          </Button>
          <Button
            variant="modal-primary-dark"
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
  const [courseSearchQuery, setCourseSearchQuery] = useState('')
  const [courseCategoryFilter, setCourseCategoryFilter] = useState('')
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
  const [coursesExpanded, setCoursesExpanded] = useState(false)
  const [showBackButton, setShowBackButton] = useState(false)
  const coursesPanelRef = useRef<HTMLDivElement>(null)
  const coursesHeaderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadTutorData()
  }, [username])

  // Hide body scrollbar on this page
  useEffect(() => {
    document.body.classList.add('scrollbar-hide')
    return () => document.body.classList.remove('scrollbar-hide')
  }, [])

  // IntersectionObserver: show Back to Profile button only when courses header is scrolled out of view
  useEffect(() => {
    if (!coursesHeaderRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowBackButton(!entry.isIntersecting)
      },
      { threshold: 0 }
    )
    observer.observe(coursesHeaderRef.current)
    return () => observer.disconnect()
  }, [])

  const hasAutoOpenedCourse = useRef(false)
  useEffect(() => {
    const requestedId = searchParams.get('courseId')
    if (!requestedId || !data?.courses?.length) return
    if (hasAutoOpenedCourse.current) return
    const match = data.courses.find(c => c.id === requestedId) || null
    if (match) {
      hasAutoOpenedCourse.current = true
      setDetailsCourse(match)
    }
  }, [searchParams, data?.courses])

  useEffect(() => {
    if (!data?.tutor?.id) return
    loadFollowState(data.tutor.id)
  }, [data?.tutor?.id])

  const courseCategoryOptions = useMemo(() => {
    if (!data?.courses) return []
    const categories = new Set<string>()
    data.courses.forEach(c => {
      if (c.categories && Array.isArray(c.categories)) {
        c.categories.forEach((cat: string) => {
          if (cat && typeof cat === 'string' && cat.trim()) {
            categories.add(cat.trim())
          }
        })
      }
    })
    return Array.from(categories).sort()
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

    if (courseCategoryFilter) {
      result = result.filter(c => c.categories?.includes(courseCategoryFilter))
    }

    return result
  }, [data?.courses, courseSearchQuery, courseCategoryFilter])

  const enrollingCourses = useMemo(
    () => filteredCourses.filter(c => (c.liveSessionsCompleted ?? 0) === 0),
    [filteredCourses]
  )
  const activeCourses = useMemo(
    () =>
      filteredCourses.filter(c => {
        const done = c.liveSessionsCompleted ?? 0
        const total = c.liveSessionsTotal ?? 0
        return done > 0 && (total === 0 || done < total)
      }),
    [filteredCourses]
  )
  const cataloguedCourses = useMemo(
    () =>
      filteredCourses.filter(c => {
        const total = c.liveSessionsTotal ?? 0
        const done = c.liveSessionsCompleted ?? 0
        return total > 0 && done >= total
      }),
    [filteredCourses]
  )

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
      router.push(`/${locale}/tutor/classroom?sessionId=${sessionId}&courseId=${course.id}`)
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

  const headerCardClass =
    'group relative overflow-hidden rounded-[20px] p-[1px] shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-200 ease-in-out hover:shadow-[0_24px_80px_rgba(0,0,0,0.22)]'
  const headerInnerClass =
    'rounded-[20px] bg-[linear-gradient(135deg,#0B3A9B_0%,#1D4ED8_35%,#0A2F78_100%)] px-8 py-5 text-white'
  const panelCardClass =
    'group rounded-[18px] bg-white p-5 shadow-[0_14px_45px_rgba(0,0,0,0.12)] transition-all duration-200 ease-in-out hover:shadow-[0_20px_60px_rgba(0,0,0,0.16)]'

  const TriangleArrow = ({
    direction,
    disabled,
    onClick,
    label,
    className,
  }: {
    direction: 'left' | 'right'
    disabled: boolean
    onClick: () => void
    label: string
    className?: string
  }) => {
    const bg = 'linear-gradient(135deg, rgba(55,65,75,0.5) 0%, rgba(25,35,45,0.5) 100%)'
    const outline =
      'drop-shadow(0 0 2px rgba(30,40,50,0.5)) drop-shadow(0 0 4px rgba(30,40,50,0.3))'
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'shrink-0 transition-all duration-300',
          'h-[clamp(176px,14.4vw,224px)] w-[clamp(44px,3.6vw,56px)]',
          'self-center',
          !disabled
            ? cn(
                'cursor-pointer',
                'hover:brightness-110',
                'hover:-translate-y-[2px]',
                direction === 'left' && 'hover:-translate-x-1',
                direction === 'right' && 'hover:translate-x-1'
              )
            : 'cursor-not-allowed opacity-30 grayscale',
          className
        )}
        style={{
          clipPath:
            direction === 'left'
              ? 'polygon(100% 0, 100% 100%, 0 50%)'
              : 'polygon(0 0, 0 100%, 100% 50%)',
          background: bg,
          filter: `drop-shadow(0 12px 24px rgba(0,0,0,0.35)) ${outline}`,
        }}
        aria-label={label}
      />
    )
  }

  const CourseCardStrip = ({ courses }: { courses: typeof enrollingCourses }) => {
    const [page, setPage] = useState(0)
    const PAGE_SIZE = 4
    const CARD_WIDTH = 320
    const CARD_GAP = 20
    const totalPages = Math.max(1, Math.ceil(courses.length / PAGE_SIZE))
    const currentPage = Math.min(page, totalPages - 1)
    const canPrev = currentPage > 0
    const canNext = currentPage < totalPages - 1
    const visible = courses.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)
    const placeholders = Math.max(0, PAGE_SIZE - visible.length)

    return (
      <div className="flex w-full items-stretch">
        <div className="flex shrink-0 items-center pr-3">
          <TriangleArrow
            direction="left"
            disabled={!canPrev}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            label="Previous courses"
          />
        </div>
        <div className="flex-1 overflow-hidden py-3">
          <div className="flex gap-5">
            {visible.map(
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
                const description = course.description?.trim() || ''
                const hasDescription = description.length > 0
                const descriptionText = hasDescription
                  ? description
                  : 'No description provided for this course yet.'
                const descriptionPreview =
                  descriptionText.length > 200
                    ? `${descriptionText.slice(0, 197)}...`
                    : descriptionText
                const isList = false
                const isCompact = false

                return (
                  <div
                    key={course.id}
                    className={cn(
                      'group relative flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] text-left transition-all duration-300',
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
                      width: CARD_WIDTH,
                      height: CARD_WIDTH,
                      flexShrink: 0,
                      backgroundImage:
                        'linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.00) 65%), linear-gradient(145deg, rgba(55, 65, 75, 0.85), rgba(25, 35, 45, 0.95))',
                    }}
                  >
                    <div
                      className={cn(
                        'flex flex-1',
                        isList
                          ? 'min-w-0 flex-col py-4 pl-10 pr-4 sm:flex-row sm:items-center sm:gap-6 sm:pl-12'
                          : 'flex-col p-3.5',
                        isCompact && !isList && 'p-3'
                      )}
                    >
                      {isList ? (
                        <div className="flex min-w-0 flex-1 items-center gap-6">
                          <div className="w-[260px] min-w-0 shrink-0">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="line-clamp-2 text-base font-semibold text-slate-100">
                                {course.name}
                              </h3>
                            </div>
                            <p className="mt-0.5 text-xs font-medium text-slate-300">
                              @{tutor.username}
                            </p>
                            <Badge
                              variant="secondary"
                              className="mt-2 w-fit border-0 bg-blue-600 text-[10px] font-semibold text-white transition-all hover:bg-blue-700 hover:brightness-105 sm:text-xs"
                            >
                              {course.country && course.country !== 'Global' ? (
                                <>
                                  {course.variantCategory || course.categories[0] || 'general'} —{' '}
                                  <CountryFlag countryName={course.country} size="xs" showLabel />
                                </>
                              ) : (
                                course.categories[0] || 'general'
                              )}
                            </Badge>
                          </div>

                          <div className="min-w-0 flex-1 rounded-[12px] border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.045)] px-[18px] py-[14px] text-[rgba(255,255,255,0.86)]">
                            <p className="line-clamp-3 text-sm leading-[1.45]">
                              {descriptionPreview}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-1 flex-col">
                          <div
                            className={cn(
                              'flex items-start justify-between gap-4',
                              isCompact && 'gap-3'
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <h3
                                className={cn(
                                  'line-clamp-2 font-semibold text-slate-100',
                                  isCompact ? 'text-sm' : 'text-[15px]'
                                )}
                              >
                                {course.name}
                              </h3>
                              <p className="mt-0.5 text-xs font-medium text-slate-300">
                                @{tutor.username}
                              </p>
                              <Badge
                                variant="secondary"
                                className={cn(
                                  'mt-1.5 w-fit border-0 bg-blue-600 text-[10px] font-semibold text-white transition-all hover:bg-blue-700 hover:brightness-105 sm:text-xs',
                                  isCompact && 'mt-1.5'
                                )}
                              >
                                {course.country && course.country !== 'Global' ? (
                                  <>
                                    {course.variantCategory || course.categories[0] || 'general'} —{' '}
                                    <CountryFlag countryName={course.country} size="xs" showLabel />
                                  </>
                                ) : (
                                  course.categories[0] || 'general'
                                )}
                              </Badge>
                            </div>

                            <div
                              className={cn(
                                'shrink-0 overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.03)] shadow-[0_8px_20px_rgba(0,0,0,0.28)]',
                                isCompact
                                  ? 'h-20 w-20'
                                  : 'h-[78px] w-[78px] sm:h-[86px] sm:w-[86px]'
                              )}
                            >
                              {tutor.avatarUrl ? (
                                <img
                                  src={tutor.avatarUrl}
                                  alt={course.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-[rgba(255,255,255,0.05)] text-slate-300">
                                  <User className="h-8 w-8 opacity-50" />
                                </div>
                              )}
                            </div>
                          </div>

                          {hasDescription ? (
                            <div
                              className={cn(
                                'mt-2 rounded-[12px] border border-[rgba(15,23,42,0.10)] bg-white px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(15,23,42,0.06)]',
                                isCompact && 'mt-2 rounded-[12px] px-3 py-2'
                              )}
                            >
                              <p
                                className={cn(
                                  'line-clamp-4 text-[12px] leading-[1.3] text-slate-800',
                                  isCompact && 'text-[11px]'
                                )}
                              >
                                {description}
                              </p>
                            </div>
                          ) : (
                            <p
                              className={cn(
                                'mt-2 text-[11px] text-slate-300/80',
                                isCompact && 'mt-2 text-[11px]'
                              )}
                            >
                              No description yet.
                            </p>
                          )}

                          <div
                            className={cn(
                              'mt-2 flex items-baseline gap-3 text-[11px] text-slate-300',
                              isCompact && 'mt-2 text-[11px]'
                            )}
                          >
                            <div className="flex items-center gap-1 font-medium text-slate-200">
                              <BookOpen className="h-3.5 w-3.5 text-slate-400" />
                              {course.lessonCount} sessions
                            </div>
                            <div className="h-3.5 w-px self-center bg-[rgba(255,255,255,0.12)]" />
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={e => {
                                  e.preventDefault()
                                  setScheduleCourse(course)
                                }}
                                className="inline-flex items-center gap-1 font-medium text-blue-400 transition-colors hover:text-blue-300 hover:underline"
                              >
                                <CalendarDays className="h-3.5 w-3.5" />
                                View schedules <ExternalLink className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Middle column (ONLY IN LIST MODE): Lessons, Schedule, Enrollment */}
                      {isList && (
                        <div className="flex min-w-[200px] shrink-0 flex-col gap-2.5 border-l border-[rgba(255,255,255,0.10)] py-1 pl-6">
                          <div className="flex items-center gap-2 text-sm text-slate-200">
                            <BookOpen className="h-4 w-4 text-slate-400" />
                            <span>{course.lessonCount} sessions</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-200">
                            <CalendarDays className="h-4 w-4 text-slate-400" />
                            <button
                              type="button"
                              onClick={e => {
                                e.preventDefault()
                                setScheduleCourse(course)
                              }}
                              className="inline-flex items-center gap-1 font-medium text-blue-400 transition-colors hover:text-blue-300 hover:underline"
                            >
                              View schedules <ExternalLink className="h-3 w-3" />
                            </button>
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

                      {isList && (
                        <div className="flex w-[148px] shrink-0 items-center justify-center border-l border-[rgba(255,255,255,0.10)] py-1 pl-6">
                          <div className="h-24 w-[120px] shrink-0 overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.03)] shadow-[0_8px_20px_rgba(0,0,0,0.28)]">
                            {tutor.avatarUrl ? (
                              <img
                                src={tutor.avatarUrl}
                                alt={tutor.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-[rgba(255,255,255,0.05)] text-slate-300">
                                <User className="h-8 w-8 opacity-50" />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div
                      className={cn(
                        'flex flex-col gap-2.5 border-t border-[rgba(255,255,255,0.1)] px-3.5 py-2.5',
                        isList
                          ? 'w-full min-w-[180px] max-w-[200px] justify-center border-l border-t-0'
                          : 'w-full justify-between',
                        isCompact && 'gap-2 px-3 py-2'
                      )}
                    >
                      {!isList && (
                        <div className="flex w-full flex-wrap items-center justify-between gap-2">
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
                          {course.isFree ? (
                            <span className="text-[13px] font-bold text-emerald-400">Free</span>
                          ) : course.price != null && course.price > 0 ? (
                            <span className="text-[13px] font-bold text-slate-100">
                              ${course.price}{' '}
                              <span className="text-[10px] font-normal text-slate-400">
                                / 1h session
                              </span>
                            </span>
                          ) : (
                            <span className="text-[13px] font-bold text-emerald-400">Free</span>
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
                          'mt-auto flex w-full flex-wrap items-center gap-3.5 pt-1.5',
                          isList ? 'justify-between px-2' : 'justify-start'
                        )}
                      >
                        <button
                          type="button"
                          className={cn(
                            'inline-flex items-center text-[13px] font-medium text-slate-300 transition-colors hover:text-white disabled:opacity-50',
                            isCompact && 'text-xs'
                          )}
                          onClick={() => setDetailsCourse(course)}
                        >
                          <FileText className="mr-1.5 h-3 w-3" />
                          Details
                        </button>

                        {isTutorOwner ? (
                          <button
                            type="button"
                            className={cn(
                              'inline-flex items-center text-[13px] font-medium text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-50',
                              isCompact && 'text-xs'
                            )}
                            onClick={() => handleEnterClassroom(course)}
                            disabled={launchingCourseId === course.id}
                          >
                            <BookOpen className="mr-1.5 h-3 w-3" />
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
                                        'inline-flex items-center text-[13px] font-medium text-emerald-400 disabled:opacity-50',
                                        isCompact && 'text-xs'
                                      )}
                                      disabled
                                    >
                                      <CheckCircle className="mr-1.5 h-3 w-3" />
                                      Enrolled
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className={cn(
                                        'inline-flex items-center text-[13px] font-medium text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-50',
                                        isCompact && 'text-xs'
                                      )}
                                      onClick={() => handleEnrollClick(course)}
                                      disabled={enrollingCourseId === course.id}
                                    >
                                      {enrollingCourseId === course.id ? (
                                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                      ) : (
                                        <UserPlus className="mr-1.5 h-3 w-3" />
                                      )}
                                      {enrollingCourseId === course.id ? 'Enrolling…' : 'Enroll'}
                                    </button>
                                  )}
                                </>
                              )}
                            <button
                              type="button"
                              className={cn(
                                'inline-flex items-center text-[13px] font-medium text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-50',
                                isCompact && 'text-xs'
                              )}
                              onClick={() => void handleStudentEnterClassroom(course)}
                              disabled={studentJoiningCourseId === course.id}
                            >
                              <BookOpen className="mr-1.5 h-3 w-3" />
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
            {Array.from({ length: placeholders }).map((_, i) => (
              <div
                key={`placeholder-${i}`}
                style={{ width: CARD_WIDTH, height: CARD_WIDTH, flexShrink: 0 }}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center pl-3">
          <TriangleArrow
            direction="right"
            disabled={!canNext}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            label="Next courses"
          />
        </div>
      </div>
    )
  }

  function CourseSection({
    title,
    courses,
    emptyMessage,
    forceOpen,
  }: {
    title: string
    courses: typeof enrollingCourses
    emptyMessage: string
    forceOpen?: boolean
  }) {
    const [isOpen, setIsOpen] = useState(courses.length > 0)

    useEffect(() => {
      if (forceOpen !== undefined) {
        setIsOpen(forceOpen)
      }
    }, [forceOpen])

    return (
      <section>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'flex w-full items-center gap-2',
            forceOpen !== undefined ? 'mb-2' : 'mb-4'
          )}
        >
          {isOpen ? (
            <ChevronDown className="h-5 w-5 text-slate-500" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-500" />
          )}
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
        </button>
        <div
          className={cn(
            'grid transition-all duration-300 ease-in-out',
            isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden">
            {courses.length === 0 ? (
              <div className="rounded-[14px] border border-[rgba(0,0,0,0.04)] bg-slate-50/50 py-12 text-center">
                <BookOpen className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                <p className="text-sm text-slate-500">{emptyMessage}</p>
              </div>
            ) : (
              <CourseCardStrip courses={courses} />
            )}
          </div>
        </div>
      </section>
    )
  }

  return (
    <div
      className="min-h-screen w-full bg-white p-4 sm:p-6"
      style={{ '--density-scale': '0.9' } as React.CSSProperties}
    >
      <div className="w-full">
        <section className={headerCardClass}>
          <div className={headerInnerClass}>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-5">
                <Avatar className="h-28 w-28 rounded-2xl border border-white/40 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                  <AvatarImage src={tutor.avatarUrl || undefined} alt="Tutor avatar" />
                  <AvatarFallback className="rounded-2xl bg-white/15 text-lg font-semibold text-white">
                    {tutor.name ? tutor.name.slice(0, 2).toUpperCase() : 'TU'}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="truncate text-3xl font-bold leading-tight text-white">
                      {tutor.name || '@'}
                    </h1>
                  </div>
                  <div className="mt-1 text-sm font-medium text-white/80">@{tutor.username}</div>

                  <div className="mt-4 inline-flex flex-wrap items-center gap-4 rounded-full bg-white/10 px-5 py-2.5 text-white ring-1 ring-white/15 backdrop-blur">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-white/70" />
                      <div className="flex items-baseline gap-2 whitespace-nowrap leading-none">
                        <span className="text-xs font-semibold text-white/70">Tutor Since</span>
                        <span className="text-sm font-semibold">
                          {tutor.tutorSince ? new Date(tutor.tutorSince).toLocaleDateString() : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="hidden h-5 w-px bg-white/20 md:block" />
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-white/70" />
                      <div className="flex items-baseline gap-2 whitespace-nowrap leading-none">
                        <span className="text-xs font-semibold text-white/70">Active Courses</span>
                        <span className="text-sm font-semibold">
                          {typeof tutor.activeCourses === 'number'
                            ? tutor.activeCourses
                            : (data?.courses?.length ?? 0)}
                        </span>
                      </div>
                    </div>
                    <div className="hidden h-5 w-px bg-white/20 md:block" />
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-white/70" />
                      <div className="flex items-baseline gap-2 whitespace-nowrap leading-none">
                        <span className="text-xs font-semibold text-white/70">Country</span>
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                          <CountryFlag countryName={tutor.country} size="xs" />
                          {tutor.country || '—'}
                        </span>
                      </div>
                    </div>
                    <div className="hidden h-5 w-px bg-white/20 md:block" />
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-semibold text-emerald-400">Verified</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 lg:w-auto">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    size="lg"
                    variant="solocorn-book"
                    className="w-full sm:w-auto"
                    onClick={() => setBookDialogOpen(true)}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    Book 1 on 1
                  </Button>
                  <Button
                    size="lg"
                    variant="solocorn-follow"
                    className="w-full sm:w-auto"
                    onClick={() => void toggleFollow()}
                    disabled={followState.loading}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    {followState.isFollowing ? 'Following' : 'Follow'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-7 grid gap-5 lg:grid-cols-2 lg:items-stretch">
          <div className={cn(panelCardClass, 'flex h-full flex-col')}>
            <div className="-mx-5 -mt-5 mb-4 flex h-14 items-center gap-3 rounded-t-[18px] bg-[linear-gradient(135deg,#0B3A9B_0%,#1D4ED8_35%,#0A2F78_100%)] px-5 text-white">
              <User className="h-5 w-5" />
              <span className="text-base font-semibold">Bio</span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col text-[18px] text-slate-700">
              <div
                className="flex-1 rounded-lg border border-slate-200 bg-white p-4"
                style={{ fontFamily: "'EB Garamond', 'Garamond', 'Times New Roman', serif" }}
              >
                {tutor.bio?.trim() ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{tutor.bio}</p>
                ) : (
                  <>
                    <div className="font-semibold text-slate-900">
                      Hi, I&apos;m {tutor.name?.split(' ')?.[0] || 'your tutor'}.
                    </div>
                    <ul className="mt-3 space-y-2 leading-relaxed">
                      <li>
                        <span className="font-semibold text-slate-900">What I teach:</span> Core
                        concepts + exam strategies for your target subjects.
                      </li>
                      <li>
                        <span className="font-semibold text-slate-900">Who I help:</span> Students
                        who want clarity, confidence, and measurable progress.
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
          </div>

          <div className="flex h-full flex-col gap-5">
            <div className={panelCardClass}>
              <div className="-mx-5 -mt-5 mb-4 flex h-14 items-center justify-between rounded-t-[18px] bg-[linear-gradient(135deg,#0B3A9B_0%,#1D4ED8_35%,#0A2F78_100%)] px-5 text-white">
                <div className="flex items-center gap-3">
                  <Link2 className="h-5 w-5" />
                  <span className="text-base font-semibold">Connect</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border border-white bg-transparent text-xs text-white hover:border-blue-600 hover:bg-white hover:text-blue-600 hover:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    onClick={() => void handleCopyPublicUrl()}
                    disabled={!publicUrl}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy URL
                  </Button>
                  {canShare ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border border-white bg-transparent text-xs text-white hover:border-blue-600 hover:bg-white hover:text-blue-600 hover:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      onClick={() => void handleSharePublicUrl()}
                    >
                      <Share2 className="mr-1.5 h-3.5 w-3.5" />
                      Share
                    </Button>
                  ) : null}
                </div>
              </div>

              {publicUrl ? (
                <div className="grid grid-cols-1 gap-4 border-b border-slate-100 py-4 sm:grid-cols-2">
                  <div className="flex items-center gap-3">
                    <img
                      src="/solocorn-app-icon.png"
                      alt="Solocorn"
                      className="h-12 w-12 shrink-0 rounded-xl object-cover"
                    />
                    <div className="text-lg font-semibold text-slate-900">@{tutor.username}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <img
                      src="/solocorn-app-icon.png"
                      alt="Solocorn"
                      className="h-12 w-12 shrink-0 rounded-xl object-cover"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">
                        Public Page
                        <span className="ml-2 font-normal text-slate-600">{publicUrl}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  Add a username below to generate your public link.
                </div>
              )}

              <div className="grid gap-4 pt-4 sm:grid-cols-2">
                {[
                  {
                    key: 'tiktok',
                    label: 'TikTok',
                    value: tutor.socialLinks?.tiktok
                      ? `@${stripAt(tutor.socialLinks.tiktok)}`
                      : '—',
                    icon: TikTokIcon,
                    bgClass: 'bg-black',
                    muted: !tutor.socialLinks?.tiktok,
                  },
                  {
                    key: 'youtube',
                    label: 'YouTube',
                    value: tutor.socialLinks?.youtube
                      ? `@${stripAt(tutor.socialLinks.youtube)}`
                      : '—',
                    icon: Youtube,
                    bgClass: 'bg-red-600',
                    muted: !tutor.socialLinks?.youtube,
                  },
                  {
                    key: 'instagram',
                    label: 'Instagram',
                    value: tutor.socialLinks?.instagram
                      ? `@${stripAt(tutor.socialLinks.instagram)}`
                      : '—',
                    icon: Instagram,
                    bgClass: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400',
                    muted: !tutor.socialLinks?.instagram,
                  },
                  {
                    key: 'kakaoTalk',
                    label: 'KakaoTalk',
                    value: tutor.socialLinks?.kakaoTalk
                      ? tutor.socialLinks.kakaoTalk.match(/^https?:\/\//)
                        ? stripAt(tutor.socialLinks.kakaoTalk)
                        : `https://${stripAt(tutor.socialLinks.kakaoTalk)}`
                      : '—',
                    icon: KakaoTalkIcon,
                    bgClass: 'bg-[#FEE500]',
                    muted: !tutor.socialLinks?.kakaoTalk,
                  },
                  {
                    key: 'facebook',
                    label: 'Facebook',
                    value: tutor.socialLinks?.facebook
                      ? tutor.socialLinks.facebook.match(/^https?:\/\//)
                        ? stripAt(tutor.socialLinks.facebook)
                        : `https://${stripAt(tutor.socialLinks.facebook)}`
                      : '—',
                    icon: Facebook,
                    bgClass: 'bg-blue-600',
                    muted: !tutor.socialLinks?.facebook,
                  },
                  {
                    key: 'x',
                    label: 'X',
                    value: tutor.socialLinks?.x ? `@${stripAt(tutor.socialLinks.x)}` : '—',
                    icon: XBrandIcon,
                    bgClass: 'bg-black',
                    muted: !tutor.socialLinks?.x,
                  },
                ].map(item => {
                  const Icon = item.icon
                  return (
                    <div key={item.key} className="flex items-center gap-4">
                      <div
                        className={cn(
                          'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                          item.bgClass,
                          item.muted && 'opacity-40'
                        )}
                      >
                        <Icon
                          className={cn(
                            'text-white',
                            item.key === 'kakaoTalk' ? 'h-10 w-10' : 'h-6 w-6'
                          )}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-slate-900">
                          {item.label}
                          <span
                            className={cn(
                              'ml-2 font-normal',
                              item.muted ? 'text-slate-400' : 'text-slate-600'
                            )}
                          >
                            {item.value}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className={panelCardClass}>
              <div className="-mx-5 -mt-5 mb-4 flex h-14 items-center gap-3 rounded-t-[18px] bg-[linear-gradient(135deg,#0B3A9B_0%,#1D4ED8_35%,#0A2F78_100%)] px-5 text-white">
                <Tags className="h-5 w-5" />
                <span className="text-base font-semibold">Categories</span>
                <span className="text-sm text-white">({tutor.specialties.length})</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {tutor.specialties.length > 0 ? (
                  tutor.specialties.map((s, i) => (
                    <span
                      key={`${s}-${i}`}
                      className="rounded-full border border-slate-100 bg-slate-50 px-4 py-1.5 text-sm font-medium text-slate-700"
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
      </div>

      <div
        ref={coursesPanelRef}
        className={cn(
          panelCardClass,
          'overflow-hidden p-0 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
          coursesExpanded ? 'mt-8 flex h-[calc(100vh-3rem)] flex-col' : 'mt-8'
        )}
      >
        <div ref={coursesHeaderRef} />
        <div
          onClick={() => {
            if (!coursesExpanded) {
              setCoursesExpanded(true)
              setTimeout(() => {
                coursesPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }, 50)
            } else {
              setCoursesExpanded(false)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }
          }}
          className={cn(
            'panel-header-hover cursor-pointer bg-[linear-gradient(135deg,#1E2832_0%,#2D3B4A_50%,#1A2530_100%)] transition-all duration-200 hover:brightness-110',
            coursesExpanded ? 'p-4 sm:p-5' : 'p-6 sm:p-8'
          )}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Courses</h2>
              <p className="mt-1 text-white/60">Published courses by @{tutor.username}</p>
            </div>

            <div className="flex flex-1 flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:justify-end">
              <div className="relative flex w-full max-w-lg items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type="search"
                    placeholder="Search course..."
                    leftIcon={<Search className="h-4 w-4 text-slate-400" />}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus-visible:border-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0"
                    value={courseSearchQuery}
                    onChange={e => setCourseSearchQuery(e.target.value)}
                  />
                </div>
                <Select
                  value={courseCategoryFilter}
                  onValueChange={(val: any) => setCourseCategoryFilter(val)}
                >
                  <SelectTrigger className="h-9 w-[160px] rounded-lg border border-white/10 bg-white/10 text-sm text-white transition-all duration-200 hover:border-white/20 hover:bg-white/20 focus:outline-none focus-visible:!shadow-none focus-visible:outline-none">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-lg border border-white/10 bg-white/10 p-1.5 shadow-lg backdrop-blur-md">
                    {courseCategoryOptions.map(cat => (
                      <SelectItem
                        key={cat}
                        value={cat}
                        className="mx-1.5 rounded-md text-white hover:bg-white/10 focus:bg-white/10 focus:text-white focus:outline-none"
                      >
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {coursesExpanded && showBackButton ? (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    setCoursesExpanded(false)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm text-white transition-colors hover:bg-white/20"
                >
                  <Minimize2 className="h-4 w-4" />
                  Back to Profile
                </button>
              ) : coursesExpanded ? null : (
                <Maximize2 className="ml-2 hidden h-4 w-4 shrink-0 text-white/40 lg:block" />
              )}
            </div>
          </div>
        </div>
        <div
          className={cn(
            'scrollbar-hide flex-1 overflow-y-auto',
            coursesExpanded
              ? 'flex flex-col gap-4 px-6 pb-6 pt-4 sm:px-8'
              : 'space-y-10 px-6 pb-8 pt-8 sm:px-8'
          )}
        >
          <CourseSection
            title="Enrolling"
            courses={enrollingCourses}
            emptyMessage="No published courses found."
            forceOpen={coursesExpanded && enrollingCourses.length > 0 ? true : undefined}
          />
          <CourseSection
            title="Active"
            courses={activeCourses}
            emptyMessage="This tutor has no active courses."
            forceOpen={coursesExpanded && activeCourses.length > 0 ? true : undefined}
          />
          <CourseSection
            title="Catalogued"
            courses={cataloguedCourses}
            emptyMessage="This tutor has no catalogued courses."
            forceOpen={coursesExpanded && cataloguedCourses.length > 0 ? true : undefined}
          />
        </div>
      </div>

      <Book1on1Dialog
        open={bookDialogOpen}
        onOpenChange={setBookDialogOpen}
        tutor={tutor}
        username={normalizedUsername}
        locale={locale}
      />

      <Dialog
        open={!!detailsCourse}
        onOpenChange={open => {
          if (open) return
          setDetailsCourse(null)
          if (!publicPath) return
          const nextParams = new URLSearchParams(searchParams.toString())
          nextParams.delete('courseId')
          const qs = nextParams.toString()
          router.replace(qs ? `${publicPath}?${qs}` : publicPath)
        }}
      >
        <DialogContent className="flex h-[80vh] w-[80vw] max-w-4xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-lg">{detailsCourse?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-2 p-3 pt-0">
            <DialogPanel className="p-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-0.5">
                  <div className="text-muted-foreground text-xs font-medium">Category</div>
                  <div className="text-foreground text-sm font-semibold">
                    {detailsCourse?.categories?.[0] || 'general'}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-muted-foreground text-xs font-medium">Sessions</div>
                  <div className="text-foreground text-sm font-semibold">
                    {detailsCourse?.lessonCount ?? 0} sessions
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-muted-foreground text-xs font-medium">Price</div>
                  <div className="text-foreground text-sm font-semibold">
                    {detailsCourse?.isFree
                      ? 'Free'
                      : detailsCourse?.price != null
                        ? `$${detailsCourse.price}`
                        : 'Free'}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-muted-foreground text-xs font-medium">Cost per Session</div>
                  <div className="text-foreground text-sm font-semibold">
                    {detailsCourse?.isFree
                      ? 'Free'
                      : detailsCourse?.price != null && detailsCourse?.lessonCount
                        ? `$${(detailsCourse.price / detailsCourse.lessonCount).toFixed(2)}`
                        : '—'}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-muted-foreground text-xs font-medium">Status</div>
                  <div className="text-foreground text-sm font-semibold">
                    {(() => {
                      const total = detailsCourse?.liveSessionsTotal ?? 0
                      const completed = detailsCourse?.liveSessionsCompleted ?? 0
                      if (total > 0 && completed >= total) return 'Catalogued'
                      if (completed > 0) return 'Active'
                      return 'Enrolling'
                    })()}
                  </div>
                </div>
              </div>
            </DialogPanel>
            <DialogPanel className="p-3">
              <div className="space-y-0.5">
                <div className="text-muted-foreground text-xs font-medium">Schedule</div>
                {detailsCourse?.id ? (
                  <button
                    type="button"
                    onClick={() => setScheduleCourse(detailsCourse)}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                  >
                    View schedules
                  </button>
                ) : (
                  <div className="text-foreground text-sm font-semibold">
                    Schedule to be announced
                  </div>
                )}
              </div>
            </DialogPanel>
            <DialogPanel className="p-3">
              <h3 className="text-foreground mb-2 text-sm font-semibold">About this course</h3>
              <p className="text-muted-foreground whitespace-pre-wrap text-sm leading-snug">
                {detailsCourse?.description || 'More details will be available soon.'}
              </p>
            </DialogPanel>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="modal-primary-dark"
              onClick={() => {
                setDetailsCourse(null)
                if (!session?.user) {
                  toast.info('Please log in to enroll')
                  router.push(`/${locale}/login`)
                  return
                }
                const subject = detailsCourse?.categories?.[0] || 'general'
                router.push(
                  `/${locale}/student/subjects/${encodeURIComponent(subject)}/courses/${encodeURIComponent(detailsCourse?.id || '')}`
                )
              }}
            >
              Enroll
            </Button>
            <Button variant="modal-secondary-dark" onClick={() => setDetailsCourse(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScheduleViewModal
        courseId={scheduleCourse?.id ?? null}
        courseName={scheduleCourse?.name}
        onClose={() => setScheduleCourse(null)}
      />

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
                    variant="modal-primary-dark"
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
