'use client'

import { useEffect, useMemo, useRef, useState, useCallback, type SVGProps } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
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
} from 'lucide-react'
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
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-[#1F2933]">My Courses</CardTitle>
          <Button
            onClick={onCreateCourse}
            className="bg-[#1D4ED8] text-white hover:bg-[#1B45C2]"
            size="sm"
          >
            <Plus className="mr-1 h-4 w-4" />
            Create Course
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
                <Button onClick={onCreateCourse} variant="outline" className="mt-4" size="sm">
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
                  className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-white p-4 hover:border-[#4FD1C5]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate font-medium text-[#0F172A]">{course.name}</h4>
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
                    <p className="mt-1 text-sm text-[#64748B]">
                      {(course.categories || [])[0] || 'Untitled'} • {course.studentCount || 0}{' '}
                      students • Updated {new Date(course.updatedAt).toLocaleDateString()}
                    </p>
                    {activeTab === 'catalogued' && course.lastSessionDate && (
                      <p className="mt-1 text-xs text-gray-500">
                        Last session: {new Date(course.lastSessionDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const prefix = window.location.pathname.replace(/\/tutor\/my-page\/?$/, '')
                        router.push(`${prefix}/tutor/insights?tab=builder&courseId=${course.id}`)
                      }}
                      className="text-[#1D4ED8] hover:bg-[#EFF6FF]"
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
                            ? 'text-amber-600 hover:bg-amber-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
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
                      className="text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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
      setCroppedPreviewUrl(null)
      return
    }

    let active = true
    let objectUrlToRevoke: string | null = null

    const generatePreview = async () => {
      const img = new Image()
      img.src = cropSourceUrl
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load image'))
      })

      if (!active) return

      const side = Math.min(img.naturalWidth, img.naturalHeight)
      const sx = (img.naturalWidth - side) / 2
      const sy = (img.naturalHeight - side) / 2

      const canvas = document.createElement('canvas')
      canvas.width = 300
      canvas.height = 300
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not supported')

      ctx.drawImage(img, sx, sy, side, side, 0, 0, 300, 300)

      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/webp', 0.85)
      )
      if (!blob || !active) return

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
  }, [cropSourceUrl])

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
          bio,
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

  const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024
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
      toast.error('Maximum size is 5 MB')
      return
    }

    if (cropSourceUrl) URL.revokeObjectURL(cropSourceUrl)
    setCroppedPreviewUrl(null)
    setCropDialogOpen(false)
    const objectUrl = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = objectUrl
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load image'))
      })

      if (img.naturalWidth < 300 || img.naturalHeight < 300) {
        toast.error('Minimum dimensions: 300 × 300 px')
        return
      }

      setCropSourceUrl(objectUrl)
      setCropDialogOpen(true)
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
      const fullUrl =
        typeof newUrl === 'string' && newUrl.startsWith('/') && typeof window !== 'undefined'
          ? `${window.location.origin}${newUrl}`
          : newUrl
      setAvatarUrl(fullUrl ?? null)
      setAvatarPreview(null)
      setAvatarFile(null)
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
    setCropSourceUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setCroppedPreviewUrl(null)
  }

  const confirmCropAndUpload = async () => {
    if (!cropSourceUrl) return

    setCropping(true)
    try {
      const img = new Image()
      img.src = cropSourceUrl
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load image'))
      })

      const side = Math.min(img.naturalWidth, img.naturalHeight)
      const sx = (img.naturalWidth - side) / 2
      const sy = (img.naturalHeight - side) / 2

      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not supported')

      ctx.drawImage(img, sx, sy, side, side, 0, 0, 256, 256)

      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/webp', 0.85)
      )
      if (!blob) throw new Error('Failed to crop image')

      const croppedFile = new File([blob], 'avatar.webp', { type: 'image/webp' })
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
        router.push(`/tutor/insights?tab=builder&courseId=${createdCourse.id}`)
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
        router.push(`/tutor/insights?tab=builder&courseId=${createdCourse.id}`)
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
    'group relative overflow-hidden rounded-[20px] p-[1px] shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-[0_24px_80px_rgba(0,0,0,0.22)]'
  const headerInnerClass =
    'rounded-[20px] bg-[linear-gradient(135deg,#0B3A9B_0%,#1D4ED8_35%,#0A2F78_100%)] px-8 py-6 text-white'
  const panelCardClass =
    'group rounded-[18px] bg-white p-6 shadow-[0_14px_45px_rgba(0,0,0,0.12)] transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(0,0,0,0.16)]'

  return (
    <div className="min-h-screen bg-white text-[#1F2933]">
      <div className="border-b border-[#E2E8F0] bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full items-center justify-between px-6 py-4">
          <BackButton
            href={locale === DEFAULT_LOCALE ? '/tutor/dashboard' : `/${locale}/tutor/dashboard`}
          />
        </div>
      </div>

      <div className="w-full space-y-8 px-6 py-8">
        <section className={headerCardClass}>
          <div className={headerInnerClass}>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-5">
                <div className="relative">
                  <Avatar className="h-28 w-28 rounded-2xl border border-white/40 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                    <AvatarImage src={avatarPreview ?? avatarUrl ?? undefined} alt="Tutor avatar" />
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
                  <div className="mt-1 text-sm font-medium text-white/80">Solocorn Tutor</div>

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
                        variant="outline"
                        className="w-full border-white/50 bg-transparent text-white hover:bg-white/10 sm:w-auto"
                      >
                        Preview My Public Page
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      size="lg"
                      variant="outline"
                      disabled
                      className="w-full border-white/30 bg-transparent text-white/60 sm:w-auto"
                    >
                      Preview My Public Page
                    </Button>
                  )}

                  <Button
                    size="lg"
                    className="w-full bg-white text-[#0B3A9B] hover:bg-white/90 sm:w-auto"
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

        <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
          <div className={`${panelCardClass} flex h-full flex-col`}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                <Globe className="h-4 w-4 text-slate-700" />
              </div>
              <div className="text-lg font-semibold text-slate-900">About Me</div>
            </div>

            <div className="mt-4 flex min-h-0 flex-1 flex-col">
              <Textarea
                value={bio}
                readOnly
                className="h-full min-h-[420px] flex-1 resize-none border-slate-200 bg-white text-base leading-relaxed text-slate-700 lg:min-h-0"
              />
            </div>
          </div>

          <div className="flex h-full flex-col gap-6">
            <div className={panelCardClass}>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                  <Globe className="h-4 w-4 text-slate-700" />
                </div>
                <div className="text-lg font-semibold text-slate-900">My Public Page</div>
              </div>

              {publicUrl ? (
                <div className="mt-4">
                  <div className="break-all text-lg font-semibold text-slate-900">{publicUrl}</div>
                  <div className="mt-1 text-sm font-semibold text-[#F17623]">
                    {normalizedUsername ? `@${normalizedUsername}` : '@username'}
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-[#1D4ED8]"
                      onClick={handleCopyProfile}
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
                        onClick={handleShareProfile}
                      >
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  Add a username in profile settings to generate your public link.
                </div>
              )}
            </div>

            <div className={panelCardClass}>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                  <Share2 className="h-4 w-4 text-slate-700" />
                </div>
                <div className="text-lg font-semibold text-slate-900">Social Media Accounts</div>
              </div>

              <div className="mt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    {
                      key: 'tiktok',
                      value: socialAccounts.tiktok ? `@${socialAccounts.tiktok}` : '—',
                      icon: TikTokIcon,
                      iconClassName: 'text-slate-900',
                      muted: !socialAccounts.tiktok,
                    },
                    {
                      key: 'youtube',
                      value: socialAccounts.youtube ? `@${socialAccounts.youtube}` : '—',
                      icon: Youtube,
                      iconClassName: 'text-red-600',
                      muted: !socialAccounts.youtube,
                    },
                    {
                      key: 'instagram',
                      value: socialAccounts.instagram ? `@${socialAccounts.instagram}` : '—',
                      icon: Instagram,
                      iconClassName: 'text-pink-600',
                      muted: !socialAccounts.instagram,
                    },
                    {
                      key: 'facebook',
                      value: socialAccounts.facebook ? `@${socialAccounts.facebook}` : '—',
                      icon: Facebook,
                      iconClassName: 'text-blue-600',
                      muted: !socialAccounts.facebook,
                    },
                  ].map(item => {
                    const Icon = item.icon
                    return (
                      <div
                        key={item.key}
                        className={[
                          'flex items-center gap-3 text-sm font-medium text-slate-700',
                          item.muted ? 'text-slate-400' : '',
                        ].join(' ')}
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                          <Icon
                            className={[
                              'h-5 w-5',
                              item.iconClassName,
                              item.muted ? 'opacity-40' : '',
                            ].join(' ')}
                          />
                        </div>
                        <div className="min-w-0 truncate">{item.value}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className={panelCardClass}>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                  <BookOpen className="h-4 w-4 text-slate-700" />
                </div>
                <div className="text-lg font-semibold text-slate-900">Categories</div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {publishedCourseCategories.length > 0 ? (
                  publishedCourseCategories.map((cat, i) => (
                    <span
                      key={`${cat}-${i}`}
                      className="rounded-full bg-slate-100 px-4 py-1.5 text-sm font-semibold text-slate-800 shadow-sm"
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
              {cropSourceUrl ? (
                <div className="relative overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
                  <img
                    src={cropSourceUrl}
                    alt="Avatar preview"
                    className="h-64 w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 m-auto h-44 w-44 border-2 border-[#4FD1C5] opacity-90" />
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
                We will crop a centered 1:1 square and upload it as WebP. Server-side processing
                will also generate 64x64 and 128x128 versions.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={closeCropDialog}
                disabled={cropping || uploadingAvatar}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void confirmCropAndUpload()}
                disabled={cropping || uploadingAvatar || !cropSourceUrl}
              >
                {cropping ? 'Cropping...' : 'Crop & Upload'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

    <Card className="border border-[#E2E8F0] bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
          <CardHeader
            className="cursor-pointer select-none bg-white pb-3"
            onClick={() => setProfileSettingsOpen(prev => !prev)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-[#1F2933]">Profile Settings</CardTitle>
              {profileSettingsOpen ? (
                <ChevronUp className="h-4 w-4 text-[#64748B]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[#64748B]" />
              )}
            </div>
          </CardHeader>
          {profileSettingsOpen && (
            <CardContent className="space-y-5 bg-white">
              <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
                <div className="flex min-h-[280px] flex-col gap-2 lg:min-h-0">
                  <Label className="text-[#1F2933]">Edit Bio</Label>
                  <Textarea
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    disabled={loading || saving}
                    placeholder="Short bio for your public page..."
                    className="min-h-0 flex-1 resize-none border-[#E2E8F0] focus-visible:ring-[#4FD1C5]"
                  />
                </div>

                <div className="flex min-h-[280px] flex-col gap-4 lg:min-h-0">
                  <div className="space-y-3">
                    <Label className="text-[#1F2933]">Edit Social Media</Label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-[#64748B]">TikTok</Label>
                        <div className="flex rounded-md border border-[#E2E8F0] focus-within:ring-2 focus-within:ring-[#4FD1C5] focus-within:ring-offset-0">
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
                            className="border-0 pl-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-[#64748B]">YouTube</Label>
                        <div className="flex rounded-md border border-[#E2E8F0] focus-within:ring-2 focus-within:ring-[#4FD1C5] focus-within:ring-offset-0">
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
                            className="border-0 pl-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-[#64748B]">Instagram</Label>
                        <div className="flex rounded-md border border-[#E2E8F0] focus-within:ring-2 focus-within:ring-[#4FD1C5] focus-within:ring-offset-0">
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
                            className="border-0 pl-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-[#64748B]">Facebook</Label>
                        <div className="flex rounded-md border border-[#E2E8F0] focus-within:ring-2 focus-within:ring-[#4FD1C5] focus-within:ring-offset-0">
                          <span className="inline-flex items-center pl-3 text-[#64748B]">@</span>
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
                            className="border-0 pl-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
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
                          : 'border-[#E2E8F0] text-[#1F2933] hover:border-[#4FD1C5]'
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
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creatingCourse}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateCourse}
              disabled={creatingCourse}
              className="bg-[#1D4ED8] text-white hover:bg-[#1B45C2]"
            >
              {creatingCourse ? 'Creating...' : 'Create Course'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
