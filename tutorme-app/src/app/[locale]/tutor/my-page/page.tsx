'use client'

import { useEffect, useMemo, useRef, useState, useCallback, type SVGProps } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { sanitizeHtmlWithMax } from '@/lib/security/sanitize'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AvatarUploader } from '@/components/avatar-uploader'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { useAutoScrollOnExpand } from '@/hooks/use-auto-scroll-on-expand'
import {
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Share2,
  Globe,
  MapPin,
  BookOpen,
  Award,
  Instagram,
  Youtube,
  Facebook,
  GraduationCap,
  School,
  Flag,
  Search,
  X,
  MoreVertical,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  User,
  Link2,
  Tags,
  ExternalLink,
  Settings,
  CalendarClock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScheduleViewModal } from '@/components/course/ScheduleViewModal'
import { DEFAULT_LOCALE } from '@/lib/i18n/config'
import {
  REGIONS,
  GLOBAL_EXAMS_CATEGORIES,
  AP_CATEGORIES,
  A_LEVEL_CATEGORIES,
  IB_CATEGORIES,
  IGCSE_CATEGORIES,
  type CountryData,
  type ExamCategory,
} from '@/lib/data/tutor-categories'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BackButton } from '@/components/navigation'
import { CountryFlag } from '@/components/country-flag'

const SUBJECTS = [
  { value: 'math', label: 'Mathematics' },
  { value: 'english', label: 'English' },
  { value: 'physics', label: 'Physics' },
  { value: 'chemistry', label: 'Chemistry' },
  { value: 'biology', label: 'Biology' },
  { value: 'history', label: 'History' },
  { value: 'cs', label: 'Computer Science' },
]

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
    <rect width="512" height="512" rx="115" fill="currentColor" />
    <g transform="translate(256, 256) scale(1.3) translate(-256, -256)">
      <path
        d="M256 120c-79.5 0-144 53.5-144 119.5 0 42 27.5 78.5 69 100.5-3 11-11.5 35-13 41-1.5 5.5 2 8 6.5 5.5 16.5-9 55-33 72.5-46 3 0.5 6 0.5 9 0.5 79.5 0 144-53.5 144-119.5S335.5 120 256 120z"
        fill="white"
      />
      <text
        x="256"
        y="275"
        textAnchor="middle"
        fill="currentColor"
        fontSize="100"
        fontWeight="bold"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      >
        TALK
      </text>
    </g>
  </svg>
)

