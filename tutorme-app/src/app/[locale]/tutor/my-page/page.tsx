'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type SVGProps,
  type PointerEvent,
} from 'react'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
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
  Plus,
  MoreVertical,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  RotateCcw,
  User,
  Link2,
  PanelsTopLeft,
  ExternalLink,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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

function MyCoursesSection({ onCreateCourse }: { onCreateCourse: () => void }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'active' | 'unpublished' | 'catalogued'>('active')
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
    const unpublished: Course[] = []
    const catalogued: Course[] = []

    for (const course of courses) {
      if (!course.isPublished) {
        unpublished.push(course)
      } else if (!course.upcomingSessionsCount && (course.hasSessions || course.hasStudents)) {
        // Course was published and had sessions or students in the past,
        // but has no upcoming sessions
        catalogued.push(course)
      } else {
        active.push(course)
      }
    }

    return { active, unpublished, catalogued }
  }, [courses])

  // Filter courses based on tab
  const filteredCourses = useMemo(() => {
    switch (activeTab) {
      case 'active':
        return categorizeCourses.active
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
      unpublished: categorizeCourses.unpublished.length,
      catalogued: categorizeCourses.catalogued.length,
    }),
    [categorizeCourses]
  )

  return (
    <Card className="border border-[#E2E8F0] bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
      <div className={cn(charcoalHeaderClass, 'justify-between')}>
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5" />
          <span className="text-base font-semibold">My Courses</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 border-white/30 bg-white/10 text-xs text-white hover:bg-white/20 hover:text-white"
          onClick={onCreateCourse}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Create Course
        </Button>
      </div>
      <CardContent spacing="none" className="space-y-4 px-6 pb-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-[#E2E8F0] bg-white">
          {(['active', 'unpublished', 'catalogued'] as const).map(tab => (
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
        <div className="max-h-[400px] overflow-y-auto pr-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1D4ED8] border-t-transparent" />
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="py-8 text-center">
              <BookOpen className="mx-auto h-12 w-12 text-[#CBD5E1]" />
              <p className="mt-2 text-sm text-[#64748B]">
                {activeTab === 'active'
                  ? 'No published courses yet'
                  : activeTab === 'unpublished'
                    ? 'No unpublished courses'
                    : 'No catalogued courses'}
              </p>
              {activeTab === 'active' && (
                <Button
                  onClick={onCreateCourse}
                  variant="outline"
                  className="mt-4 text-slate-700"
                  size="sm"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Create your first course
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCourses.map(course => (
                <div
                  key={course.id}
                  className="rounded-xl border border-[#E2E8F0] p-4 hover:border-slate-500"
                  style={{
                    background: 'linear-gradient(135deg, #1E2832 0%, #2D3B4A 50%, #1A2530 100%)',
                  }}
                >
                  {(() => {
                    const hasDesc = course.isPublished && course.description
                    const showNationality = course.nationality && course.nationality !== 'Global'
                    return (
                      <div className={cn('flex', hasDesc ? 'gap-4' : 'flex-col gap-2')}>
                        {/* Left: title + metadata */}
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className={cn('flex min-w-0 items-center gap-2', !hasDesc && 'justify-between')}>
                            <div className="flex min-w-0 items-center gap-2">
                              <h4 className="truncate font-medium text-white">{course.name}</h4>
                              {activeTab === 'catalogued' ? (
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
                            {!hasDesc && (
                              <div className="flex shrink-0 items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const prefix = window.location.pathname.replace(
                                      /\/tutor\/my-page\/?$/,
                                      ''
                                    )
                                    router.push(
                                      `${prefix}/tutor/insights?tab=builder&courseId=${course.id}`
                                    )
                                  }}
                                  className="text-blue-400 hover:bg-white/10"
                                >
                                  <Edit3 className="mr-1 h-4 w-4" />
                                  Edit
                                </Button>
                                {activeTab !== 'catalogued' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleTogglePublish(course)}
                                    className={
                                      course.isPublished
                                        ? 'text-amber-400 hover:bg-white/10'
                                        : 'text-emerald-400 hover:bg-white/10'
                                    }
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
                                  size="icon"
                                  onClick={() => handleDeleteCourse(course.id)}
                                  className="text-red-400 hover:bg-white/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                          {showNationality && (
                            <p className="mt-0.5 text-sm font-medium text-blue-400">
                              {course.variantCategory || (course.categories || [])[0] || 'General'} —{' '}
                              {course.nationality}
                            </p>
                          )}
                          <p className="mt-1 text-sm text-slate-300">
                            {showNationality
                              ? `${course.studentCount || 0} students • Updated ${new Date(course.updatedAt).toLocaleDateString()}`
                              : `${(course.categories || [])[0] || 'Untitled'} • ${course.studentCount || 0} students • Updated ${new Date(course.updatedAt).toLocaleDateString()}`}
                          </p>
                          {activeTab === 'catalogued' && course.lastSessionDate && (
                            <p className="mt-1 text-xs text-slate-400">
                              Last session: {new Date(course.lastSessionDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>

                        {/* Middle: action buttons (top-aligned) */}
                        {hasDesc && (
                          <div className="flex shrink-0 items-center gap-2 self-start">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const prefix = window.location.pathname.replace(
                                  /\/tutor\/my-page\/?$/,
                                  ''
                                )
                                router.push(
                                  `${prefix}/tutor/insights?tab=builder&courseId=${course.id}`
                                )
                              }}
                              className="text-blue-400 hover:bg-white/10"
                            >
                              <Edit3 className="mr-1 h-4 w-4" />
                              Edit
                            </Button>
                            {activeTab !== 'catalogued' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleTogglePublish(course)}
                                className={
                                  course.isPublished
                                    ? 'text-amber-400 hover:bg-white/10'
                                    : 'text-emerald-400 hover:bg-white/10'
                                }
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
                              size="icon"
                              onClick={() => handleDeleteCourse(course.id)}
                              className="text-red-400 hover:bg-white/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}

                        {/* Right: description */}
                        {hasDesc && (
                          <div className="w-[520px] shrink-0 rounded-lg bg-white p-3">
                            <p className="line-clamp-3 text-sm text-slate-700">
                              {course.description}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const locale = typeof params?.locale === 'string' ? params.locale : 'en'
  const { update: updateSession } = useSession()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [cropDialogOpen, setCropDialogOpen] = useState(false)
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null)
  const [cropSourceFile, setCropSourceFile] = useState<File | null>(null)
  const cropViewportRef = useRef<HTMLDivElement | null>(null)
  const cropImageRef = useRef<HTMLImageElement | null>(null)
  const cropDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startOffsetX: number
    startOffsetY: number
  } | null>(null)
  const [cropImageSize, setCropImageSize] = useState<{ width: number; height: number } | null>(null)
  const [cropViewportSize, setCropViewportSize] = useState(0)
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 })
  const [cropZoom, setCropZoom] = useState(1)
  const [cropError, setCropError] = useState<string | null>(null)
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null)
  const [cropping, setCropping] = useState(false)
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
  })
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(true)

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

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null)
      return
    }
    const previewUrl = URL.createObjectURL(avatarFile)
    setAvatarPreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [avatarFile])

  useEffect(() => {
    if (!cropSourceUrl) {
      cropImageRef.current = null
      setCropImageSize(null)
      setCroppedPreviewUrl(null)
      return
    }

    let active = true
    const img = new Image()
    img.src = cropSourceUrl
    img.onload = () => {
      if (!active) return
      cropImageRef.current = img
      setCropImageSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      if (!active) return
      cropImageRef.current = null
      setCropImageSize(null)
      setCroppedPreviewUrl(null)
      setCropError('Invalid image file')
    }

    return () => {
      active = false
    }
  }, [cropSourceUrl])

  useEffect(() => {
    if (!cropDialogOpen) return
    const el = cropViewportRef.current
    if (!el) return

    const measure = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0) setCropViewportSize(Math.round(rect.width))
    }

    measure()
    requestAnimationFrame(measure)

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }

    const ro = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry) return
      setCropViewportSize(Math.round(entry.contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [cropDialogOpen])

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

  const getCropData = () => {
    if (!cropImageSize) return null

    // Measure on demand if ResizeObserver hasn't fired yet
    let viewportSize = cropViewportSize
    if (!viewportSize && cropViewportRef.current) {
      const rect = cropViewportRef.current.getBoundingClientRect()
      viewportSize = Math.round(rect.width)
      if (viewportSize > 0) setCropViewportSize(viewportSize)
    }
    if (!viewportSize) return null

    const baseScale = Math.max(
      viewportSize / cropImageSize.width,
      viewportSize / cropImageSize.height
    )
    const scale = baseScale * cropZoom
    const displayW = cropImageSize.width * scale
    const displayH = cropImageSize.height * scale
    const maxOffsetX = Math.max(0, (displayW - viewportSize) / 2)
    const maxOffsetY = Math.max(0, (displayH - viewportSize) / 2)
    const offsetX = clamp(cropOffset.x, -maxOffsetX, maxOffsetX)
    const offsetY = clamp(cropOffset.y, -maxOffsetY, maxOffsetY)

    const imgLeft = (viewportSize - displayW) / 2 + offsetX
    const imgTop = (viewportSize - displayH) / 2 + offsetY

    const sx = (0 - imgLeft) / scale
    const sy = (0 - imgTop) / scale
    const side = viewportSize / scale

    const x = Math.round(clamp(sx, 0, cropImageSize.width - 1))
    const y = Math.round(clamp(sy, 0, cropImageSize.height - 1))
    const maxSide = Math.min(cropImageSize.width - x, cropImageSize.height - y)
    const size = Math.round(clamp(side, 1, maxSide))

    return {
      x,
      y,
      width: size,
      height: size,
      originalWidth: cropImageSize.width,
      originalHeight: cropImageSize.height,
    }
  }

  const maxCropZoom = useMemo(() => {
    if (!cropImageSize || !cropViewportSize) return 1
    const baseScale = Math.max(
      cropViewportSize / cropImageSize.width,
      cropViewportSize / cropImageSize.height
    )
    const maxByMinCrop = cropViewportSize / (baseScale * 256)
    return Math.max(1, Number.isFinite(maxByMinCrop) ? maxByMinCrop : 1)
  }, [cropImageSize, cropViewportSize])

  useEffect(() => {
    setCropZoom(prev => clamp(prev, 1, maxCropZoom))
  }, [maxCropZoom])

  useEffect(() => {
    if (!cropImageSize || !cropViewportSize) return
    const baseScale = Math.max(
      cropViewportSize / cropImageSize.width,
      cropViewportSize / cropImageSize.height
    )
    const scale = baseScale * cropZoom
    const displayW = cropImageSize.width * scale
    const displayH = cropImageSize.height * scale
    const maxOffsetX = Math.max(0, (displayW - cropViewportSize) / 2)
    const maxOffsetY = Math.max(0, (displayH - cropViewportSize) / 2)
    setCropOffset(prev => ({
      x: clamp(prev.x, -maxOffsetX, maxOffsetX),
      y: clamp(prev.y, -maxOffsetY, maxOffsetY),
    }))
  }, [cropImageSize, cropViewportSize, cropZoom])

  const handleCropPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (cropping || uploadingAvatar) return
      e.currentTarget.setPointerCapture(e.pointerId)
      cropDragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startOffsetX: cropOffset.x,
        startOffsetY: cropOffset.y,
      }
    },
    [cropping, uploadingAvatar, cropOffset.x, cropOffset.y]
  )

  const handleCropPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    setCropOffset({ x: drag.startOffsetX + dx, y: drag.startOffsetY + dy })
  }, [])

  const handleCropPointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    cropDragRef.current = null
  }, [])

  useEffect(() => {
    if (!cropSourceUrl || !cropDialogOpen) return
    if (!cropImageSize || !cropViewportSize) return

    let active = true
    let objectUrlToRevoke: string | null = null

    const generatePreview = async () => {
      const img = cropImageRef.current
      if (!img) return
      const cropData = getCropData()
      if (!cropData) return

      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(img, cropData.x, cropData.y, cropData.width, cropData.height, 0, 0, 256, 256)

      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/webp', 0.85)
      )
      if (!active || !blob) return

      objectUrlToRevoke = URL.createObjectURL(blob)
      setCroppedPreviewUrl(objectUrlToRevoke)
    }

    void generatePreview().catch(() => {
      if (!active) return
      setCroppedPreviewUrl(null)
    })

    return () => {
      active = false
      if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke)
    }
  }, [cropSourceUrl, cropDialogOpen, cropImageSize, cropViewportSize, cropOffset, cropZoom])

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

  const MAX_AVATAR_SIZE_BYTES = 10 * 1024 * 1024
  const ACCEPTED_AVATAR_MIME = ['image/jpeg', 'image/png', 'image/webp']

  const isAcceptedAvatarFile = (file: File) => {
    const byMime = ACCEPTED_AVATAR_MIME.includes(file.type)
    if (byMime) return true
    const name = file.name.toLowerCase()
    return (
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.png') ||
      name.endsWith('.webp')
    )
  }

  const handleAvatarSelect = async (file: File) => {
    if (!isAcceptedAvatarFile(file)) {
      toast.error('Accepted formats: JPG, PNG, WEBP only')
      return
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      toast.error('Maximum size is 10 MB')
      return
    }

    if (cropSourceUrl) URL.revokeObjectURL(cropSourceUrl)
    setCroppedPreviewUrl(null)
    setCropDialogOpen(false)
    setCropError(null)
    setCropOffset({ x: 0, y: 0 })
    setCropZoom(1)
    const objectUrl = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = objectUrl
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load image'))
      })

      if (img.naturalWidth < 512 || img.naturalHeight < 512) {
        toast.error('Minimum dimensions: 512 × 512 px')
        URL.revokeObjectURL(objectUrl)
        return
      }

      cropImageRef.current = img
      setCropImageSize({ width: img.naturalWidth, height: img.naturalHeight })
      setCropSourceUrl(objectUrl)
      setCropSourceFile(file)
      setCropDialogOpen(true)

      // Pre-measure viewport as soon as dialog opens so the upload button
      // is not blocked waiting for the ResizeObserver.
      requestAnimationFrame(() => {
        const el = cropViewportRef.current
        if (el) {
          const rect = el.getBoundingClientRect()
          if (rect.width > 0) setCropViewportSize(Math.round(rect.width))
        }
      })
    } catch {
      toast.error('Invalid image file')
      URL.revokeObjectURL(objectUrl)
    }
  }

  const uploadAvatarFile = async (file: File) => {
    setAvatarFile(file)
    setUploadingAvatar(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const formData = new FormData()
      formData.set('avatar', file)

      const res = await fetch('/api/tutor/public-profile/avatar', {
        method: 'POST',
        headers: {
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Failed to upload photo')
        return
      }
      const newUrl = data?.avatarUrl ?? data?.url ?? null
      if (!newUrl || typeof newUrl !== 'string') {
        toast.error('Upload succeeded but no photo URL was returned. Please try again.')
        return
      }
      let fullUrl =
        newUrl.startsWith('/') && typeof window !== 'undefined'
          ? `${window.location.origin}${newUrl}`
          : newUrl
      // Cache-bust so browsers don't reuse a stale/404 cached image
      const sep = fullUrl.includes('?') ? '&' : '?'
      fullUrl = `${fullUrl}${sep}t=${Date.now()}`
      setAvatarUrl(fullUrl)
      setAvatarPreview(null)
      setAvatarFile(null)
      await updateSession({ image: fullUrl }).catch(() => {
        // Non-critical: session will refresh on next page load
      })
      toast.success('Profile photo updated')
    } catch {
      toast.error('Failed to upload photo')
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const closeCropDialog = () => {
    setCropDialogOpen(false)
    setCropping(false)
    setCropError(null)
    setCropZoom(1)
    setCropOffset({ x: 0, y: 0 })
    setCropViewportSize(0)
    cropImageRef.current = null
    setCropImageSize(null)
    setCropSourceUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setCropSourceFile(null)
    setCroppedPreviewUrl(null)
  }

  const confirmCropAndUpload = async () => {
    if (!cropSourceUrl || !cropSourceFile) return
    const cropData = getCropData()
    if (!cropData) {
      setCropError('Crop is not ready yet. Please wait a moment and try again.')
      return
    }
    if (cropData.width < 256 || cropData.height < 256) {
      setCropError('Crop is too small (min 256 × 256)')
      return
    }

    setCropping(true)
    try {
      // Generate the cropped image from canvas and upload the blob
      const img = cropImageRef.current
      if (!img) {
        setCropError('Image is no longer available. Please select again.')
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 512
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setCropError('Failed to process image')
        return
      }
      ctx.drawImage(img, cropData.x, cropData.y, cropData.width, cropData.height, 0, 0, 512, 512)

      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/png', 0.95)
      )
      if (!blob) {
        setCropError('Failed to generate cropped image')
        return
      }
      const croppedFile = new File([blob], 'avatar.png', { type: 'image/png' })
      await uploadAvatarFile(croppedFile)
      closeCropDialog()
    } catch {
      toast.error('Failed to crop/upload photo')
    } finally {
      setCropping(false)
    }
  }

  const handleDeleteAvatar = async () => {
    if (!confirm('Are you sure you want to delete your profile photo?')) return
    setUploadingAvatar(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch('/api/tutor/public-profile/avatar', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Failed to delete photo')
        return
      }
      setAvatarUrl(null)
      await updateSession({ image: null }).catch(() => {
        // Non-critical: session will refresh on next page load
      })
      toast.success('Profile photo deleted')
    } catch {
      toast.error('Failed to delete photo')
    } finally {
      setUploadingAvatar(false)
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

  // Quick create course - skip form and go directly to builder
  const handleQuickCreateCourse = async () => {
    setCreatingCourse(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const defaultSubject = 'math'
      const defaultCategory = selectedCategories.length > 0 ? selectedCategories[0] : undefined

      const res = await fetch('/api/tutor/courses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          title: 'Untitled Course',
          description: '',
          categories: defaultCategory ? [defaultCategory] : [],
          schedule: [],
          isLiveOnline: false,
        }),
      })

      const data = await res.json().catch(() => ({}))
      const createdCourse = data.courses?.[0]
      if (res.ok && createdCourse?.id) {
        toast.success('Course created! Opening builder...')
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
    'group relative overflow-hidden rounded-[20px] p-[1px] shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-200 ease-in-out hover:shadow-[0_24px_80px_rgba(0,0,0,0.22)]'
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
    <div
      className="min-h-screen bg-white text-[#1F2933]"
      style={{ '--density-scale': '0.9' } as React.CSSProperties}
    >

      <div className="w-full space-y-[calc(2rem*var(--density-scale,1))] px-6 pt-2 pb-[calc(2rem*var(--density-scale,1))]">
        <section className={headerCardClass}>
          <div className={headerInnerClass}>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-5">
                <div className="relative">
                  <Avatar className="h-28 w-28 rounded-2xl border border-white/40 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                    <AvatarImage
                      src={avatarPreview ?? avatarUrl ?? undefined}
                      alt="Tutor avatar"
                      onError={() => {
                        console.error('Avatar failed to load:', avatarUrl)
                      }}
                    />
                    <AvatarFallback className="rounded-2xl bg-white/15 text-lg font-semibold text-white">
                      {normalizedUsername ? normalizedUsername.slice(0, 2).toUpperCase() : 'TU'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute bottom-2 right-2 flex -space-x-2">
                    <Button
                      size="icon"
                      className="h-8 w-8 rounded-full border border-white/40 bg-white text-[#1F2933] shadow hover:bg-white/90"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      aria-label="Edit profile photo"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {avatarUrl && (
                      <Button
                        size="icon"
                        className="h-8 w-8 rounded-full border border-white/40 bg-red-500 text-white shadow hover:bg-red-600"
                        onClick={() => void handleDeleteAvatar()}
                        disabled={uploadingAvatar}
                        aria-label="Delete profile photo"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) void handleAvatarSelect(file)
                    }}
                    className="hidden"
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="truncate text-3xl font-bold leading-tight text-white">
                      {displayName || normalizedUsername || 'Tutor'}
                    </h1>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-semibold text-emerald-50 ring-1 ring-emerald-300/30">
                      <CheckCircle className="h-4 w-4" />
                      Verified
                    </span>
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
                      <div className="flex items-baseline gap-1 whitespace-nowrap leading-none">
                        <span className="text-xs font-semibold text-white/70">Country</span>
                        <span className="text-sm font-semibold">{country || '—'}</span>
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
                        className="w-full border-0 bg-[#F17623] text-white shadow-[0_4px_14px_rgba(0,0,0,0.2)] hover:bg-white hover:text-[#F17623] sm:w-auto"
                      >
                        Preview My Public Page
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      size="lg"
                      disabled
                      className="w-full border-0 bg-[#F17623]/50 text-white/70 sm:w-auto"
                    >
                      Preview My Public Page
                    </Button>
                  )}

                  <Button
                    size="lg"
                    className="w-full border-0 bg-white text-[#1D4ED8] shadow-[0_4px_14px_rgba(0,0,0,0.12)] hover:bg-[#1F2933] hover:text-white sm:w-auto"
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

        <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch">
          <div className={cn(panelCardClass, 'flex h-full flex-col')}>
            <div className="flex h-14 items-center gap-3 bg-[linear-gradient(135deg,#0B3A9B_0%,#1D4ED8_35%,#0A2F78_100%)] -mx-5 -mt-5 px-5 rounded-t-[18px] text-white mb-4">
              <User className="h-5 w-5" />
              <span className="text-base font-semibold">Bio</span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <Textarea
                value={bio}
                readOnly
                className="h-full min-h-[420px] flex-1 resize-none border-slate-200 bg-white text-base leading-relaxed text-slate-700 lg:min-h-0"
              />
            </div>
          </div>

          <div className="flex h-full flex-col gap-5">
            <div className={panelCardClass}>
              <div className="flex h-14 items-center justify-between bg-[linear-gradient(135deg,#0B3A9B_0%,#1D4ED8_35%,#0A2F78_100%)] -mx-5 -mt-5 px-5 rounded-t-[18px] text-white mb-4">
                <div className="flex items-center gap-3">
                  <Link2 className="h-5 w-5" />
                  <span className="text-base font-semibold">Connect</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-white bg-transparent text-xs text-white hover:bg-white hover:text-blue-600 focus-visible:ring-0 focus-visible:ring-offset-0"
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
                      className="h-8 border-white bg-transparent text-xs text-white hover:bg-white hover:text-blue-600 focus-visible:ring-0 focus-visible:ring-offset-0"
                      onClick={handleShareProfile}
                    >
                      <Share2 className="mr-1.5 h-3.5 w-3.5" />
                      Share
                    </Button>
                  ) : null}
                </div>
              </div>

              {publicUrl ? (
                <div className="flex items-center gap-4 border-b border-slate-100 py-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <span className="text-2xl font-bold">@</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-slate-900">@{normalizedUsername || 'username'}</div>
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                    >
                      {publicUrl}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
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
                    key: 'facebook',
                    label: 'Facebook',
                    value: socialAccounts.facebook
                      ? (socialAccounts.facebook.match(/^https?:\/\//)
                          ? socialAccounts.facebook
                          : `https://${socialAccounts.facebook}`)
                      : '—',
                    icon: Facebook,
                    bgClass: 'bg-blue-600',
                    muted: !socialAccounts.facebook,
                  },
                ].map(item => {
                  const Icon = item.icon
                  return (
                    <div key={item.key} className="flex items-center gap-4">
                      <div className={cn(
                        'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                        item.bgClass,
                        item.muted && 'opacity-40'
                      )}>
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-slate-900">
                          {item.label}
                          <span className={cn('ml-2 font-normal', item.muted ? 'text-slate-400' : 'text-slate-600')}>
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
              <div className="flex h-14 items-center gap-3 bg-[linear-gradient(135deg,#0B3A9B_0%,#1D4ED8_35%,#0A2F78_100%)] -mx-5 -mt-5 px-5 rounded-t-[18px] text-white mb-4">
                <PanelsTopLeft className="h-5 w-5" />
                <span className="text-base font-semibold">Categories</span>
                <span className="text-sm text-white/70">({publishedCourseCategories.length})</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {publishedCourseCategories.length > 0 ? (
                  publishedCourseCategories.map((cat, i) => (
                    <span
                      key={`${cat}-${i}`}
                      className="rounded-full bg-slate-50 px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-100"
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
        </div>

        {/* Avatar crop/upload dialog (client-side validation + centered square crop) */}
        <Dialog
          open={cropDialogOpen}
          onOpenChange={open => {
            if (!open) closeCropDialog()
            setCropDialogOpen(open)
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Crop Profile Photo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {cropError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {cropError}
                </div>
              ) : null}

              {cropSourceUrl ? (
                <div
                  ref={cropViewportRef}
                  className="relative mx-auto w-full max-w-[360px] touch-none select-none overflow-hidden rounded-xl border border-[#E2E8F0] bg-white"
                  style={{ aspectRatio: '1 / 1' }}
                  onPointerDown={handleCropPointerDown}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                  onPointerCancel={handleCropPointerUp}
                >
                  <img
                    src={cropSourceUrl}
                    alt="Avatar crop"
                    className="absolute left-1/2 top-1/2 max-w-none select-none"
                    draggable={false}
                    style={{
                      transform: `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${
                        cropImageSize && cropViewportSize
                          ? cropZoom *
                            Math.max(
                              cropViewportSize / cropImageSize.width,
                              cropViewportSize / cropImageSize.height
                            )
                          : 1
                      })`,
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 ring-2 ring-[#1D4ED8]/70" />
                </div>
              ) : null}

              {cropSourceUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-[#1F2933]">Zoom</div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-2 border-slate-300 bg-white text-gray-900 hover:bg-slate-50"
                      onClick={() => {
                        setCropError(null)
                        setCropZoom(1)
                        setCropOffset({ x: 0, y: 0 })
                      }}
                      disabled={cropping || uploadingAvatar}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset
                    </Button>
                  </div>
                  <Slider
                    min={1}
                    max={maxCropZoom}
                    step={0.01}
                    value={[cropZoom]}
                    onValueChange={v => setCropZoom(v[0] ?? 1)}
                    disabled={cropping || uploadingAvatar}
                  />
                </div>
              ) : null}

              {croppedPreviewUrl ? (
                <div className="flex items-center gap-4">
                  <div className="text-sm font-medium text-[#1F2933]">Preview (256x256)</div>
                  <img
                    src={croppedPreviewUrl}
                    alt="Cropped avatar preview"
                    className="h-20 w-20 rounded-lg border border-[#E2E8F0] object-cover"
                  />
                </div>
              ) : null}
              <p className="text-xs text-[#64748B]">
                Drag to position. Crop is locked to 1:1 and will upload exactly as previewed.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="modal-secondary"
                onClick={closeCropDialog}
                disabled={cropping || uploadingAvatar}
              >
                Cancel
              </Button>
              <Button
                variant="modal-primary"
                onClick={() => void confirmCropAndUpload()}
                disabled={
                  cropping || uploadingAvatar || !cropSourceUrl || !cropSourceFile || !cropImageSize
                }
              >
                {cropping ? 'Cropping...' : 'Crop & Upload'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card className="border border-[#E2E8F0] bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
          <div
            className={cn(charcoalHeaderClass, 'cursor-pointer select-none justify-between')}
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
                        <div className="flex flex-1 rounded-md border border-[#E2E8F0] focus-within:ring-2 focus-within:ring-[#1D4ED8] focus-within:ring-offset-0">
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
                            className="border-0 pl-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Youtube className="h-9 w-9 shrink-0 text-[#64748B]" />
                        <div className="flex flex-1 rounded-md border border-[#E2E8F0] focus-within:ring-2 focus-within:ring-[#1D4ED8] focus-within:ring-offset-0">
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
                            className="border-0 pl-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Instagram className="h-9 w-9 shrink-0 text-[#64748B]" />
                        <div className="flex flex-1 rounded-md border border-[#E2E8F0] focus-within:ring-2 focus-within:ring-[#1D4ED8] focus-within:ring-offset-0">
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
                            className="border-0 pl-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Facebook className="h-9 w-9 shrink-0 text-[#64748B]" />
                        <div className="flex flex-1 rounded-md border border-[#E2E8F0] focus-within:ring-2 focus-within:ring-[#1D4ED8] focus-within:ring-offset-0">
                          <span className="inline-flex items-center pl-3 text-[#64748B] text-xs">https://</span>
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
                            className="border-0 pl-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </div>
                    </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* My Courses Section */}
        <MyCoursesSection
          onCreateCourse={() => {
            if (creatingCourse) return
            void handleQuickCreateCourse()
          }}
        />
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
              variant="modal-secondary"
              onClick={() => setCreateOpen(false)}
              disabled={creatingCourse}
            >
              Cancel
            </Button>
            <Button
              variant="modal-primary"
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