const KakaoTalkBrandIcon = (props: SVGProps<SVGSVGElement>) => (
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

const charcoalHeaderClass =
  'flex h-14 items-center gap-3 bg-[linear-gradient(135deg,#1F2933_0%,#374151_35%,#111827_100%)] -mx-6 -mt-6 px-6 rounded-t-[18px] text-white'

// My Courses Section Component
interface Course {
  id: string
  name: string
  description?: string | null
  categories?: string[] | null
  isPublished: boolean
  isLiveOnline?: boolean
  studentCount?: number
  createdAt: string
  updatedAt: string
  hasSessions?: boolean
  hasStudents?: boolean
  lastSessionDate?: string | null
  upcomingSessionsCount?: number
  nationality?: string | null
  variantCategory?: string | null
}

function MyCoursesSection() {
  const [courses, setCourses] = useState<Course[]>([])
  const [scheduleCourse, setScheduleCourse] = useState<{ id: string; name: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'unpublished' | 'catalogued'>(
    'active'
  )
  const [isExpanded, setIsExpanded] = useState(true)
  const coursesPanelRef = useRef<HTMLDivElement>(null)
  const coursesScrollRef = useAutoScrollOnExpand(isExpanded, { delay: 350, block: 'nearest' })
  const [measuredMaxHeight, setMeasuredMaxHeight] = useState(400)
  const measureRefs = {
    active: useRef<HTMLDivElement>(null),
    pending: useRef<HTMLDivElement>(null),
    unpublished: useRef<HTMLDivElement>(null),
    catalogued: useRef<HTMLDivElement>(null),
  }
  const router = useRouter()

  const loadCourses = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        '/api/tutor/courses?includeSessions=true&hideTemplatesWithPublishedVariants=true',
        { credentials: 'include' }
      )
      if (res.ok) {
        const data = await res.json()
        setCourses(data.courses || [])
      }
    } catch {
      toast.error('Failed to load courses')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCourses()
  }, [loadCourses])

  // Measure the tallest category list so the panel height stays stable across tabs.
  useEffect(() => {
    if (loading) return
    const heights = [
      measureRefs.active.current?.scrollHeight ?? 0,
      measureRefs.pending.current?.scrollHeight ?? 0,
      measureRefs.unpublished.current?.scrollHeight ?? 0,
      measureRefs.catalogued.current?.scrollHeight ?? 0,
    ]
    const maxHeight = Math.max(...heights)
    setMeasuredMaxHeight(Math.max(400, Math.min(720, maxHeight)))
  }, [
    loading,
    courses,
    measureRefs.active,
    measureRefs.pending,
    measureRefs.unpublished,
    measureRefs.catalogued,
  ])

  const handleDeleteCourse = async (courseId: string) => {
    if (!confirm('Are you sure you want to delete this course?')) return
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const doDelete = async (confirmed: boolean) =>
        fetch(`/api/tutor/courses/${courseId}${confirmed ? '?confirm=true' : ''}`, {
          method: 'DELETE',
          headers: {
            ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
          },
          credentials: 'include',
        })

      const res = await doDelete(false)

      if (res.ok) {
        setCourses(prev => prev.filter(c => c.id !== courseId))
        toast.success('Course deleted')
      } else {
        const data = await res.json().catch(() => ({}))
        if (res.status === 409 && data?.requiresConfirmation) {
          const enrolledCount = Number(data?.enrolledCount || 0)
          const courseName = data?.courseName || 'this course'
          const ok = confirm(
            `This published course has ${enrolledCount} enrolled student${enrolledCount === 1 ? '' : 's'}.\n\nDeleting it will automatically initiate refunds for paid enrollments and notify students.\n\nDelete "${courseName}" anyway?`
          )
          if (!ok) return
          const confirmedRes = await doDelete(true)
          const confirmedData = await confirmedRes.json().catch(() => ({}))
          if (confirmedRes.ok) {
            setCourses(prev => prev.filter(c => c.id !== courseId))
            const refundsInitiated = Number(confirmedData?.refundsInitiated || 0)
            toast.success(
              refundsInitiated > 0
                ? `Course deleted. Refunds initiated for ${refundsInitiated} payment${refundsInitiated === 1 ? '' : 's'}.`
                : 'Course deleted'
            )
            return
          }
          toast.error(confirmedData?.error || 'Failed to delete course')
          return
        }
        toast.error(data?.error || 'Failed to delete course')
      }
    } catch {
      toast.error('Failed to delete course')
    }
  }

  const handleTogglePublish = async (course: Course) => {
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch(`/api/tutor/courses/${course.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
        },
        credentials: 'include',
        body: JSON.stringify({ isPublished: !course.isPublished }),
      })

      if (res.ok) {
        setCourses(prev =>
          prev.map(c => (c.id === course.id ? { ...c, isPublished: !c.isPublished } : c))
        )
        toast.success(course.isPublished ? 'Course unpublished' : 'Course published')
      } else {
        toast.error('Failed to update course')
      }
    } catch {
      toast.error('Failed to update course')
    }
  }

  // Categorize courses based on session status
  const categorizeCourses = useMemo(() => {
    const active: Course[] = []
    const pending: Course[] = []
    const unpublished: Course[] = []
    const catalogued: Course[] = []

    for (const course of courses) {
      if (!course.isPublished) {
        unpublished.push(course)
      } else if (!course.upcomingSessionsCount && (course.hasSessions || course.hasStudents)) {
        // Course was published and had sessions or students in the past,
        // but has no upcoming sessions
        catalogued.push(course)
      } else if (!course.lastSessionDate) {
        // Published but has not completed a session yet (enrollment period)
        pending.push(course)
      } else {
        active.push(course)
      }
    }

    return { active, pending, unpublished, catalogued }
  }, [courses])

  // Filter courses based on tab
  const filteredCourses = useMemo(() => {
    switch (activeTab) {
      case 'active':
        return categorizeCourses.active
      case 'pending':
        return categorizeCourses.pending
      case 'unpublished':
        return categorizeCourses.unpublished
      case 'catalogued':
        return categorizeCourses.catalogued
      default:
        return []
    }
  }, [categorizeCourses, activeTab])

  const courseCounts = useMemo(
    () => ({
      active: categorizeCourses.active.length,
      pending: categorizeCourses.pending.length,
      unpublished: categorizeCourses.unpublished.length,
      catalogued: categorizeCourses.catalogued.length,
    }),
    [categorizeCourses]
  )

  const renderCourseRow = (course: Course, tab: typeof activeTab) => {
    const hasDesc = course.isPublished && course.description
    const showNationality = course.nationality && course.nationality !== 'Global'
    return (
      <div
        key={course.id}
        className="rounded-xl border border-[#E2E8F0] p-2.5 hover:border-slate-500"
        style={{
          background: 'linear-gradient(135deg, #1E2832 0%, #2D3B4A 50%, #1A2530 100%)',
        }}
      >
        {(() => {
          return (
            <div className="flex items-center gap-4">
              {/* Left: title + metadata */}
              <div className="flex min-w-0 flex-col justify-center">
                <div className="flex items-center gap-2">
                  <h4 className="truncate font-medium text-white">{course.name}</h4>
                  {tab === 'catalogued' ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      Catalogued
                    </span>
                  ) : course.isPublished ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                      Published
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                      Draft
                    </span>
                  )}
                </div>
                {showNationality && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-blue-400">
                    {course.variantCategory || (course.categories || [])[0] || 'General'} —{' '}
                    <CountryFlag countryName={course.nationality} size="xs" showLabel />
                  </p>
                )}
                <p className="mt-0.5 text-xs text-slate-300">
                  {showNationality
                    ? `${course.studentCount || 0} students • Updated ${new Date(course.updatedAt).toLocaleDateString()}`
                    : `${(course.categories || [])[0] || 'Untitled'} • ${course.studentCount || 0} students • Updated ${new Date(course.updatedAt).toLocaleDateString()}`}
                </p>
                {tab === 'catalogued' && course.lastSessionDate && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    Last session: {new Date(course.lastSessionDate).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Middle: description */}
              {hasDesc && (
                <>
                  <div className="h-8 w-px bg-white/20" />
                  <p className="min-w-0 flex-1 truncate text-sm text-slate-300">
                    {course.description}
                  </p>
                </>
              )}

              {/* Right: action buttons */}
              <div className="h-8 w-px bg-white/20" />
              <div className="flex shrink-0 items-center divide-x divide-white/20">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const prefix = window.location.pathname.replace(/\/tutor\/my-page\/?$/, '')
                    router.push(`${prefix}/tutor/insights?tab=builder&courseId=${course.id}`)
                  }}
                  className="text-blue-400 hover:bg-white/10 hover:text-white"
                >
                  <Edit3 className="mr-1 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScheduleCourse({ id: course.id, name: course.name })}
                  className="text-slate-200 hover:bg-white/10 hover:text-white"
                >
                  <CalendarClock className="mr-1 h-4 w-4" />
                  Schedule
                </Button>
                {tab !== 'catalogued' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTogglePublish(course)}
                    className={cn(
                      'hover:bg-white/10 hover:text-white',
                      course.isPublished ? 'text-amber-400' : 'text-emerald-400'
                    )}
                  >
                    {course.isPublished ? (
                      <>
                        <EyeOff className="mr-1 h-4 w-4" />
                        Unpublish
                      </>
                    ) : (
                      <>
                        <Eye className="mr-1 h-4 w-4" />
                        Publish
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteCourse(course.id)}
                  className="text-red-400 hover:bg-white/10 hover:text-white"
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          )
        })()}
      </div>
    )
  }

  return (
    <div ref={coursesScrollRef}>
      <Card className="relative border border-[#E2E8F0] bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
        <div
          onClick={() => setIsExpanded(prev => !prev)}
          className={cn(charcoalHeaderClass, 'panel-header-hover cursor-pointer justify-between')}
        >
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5" />
            <span className="text-base font-semibold">My Courses</span>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-white/70" />
          ) : (
            <ChevronDown className="h-5 w-5 text-white/70" />
          )}
        </div>
        <CardContent spacing="none" className="space-y-4 px-5 pb-5">
          {/* Tabs */}
          <div className="flex gap-2 border-b border-[#E2E8F0] bg-white">
            {(['active', 'pending', 'unpublished', 'catalogued'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab ? 'text-[#1D4ED8]' : 'text-[#64748B] hover:text-[#1F2933]'
                }`}
              >
                <span className="capitalize">{tab}</span>
                <span className="ml-1.5 rounded-full bg-[#F1F5F9] px-2 py-0.5 text-xs text-[#64748B]">
                  {courseCounts[tab]}
                </span>
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1D4ED8]" />
                )}
              </button>
            ))}
          </div>

          {/* Course List - Scrollable Container */}
          <div
            ref={coursesPanelRef}
            className={cn(
              'pr-2 transition-all duration-300 ease-in-out',
              isExpanded ? 'overflow-y-auto' : 'h-0 overflow-hidden'
            )}
            style={isExpanded ? { height: measuredMaxHeight } : undefined}
          >
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1D4ED8] border-t-transparent" />
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <BookOpen className="h-12 w-12 text-[#CBD5E1]" />
                <p className="mt-2 text-sm text-[#64748B]">
                  {activeTab === 'active'
                    ? 'No active courses yet'
                    : activeTab === 'pending'
                      ? 'No pending courses'
                      : activeTab === 'unpublished'
                        ? 'No unpublished courses'
                        : 'No catalogued courses'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCourses.slice(0, 10).map(course => renderCourseRow(course, activeTab))}
              </div>
            )}
          </div>

          {/* Hidden measurement lists to keep panel height stable across tabs */}
          <div
            className="pointer-events-none absolute left-0 top-0 -z-10 opacity-0"
            aria-hidden="true"
          >
            <div className="px-5 pb-5">
              {(['active', 'pending', 'unpublished', 'catalogued'] as const).map(tab => (
                <div key={tab} ref={measureRefs[tab]} className="space-y-3 pr-2">
                  {categorizeCourses[tab].slice(0, 10).map(course => renderCourseRow(course, tab))}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
        <ScheduleViewModal
          courseId={scheduleCourse?.id ?? null}
          courseName={scheduleCourse?.name}
          onClose={() => setScheduleCourse(null)}
        />
      </Card>
    </div>
  )
}

// Generate ALL_COUNTRIES from REGIONS
const ALL_COUNTRIES = REGIONS.flatMap(region =>
  region.countries.map(country => ({
    code: country.code,
    name: country.name,
  }))
).sort((a, b) => a.name.localeCompare(b.name))

export default function TutorMyPage() {
  const params = useParams<{ locale?: string }>()
  const router = useRouter()
  const locale = typeof params?.locale === 'string' ? params.locale : 'en'
  const { update: updateSession } = useSession()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [creatingCourse, setCreatingCourse] = useState(false)
  const [courseName, setCourseName] = useState('')
  const [courseSubject, setCourseSubject] = useState('')
  const [courseDescription, setCourseDescription] = useState('')
  const [courseCategories, setCourseCategories] = useState<string[]>([])
  const [tutorSince, setTutorSince] = useState<string>('')
  const [country, setCountry] = useState<string>('')
  const [activeCourses, setActiveCourses] = useState<number | null>(null)
  const [profileCategories, setProfileCategories] = useState<string[]>([])
  const [editableCategories, setEditableCategories] = useState<string[]>([])
  const [publishedCourseCategories, setPublishedCourseCategories] = useState<string[]>([])
  const [socialAccounts, setSocialAccounts] = useState({
    youtube: '',
    instagram: '',
    tiktok: '',
    facebook: '',
    x: '',
    kakaoTalk: '',
  })
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(true)
  const profileScrollRef = useAutoScrollOnExpand(profileSettingsOpen, {
    delay: 350,
    block: 'nearest',
  })

  // Category selection state (3-level: Region → Country → Category)
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [categoryTab, setCategoryTab] = useState('global')
  const [categorySearch, setCategorySearch] = useState('')

  // Toggle functions for category selection
  const toggleRegion = (regionId: string) => {
    setSelectedRegions(prev => {
      const newRegions = prev.includes(regionId)
        ? prev.filter(r => r !== regionId)
        : [...prev, regionId]
      // Remove countries from unselected regions
      if (prev.includes(regionId)) {
        const region = REGIONS.find(r => r.id === regionId)
        if (region) {
          const countryCodes = region.countries.map(c => c.code)
          setSelectedCountries(prevCountries =>
            prevCountries.filter(c => !countryCodes.includes(c))
          )
        }
      }
      return newRegions
    })
  }

  const toggleCountry = (countryCode: string) => {
    setSelectedCountries(prev =>
      prev.includes(countryCode) ? prev.filter(c => c !== countryCode) : [...prev, countryCode]
    )
  }

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    )
  }

  // Available categories for course creation
  const aggregatedCategories = useMemo<string[]>(() => {
    const categories = new Set<string>([
      ...GLOBAL_EXAMS_CATEGORIES.flatMap(c => c.exams),
      ...AP_CATEGORIES.flatMap(c => c.exams),
      ...A_LEVEL_CATEGORIES.flatMap(c => c.exams),
      ...IB_CATEGORIES.flatMap(c => c.exams),
      ...IGCSE_CATEGORIES.flatMap(c => c.exams),
      ...profileCategories,
    ])
    return Array.from(categories).sort()
  }, [profileCategories])

  const availableCountries = useMemo<CountryData[]>(() => {
    if (selectedRegions.length === 0) return []
    const countries: CountryData[] = []
    selectedRegions.forEach(regionId => {
      const region = REGIONS.find(r => r.id === regionId)
      if (region) {
        countries.push(...region.countries)
      }
    })
    return countries
  }, [selectedRegions])

  const nationalExams = useMemo<ExamCategory[]>(() => {
    if (selectedCountries.length === 0) return []
    const exams: ExamCategory[] = []
    selectedCountries.forEach(countryCode => {
      const country = availableCountries.find(c => c.code === countryCode)
      if (country && country.nationalExams.length > 0) {
        exams.push(...country.nationalExams)
      }
    })
    return exams
  }, [selectedCountries, availableCountries])

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      try {
        // Load public profile
        const res = await fetch('/api/tutor/public-profile', { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load public profile')
        const data = await res.json()
        if (!active) return
        setDisplayName(data?.profile?.name || '')
        setUsername(data?.profile?.username || '')
        setBio(data?.profile?.bio || '')
        setAvatarUrl(data?.profile?.avatarUrl || null)
        setTutorSince(
          data?.profile?.createdAt ? new Date(data.profile.createdAt).toLocaleDateString() : ''
        )
        setCountry(data?.profile?.country || '')
        setActiveCourses(
          typeof data?.profile?.activeCourses === 'number' ? data.profile.activeCourses : null
        )
        const categories = Array.isArray(data?.profile?.categories) ? data.profile.categories : []
        setProfileCategories(categories)
        setEditableCategories(categories)
        const links = data?.profile?.socialLinks || {}
        const stripAt = (s: string) => s.replace(/^@+/, '')
        setSocialAccounts({
          youtube: typeof links.youtube === 'string' ? stripAt(links.youtube) : '',
          instagram: typeof links.instagram === 'string' ? stripAt(links.instagram) : '',
          tiktok: typeof links.tiktok === 'string' ? stripAt(links.tiktok) : '',
          facebook: typeof links.facebook === 'string' ? stripAt(links.facebook) : '',
          x: typeof links.x === 'string' ? stripAt(links.x) : '',
          kakaoTalk: typeof links.kakaoTalk === 'string' ? stripAt(links.kakaoTalk) : '',
        })
        // Derive categories from published courses
        const courses = Array.isArray(data?.courses) ? data.courses : []
        const categorySet = new Set<string>()
        for (const c of courses as Array<{ categories?: string[] }>) {
          for (const cat of c.categories || []) {
            categorySet.add(cat)
          }
        }
        setPublishedCourseCategories(Array.from(categorySet).sort())
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load data')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

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
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  const handleCopyProfile = () => {
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl)
    toast.success('Public URL copied')
  }

  const canShare =
    typeof navigator !== 'undefined' &&
    typeof (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share ===
      'function'

  const handleShareProfile = async () => {
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

  const save = async () => {
    const trimmedBio = bio.trim()
    if (trimmedBio.length > 800) {
      toast.error('Bio must be 800 characters or less')
      return
    }
    setSaving(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null
      const res = await fetch('/api/tutor/public-profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          bio: sanitizeHtmlWithMax(trimmedBio, 800),
          socialLinks: {
            instagram: socialAccounts.instagram.trim().replace(/^@+/, ''),
            tiktok: socialAccounts.tiktok.trim().replace(/^@+/, ''),
            youtube: socialAccounts.youtube.trim().replace(/^@+/, ''),
            facebook: socialAccounts.facebook.trim().replace(/^@+/, ''),
            x: socialAccounts.x.trim().replace(/^@+/, ''),
            kakaoTalk: socialAccounts.kakaoTalk.trim().replace(/^@+/, ''),
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Failed to save profile')
        return
      }
      setUsername(data?.profile?.username || username)
      setBio(data?.profile?.bio || bio)
      if (Array.isArray(data?.profile?.categories)) {
        setProfileCategories(data.profile.categories)
      }
      toast.success('Public page settings updated')
    } catch {
      toast.error('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const resetCourseForm = () => {
    setCourseName('')
    setCourseSubject('')
    setCourseDescription('')
    setCourseCategories([])
  }

  const toggleCourseCategory = (category: string) => {
    setCourseCategories(prev =>
      prev.includes(category) ? prev.filter(item => item !== category) : [...prev, category]
    )
  }

  const handleCreateCourse = async () => {
    if (!courseName.trim()) {
      toast.error('Course name is required')
      return
    }
    if (!courseSubject) {
      toast.error('Please choose a subject')
      return
    }
    if (courseCategories.length === 0) {
      toast.error('Select at least one category')
      return
    }

    setCreatingCourse(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch('/api/tutor/courses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          title: courseName.trim(),
          description: courseDescription.trim() || undefined,
          subject: courseSubject,
          categories: courseCategories,
          schedule: [],
          isLiveOnline: false,
        }),
      })

      const data = await res.json().catch(() => ({}))
      const createdCourse = data.courses?.[0]
      if (res.ok && createdCourse?.id) {
        toast.success('Course created! Opening builder...')
        setCreateOpen(false)
        resetCourseForm()
        router.push(`/tutor/insights?tab=builder&courseId=${createdCourse.id}&mode=edit`)
      } else {
        toast.error(data.error || 'Failed to create course')
      }
    } catch {
      toast.error('Failed to create course')
    } finally {
      setCreatingCourse(false)
    }
  }

  const headerCardClass =
    'group relative overflow-hidden rounded-[20px] p-[1px] shadow-[0_14px_45px_rgba(0,0,0,0.12)] transition-all duration-200 ease-in-out hover:shadow-[0_20px_60px_rgba(0,0,0,0.16)]'
  const headerInnerClass =
    'rounded-[20px] bg-[linear-gradient(135deg,#0B3A9B_0%,#1D4ED8_35%,#0A2F78_100%)] px-8 py-5 text-white'
  const panelCardClass =
    'group rounded-[18px] bg-white p-5 shadow-[0_14px_45px_rgba(0,0,0,0.12)] transition-all duration-200 ease-in-out hover:shadow-[0_20px_60px_rgba(0,0,0,0.16)]'

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-white text-[#1F2933]">
      <div className="w-full space-y-6 px-3 pt-2 lg:px-4 lg:pt-0">
        <section className={headerCardClass}>
          <div className={headerInnerClass}>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-5">
                <div className="relative">
                  <AvatarUploader
                    avatarUrl={avatarPreview ?? avatarUrl}
                    uploadUrl="/api/tutor/public-profile/avatar"
                    deleteUrl="/api/tutor/public-profile/avatar"
                    size={112}
                    fallbackText={
                      normalizedUsername ? normalizedUsername.slice(0, 2).toUpperCase() : 'TU'
                    }
                    onUploadSuccess={url => {
                      setAvatarUrl(url)
                      setAvatarPreview(null)
                      updateSession({ image: url }).catch(() => {})
                    }}
                    onDeleteSuccess={() => {
                      setAvatarUrl(null)
                      setAvatarPreview(null)
                      updateSession({ image: null }).catch(() => {})
                    }}
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="truncate text-3xl font-bold leading-tight text-white">
                      {displayName || normalizedUsername || 'Tutor'}
                    </h1>
                  </div>
                  <div className="mt-1 text-sm font-medium text-white/80">
                    @{normalizedUsername}
                  </div>

                  <div className="mt-4 inline-flex flex-wrap items-center gap-4 rounded-full bg-white/10 px-5 py-2.5 text-white ring-1 ring-white/15 backdrop-blur">
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-white/70" />
                      <div className="flex items-baseline gap-1 whitespace-nowrap leading-none">
                        <span className="text-xs font-semibold text-white/70">Tutor Since</span>
                        <span className="text-sm font-semibold">{tutorSince || '—'}</span>
                      </div>
                    </div>
                    <div className="hidden h-5 w-px bg-white/20 md:block" />
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-white/70" />
                      <div className="flex items-baseline gap-1 whitespace-nowrap leading-none">
                        <span className="text-xs font-semibold text-white/70">Active Courses</span>
                        <span className="text-sm font-semibold">{activeCourses ?? '—'}</span>
                      </div>
                    </div>
                    <div className="hidden h-5 w-px bg-white/20 md:block" />
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-white/70" />
                      <span className="text-xs font-semibold text-white/70">Country</span>
                      {country ? (
                        <CountryFlag
                          countryName={country}
                          size="xs"
                          showLabel
                          className="text-sm font-semibold text-white"
                          labelClassName="font-semibold text-white"
                        />
                      ) : (
                        <span className="text-sm font-semibold text-white">—</span>
                      )}
                    </div>
                    <div className="hidden h-5 w-px bg-white/20 md:block" />
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-semibold text-emerald-400">Verified</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex w-full max-w-md flex-col gap-3 rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 lg:w-auto">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  {publicUrl ? (
                    <Link
                      href={publicPath}
                      className="inline-flex w-full sm:w-auto"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button
                        size="lg"
                        className="w-full border border-white bg-[#F17623] text-white shadow-[0_4px_14px_rgba(0,0,0,0.2)] hover:translate-y-0 hover:border-[#F17623] hover:bg-white hover:text-[#F17623] sm:w-auto"
                      >
                        Preview Public Page
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      size="lg"
                      disabled
                      className="w-full border border-white/50 bg-[#F17623]/50 text-white/70 hover:translate-y-0 sm:w-auto"
                    >
                      Preview My Public Page
                    </Button>
                  )}

                  <Button
                    size="lg"
                    className="w-full border border-white bg-[#1D4ED8] text-white shadow-[0_4px_14px_rgba(0,0,0,0.12)] hover:translate-y-0 hover:bg-[#1F2933] hover:text-white hover:outline hover:outline-1 hover:outline-white sm:w-auto"
                    onClick={() => void save()}
                    disabled={loading || saving}
                  >
                    {saving ? 'Saving...' : 'Save Public Page'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2 lg:grid-rows-[auto_auto]">
          <div className={cn(panelCardClass, 'flex flex-col lg:col-start-1 lg:row-start-1')}>
            <div className="-mx-5 -mt-5 mb-4 flex h-14 items-center gap-3 rounded-t-[18px] bg-[linear-gradient(135deg,#0B3A9B_0%,#1D4ED8_35%,#0A2F78_100%)] px-5 text-white">
              <User className="h-5 w-5" />
              <span className="text-base font-semibold">Bio</span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <Textarea
                value={bio}
                readOnly
                className="h-full min-h-0 flex-1 resize-none border-slate-200 bg-white text-[18px] leading-relaxed text-slate-700"
                style={{ fontFamily: "'EB Garamond', 'Garamond', 'Times New Roman', serif" }}
              />
            </div>
          </div>

          <div className={cn(panelCardClass, 'flex flex-col lg:col-start-2 lg:row-start-1')}>
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
                  onClick={handleCopyProfile}
                  disabled={!publicUrl}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy Link
                </Button>
                {canShare ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border border-white bg-transparent text-xs text-white hover:border-blue-600 hover:bg-white hover:text-blue-600 hover:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    onClick={handleShareProfile}
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
                  <div className="text-lg font-semibold text-slate-900">
                    @{normalizedUsername || 'username'}
                  </div>
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
                Add a username in profile settings to generate your public link.
              </div>
            )}

            <div className="grid gap-4 pt-4 sm:grid-cols-2">
              {[
                {
                  key: 'tiktok',
                  label: 'TikTok',
                  value: socialAccounts.tiktok ? `@${socialAccounts.tiktok}` : '—',
                  icon: TikTokIcon,
                  bgClass: 'bg-black',
                  muted: !socialAccounts.tiktok,
                },
                {
                  key: 'youtube',
                  label: 'YouTube',
                  value: socialAccounts.youtube ? `@${socialAccounts.youtube}` : '—',
                  icon: Youtube,
                  bgClass: 'bg-red-600',
                  muted: !socialAccounts.youtube,
                },
                {
                  key: 'instagram',
                  label: 'Instagram',
                  value: socialAccounts.instagram ? `@${socialAccounts.instagram}` : '—',
                  icon: Instagram,
                  bgClass: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400',
                  muted: !socialAccounts.instagram,
                },
                {
                  key: 'kakaoTalk',
                  label: 'KakaoTalk',
                  value: socialAccounts.kakaoTalk
                    ? socialAccounts.kakaoTalk.match(/^https?:\/\//)
                      ? socialAccounts.kakaoTalk
                      : `https://${socialAccounts.kakaoTalk}`
                    : '—',
                  icon: KakaoTalkBrandIcon,
                  bgClass: 'bg-[#FEE500]',
                  muted: !socialAccounts.kakaoTalk,
                },
                {
                  key: 'facebook',
                  label: 'Facebook',
                  value: socialAccounts.facebook
                    ? socialAccounts.facebook.match(/^https?:\/\//)
                      ? socialAccounts.facebook
                      : `https://${socialAccounts.facebook}`
                    : '—',
                  icon: Facebook,
                  bgClass: 'bg-blue-600',
                  muted: !socialAccounts.facebook,
                },
                {
                  key: 'x',
                  label: 'X',
                  value: socialAccounts.x ? `@${socialAccounts.x}` : '—',
                  icon: XBrandIcon,
                  bgClass: 'bg-black',
                  muted: !socialAccounts.x,
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

          <div
            className={cn(
              panelCardClass,
              'flex flex-col lg:col-span-2 lg:col-start-1 lg:row-start-2'
            )}
          >
            <div className="-mx-5 -mt-5 mb-4 flex h-14 items-center gap-3 rounded-t-[18px] bg-[linear-gradient(135deg,#0B3A9B_0%,#1D4ED8_35%,#0A2F78_100%)] px-5 text-white">
              <Tags className="h-5 w-5" />
              <span className="text-base font-semibold">Categories</span>
              <span className="text-sm text-white/70">({publishedCourseCategories.length})</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {publishedCourseCategories.length > 0 ? (
                publishedCourseCategories.map((cat, i) => (
                  <span
                    key={`${cat}-${i}`}
                    className="rounded-full border border-slate-100 bg-slate-50 px-4 py-1.5 text-sm font-medium text-slate-700"
                  >
                    {cat}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">
                  Categories appear here after you publish a course
                </span>
              )}
            </div>
          </div>
        </div>

        <div ref={profileScrollRef}>
          <Card className="border border-[#E2E8F0] bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
            <div
              className={cn(
                charcoalHeaderClass,
                'panel-header-hover cursor-pointer select-none justify-between'
              )}
              onClick={() => setProfileSettingsOpen(prev => !prev)}
            >
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5" />
                <span className="text-base font-semibold">Profile Settings</span>
              </div>
              {profileSettingsOpen ? (
                <ChevronUp className="h-4 w-4 text-white/70" />
              ) : (
                <ChevronDown className="h-4 w-4 text-white/70" />
              )}
            </div>
            {profileSettingsOpen && (
              <CardContent spacing="none" className="space-y-4 bg-white px-6 py-4">
                <div className="grid gap-3 lg:grid-cols-2 lg:items-stretch">
                  <div className="flex min-h-[380px] flex-col gap-2 lg:min-h-0">
                    <Label className="text-sm text-[#1F2933]">Bio</Label>
                    <Textarea
                      value={bio}
                      onChange={e => {
                        const val = e.target.value
                        if (val.length <= 800) {
                          setBio(val)
                        }
                      }}
                      disabled={loading || saving}
                      placeholder="Short bio for your public page..."
                      maxLength={800}
                      className="min-h-[280px] flex-1 resize-none border-[#E2E8F0] focus-visible:ring-[#1D4ED8]"
                    />
                    <span
                      className={
                        bio.length > 800
                          ? 'text-xs font-medium text-red-500'
                          : 'text-xs text-slate-400'
                      }
                    >
                      {bio.length}/800
                    </span>
                  </div>

                  <div className="flex min-h-[250px] flex-col gap-2 lg:min-h-0">
                    <Label className="text-sm text-[#1F2933]">Edit Social Media</Label>
                    <div className="grid gap-2.5 md:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <TikTokIcon className="h-9 w-9 shrink-0 text-[#64748B]" />
                        <div className="flex flex-1 rounded-md border border-[#E2E8F0] focus-within:outline-none focus-within:ring-0">
                          <span className="inline-flex items-center pl-3 text-[#64748B]">@</span>
                          <Input
                            placeholder="username"
                            value={socialAccounts.tiktok.replace(/^@+/, '')}
                            onChange={e =>
                              setSocialAccounts(prev => ({
                                ...prev,
                                tiktok: e.target.value.replace(/^@+/, ''),
                              }))
                            }
                            disabled={loading || saving}
                            className="border-0 pl-0 !outline-none !ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Youtube className="h-9 w-9 shrink-0 text-[#64748B]" />
                        <div className="flex flex-1 rounded-md border border-[#E2E8F0] focus-within:outline-none focus-within:ring-0">
                          <span className="inline-flex items-center pl-3 text-[#64748B]">@</span>
                          <Input
                            placeholder="username"
                            value={socialAccounts.youtube.replace(/^@+/, '')}
                            onChange={e =>
                              setSocialAccounts(prev => ({
                                ...prev,
                                youtube: e.target.value.replace(/^@+/, ''),
                              }))
                            }
                            disabled={loading || saving}
                            className="border-0 pl-0 !outline-none !ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Instagram className="h-9 w-9 shrink-0 text-[#64748B]" />
                        <div className="flex flex-1 rounded-md border border-[#E2E8F0] focus-within:outline-none focus-within:ring-0">
                          <span className="inline-flex items-center pl-3 text-[#64748B]">@</span>
                          <Input
                            placeholder="username"
                            value={socialAccounts.instagram.replace(/^@+/, '')}
                            onChange={e =>
                              setSocialAccounts(prev => ({
                                ...prev,
                                instagram: e.target.value.replace(/^@+/, ''),
                              }))
                            }
                            disabled={loading || saving}
                            className="border-0 pl-0 !outline-none !ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Facebook className="h-9 w-9 shrink-0 text-[#64748B]" />
                        <div className="flex flex-1 rounded-md border border-[#E2E8F0] focus-within:outline-none focus-within:ring-0">
                          <span className="inline-flex items-center pl-3 text-xs text-[#64748B]">
                            https://
                          </span>
                          <Input
                            placeholder="username"
                            value={socialAccounts.facebook.replace(/^@+/, '')}
                            onChange={e =>
                              setSocialAccounts(prev => ({
                                ...prev,
                                facebook: e.target.value.replace(/^@+/, ''),
                              }))
                            }
                            disabled={loading || saving}
                            className="border-0 pl-0 !outline-none !ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <XBrandIcon className="h-9 w-9 shrink-0 text-[#64748B]" />
                        <div className="flex flex-1 rounded-md border border-[#E2E8F0] focus-within:outline-none focus-within:ring-0">
                          <span className="inline-flex items-center pl-3 text-[#64748B]">@</span>
                          <Input
                            placeholder="username"
                            value={socialAccounts.x.replace(/^@+/, '')}
                            onChange={e =>
                              setSocialAccounts(prev => ({
                                ...prev,
                                x: e.target.value.replace(/^@+/, ''),
                              }))
                            }
                            disabled={loading || saving}
                            className="border-0 pl-0 !outline-none !ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <KakaoTalkIcon className="h-9 w-9 shrink-0 text-[#64748B]" />
                        <div className="flex flex-1 rounded-md border border-[#E2E8F0] focus-within:outline-none focus-within:ring-0">
                          <span className="inline-flex items-center pl-3 text-xs text-[#64748B]">
                            https://
                          </span>
                          <Input
                            value={socialAccounts.kakaoTalk.replace(/^@+/, '')}
                            onChange={e =>
                              setSocialAccounts(prev => ({
                                ...prev,
                                kakaoTalk: e.target.value.replace(/^@+/, ''),
                              }))
                            }
                            disabled={loading || saving}
                            className="border-0 pl-0 !outline-none !ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        {/* My Courses Section */}
        <MyCoursesSection />
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={open => {
          setCreateOpen(open)
          if (!open) resetCourseForm()
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create a new course</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Course name</Label>
              <Input
                value={courseName}
                onChange={e => setCourseName(e.target.value)}
                placeholder="e.g. AP Calculus Mastery"
                disabled={creatingCourse}
              />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Select
                value={courseSubject}
                onValueChange={setCourseSubject}
                disabled={creatingCourse}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a subject" />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map(subject => (
                    <SelectItem key={subject.value} value={subject.value}>
                      {subject.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={courseDescription}
                onChange={e => setCourseDescription(e.target.value)}
                placeholder="Short description for your course..."
                disabled={creatingCourse}
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Categories</Label>
                <span className="text-xs text-[#64748B]">{courseCategories.length} selected</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {aggregatedCategories.map(category => {
                  const active = courseCategories.includes(category)
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => toggleCourseCategory(category)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        active
                          ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white'
                          : 'border-[#E2E8F0] text-[#1F2933] hover:border-[#1D4ED8]'
                      }`}
                    >
                      {category}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="modal-secondary-dark"
              onClick={() => setCreateOpen(false)}
              disabled={creatingCourse}
            >
              Cancel
            </Button>
            <Button
              variant="modal-primary-dark"
              onClick={handleCreateCourse}
              disabled={creatingCourse}
            >
              {creatingCourse ? 'Creating...' : 'Create Course'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
