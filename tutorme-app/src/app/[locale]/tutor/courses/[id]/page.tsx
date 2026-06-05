/**
 * Tutor course management page
 * Course/materials source, language, price, shareable link, student count, schedule
 */

'use client'

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  BookOpen,
  FileText,
  ListOrdered,
  CheckCircle2,
  Loader2,
  Radio,
  DollarSign,
  X,
  Plus,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Globe,
  Award,
  GraduationCap,
  School,
  Flag,
  MapPin,
  Search,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { sanitizeHtmlWithMax } from '@/lib/security/sanitize'
import { cn } from '@/lib/utils'
import { BackButton } from '@/components/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { Checkbox } from '@/components/ui/checkbox'
import type { ScheduleItem } from './constants'
import { DAYS, TIME_SLOT_OPTIONS } from './constants'
import {
  REGIONS,
  GLOBAL_EXAMS_CATEGORIES,
  AP_CATEGORIES,
  A_LEVEL_CATEGORIES,
  IB_CATEGORIES,
  IGCSE_CATEGORIES,
  UNIVERSITY_CATEGORIES,
  LANGUAGE_CATEGORIES,
  PROFESSIONAL_CATEGORIES,
  UNIVERSITIES_BY_COUNTRY_CODE,
  getUniversityRegionId,
  type CountryData,
  type ExamCategory,
} from '@/lib/data/tutor-categories'
import { VariantManager, type VariantManagerHandle } from './components/VariantManager'

// Flatten all categories into a single list
const ALL_CATEGORIES = [
  ...GLOBAL_EXAMS_CATEGORIES.flatMap(c => c.exams),
  ...AP_CATEGORIES.flatMap(c => c.exams),
  ...A_LEVEL_CATEGORIES.flatMap(c => c.exams),
  ...IB_CATEGORIES.flatMap(c => c.exams),
  ...IGCSE_CATEGORIES.flatMap(c => c.exams),
  ...UNIVERSITY_CATEGORIES.flatMap(c => c.exams),
  ...LANGUAGE_CATEGORIES.flatMap(c => c.exams),
  ...PROFESSIONAL_CATEGORIES.flatMap(c => c.exams),
]

interface OutlineItem {
  title: string
  durationMinutes: number
}

interface OutlineModuleItem {
  title: string
  description?: string
  notes?: string
  tasks?: { title: string }[]
  lessons: { title: string; durationMinutes: number }[]
}

// CourseMaterials interface removed - using simplified course model

interface Lesson {
  id: string
  title: string
  description: string | null
  order: number
  duration: number
}

interface Module {
  id: string
  title: string
  description: string | null
  order: number
  lessons: Lesson[]
}

interface CourseData {
  id: string
  name: string
  description: string | null
  categories?: string[]
  isPublished: boolean
  languageOfInstruction: string | null
  price: number | null
  currency: string | null
  isFree: boolean
  schedule: ScheduleItem[]
  studentCount: number
  modules: Module[]
}

export default function TutorCoursePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const locale = (params.locale as string) || 'en'

  const [course, setCourse] = useState<CourseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const variantManagerRef = useRef<VariantManagerHandle | null>(null)
  const [variantStats, setVariantStats] = useState<{ total: number; published: number }>({
    total: 0,
    published: 0,
  })

  const [courseName, setCourseName] = useState('')
  const [description, setDescription] = useState('')
  const [languageOfInstruction, setLanguageOfInstruction] = useState<string>('')
  const [price, setPrice] = useState<string>('')
  const [isFree, setIsFree] = useState(false)
  const [currency, setCurrency] = useState<string>('SGD')
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [launchingLiveClass, setLaunchingLiveClass] = useState(false)
  const [tutorProfile, setTutorProfile] = useState<{
    userId?: string
    id?: string
    currency?: string | null
    categories?: string[]
  } | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedRegion, setSelectedRegion] = useState('')
  const [selectedCountryCode, setSelectedCountryCode] = useState('')
  const [categoryTab, setCategoryTab] = useState('global')
  const [customCategories, setCustomCategories] = useState<string[]>([])
  const [customCategoryInput, setCustomCategoryInput] = useState('')

  const totalLessons = useMemo(
    () => course?.modules?.reduce((sum, m) => sum + (m.lessons?.length ?? 0), 0) ?? 0,
    [course?.modules]
  )
  const [categorySearch, setCategorySearch] = useState('')
  const [scheduleSummary, setScheduleSummary] = useState<ScheduleItem[]>([])
  const [infoOpen, setInfoOpen] = useState(true)
  const [categoriesOpen, setCategoriesOpen] = useState(true)
  const [publishingVariants, setPublishingVariants] = useState(false)
  // Available countries based on selected region
  const availableCountries = useMemo<CountryData[]>(() => {
    if (!selectedRegion) return []
    const region = REGIONS.find(r => r.id === selectedRegion)
    return region ? region.countries : []
  }, [selectedRegion])

  // National exams based on selected country
  const nationalExams = useMemo<ExamCategory[]>(() => {
    if (!selectedCountryCode) return []
    const country = availableCountries.find(c => c.code === selectedCountryCode)
    return country && country.nationalExams.length > 0 ? country.nationalExams : []
  }, [selectedCountryCode, availableCountries])

  // Filtered university categories based on selected region/country
  const filteredUniversityCategories = useMemo<ExamCategory[]>(() => {
    // No region selected — show nothing (prompt user to select)
    if (!selectedRegion) return []

    // Specific country selected — show universities from that country
    if (selectedCountryCode) {
      const country = availableCountries.find(c => c.code === selectedCountryCode)
      const universities = UNIVERSITIES_BY_COUNTRY_CODE[selectedCountryCode]
      if (universities && universities.length > 0) {
        return [{
          id: `universities-${selectedCountryCode.toLowerCase()}`,
          label: `Universities — ${country?.name || selectedCountryCode}`,
          exams: universities,
        }]
      }
      return []
    }

    // Only region selected — show university categories for that region
    return UNIVERSITY_CATEGORIES.filter(cat => {
      const regionId = cat.id.replace('universities-', '')
      return regionId === selectedRegion
    })
  }, [selectedRegion, selectedCountryCode, availableCountries])
  const [scheduleWeekOffset, setScheduleWeekOffset] = useState(0)
  const [scheduleRepeatWeekly, setScheduleRepeatWeekly] = useState(false)
  const [numberOfWeeks, setNumberOfWeeks] = useState(4)
  const [totalSessionsDesired, setTotalSessionsDesired] = useState<number | ''>('')

  const scheduleWeekStart = (() => {
    const d = new Date()
    const day = d.getDay()
    const mon = d.getDate() - (day === 0 ? 6 : day - 1) + scheduleWeekOffset * 7
    const start = new Date(d.getFullYear(), d.getMonth(), mon)
    return start
  })()

  const scheduleWeekLabel = (() => {
    const end = new Date(scheduleWeekStart)
    end.setDate(end.getDate() + 6)
    return `${scheduleWeekStart.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
  })()

  const scheduleMonthLabel = scheduleWeekStart.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  /** For the grid: date for each day of the displayed week (Mon = index 0, Sun = index 6) */
  const weekDates = DAYS.map((_, i) => {
    const d = new Date(scheduleWeekStart)
    d.setDate(scheduleWeekStart.getDate() + i)
    return d
  })

  const formatDateKey = (date: Date) => date.toLocaleDateString('en-CA')

  const loadCourse = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/tutor/courses/${id}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setCourse(data.course)
      } else {
        toast.error('Course not found')
        router.push(`/${locale}/tutor/insights?tab=builder`)
      }
    } catch {
      toast.error('Failed to load course')
      router.push(`/${locale}/tutor/insights?tab=builder`)
    } finally {
      setLoading(false)
    }
  }, [id, router, locale])

  useEffect(() => {
    loadCourse()
  }, [loadCourse])

  useEffect(() => {
    fetch('/api/user/profile', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.profile) {
          setTutorProfile(data.profile)
          // Load tutor's categories from profile if available (single category only)
          if (data.profile.categories && Array.isArray(data.profile.categories) && data.profile.categories.length > 0) {
            setSelectedCategories([data.profile.categories[0]])
          }
          // Load custom categories from localStorage
          const userId = data.profile?.userId || data.profile?.id
          if (userId && typeof window !== 'undefined') {
            try {
              const raw = window.localStorage.getItem(`tutor-custom-categories:${userId}`)
              if (raw) {
                const parsed = JSON.parse(raw)
                if (Array.isArray(parsed)) setCustomCategories(parsed)
              }
            } catch {
              // ignore
            }
          }
        }
      })
      .catch(err => console.error('[Course Page] Failed to load profile:', err))
  }, [])

  useEffect(() => {
    if (!course) return
    setCourseName(course.name ?? '')
    setDescription(course.description ?? '')
    setLanguageOfInstruction(course.languageOfInstruction ?? '')
    setIsFree(course.isFree ?? false)
    setPrice(course.isFree ? '' : course.price != null ? String(course.price) : '')
    setCurrency('USD') // Fixed to USD
    setSchedule(Array.isArray(course.schedule) ? [...course.schedule] : [])
    // Load categories from course if available (single category only)
    if (course.categories && Array.isArray(course.categories) && course.categories.length > 0) {
      setSelectedCategories([course.categories[0]])
    }
  }, [course, tutorProfile])

  // Load course catalog based on first category if available
  useEffect(() => {
    const categories = course?.categories
    if (!categories || categories.length === 0) {
      return
    }
    // Course catalog loading removed - using simplified course model
  }, [course?.categories])

  // Schedule summary: generate + sync (hooks must run unconditionally before any early return)
  const generateScheduleSummary = useCallback(() => {
    if (schedule.length === 0) {
      toast.error('Please add schedule items first')
      return
    }
    if (scheduleRepeatWeekly) {
      const requestedSessions = totalSessionsDesired !== '' ? Number(totalSessionsDesired) : null
      const weeks =
        requestedSessions != null
          ? Math.max(1, Math.ceil(requestedSessions / schedule.length))
          : numberOfWeeks
      const expanded: ScheduleItem[] = []
      for (let w = 0; w < weeks; w++) {
        schedule.forEach(slot => expanded.push({ ...slot }))
      }
      setScheduleSummary(
        requestedSessions != null ? expanded.slice(0, requestedSessions) : expanded
      )
    } else {
      setScheduleSummary([...schedule])
    }
    toast.success('Schedule summary generated')
  }, [schedule, scheduleRepeatWeekly, numberOfWeeks, totalSessionsDesired])

  useEffect(() => {
    if (schedule.length === 0) {
      setScheduleSummary([])
      return
    }
    if (scheduleRepeatWeekly) {
      const MAX_WEEKS = 52
      const weeks = Math.min(
        MAX_WEEKS,
        totalSessionsDesired !== ''
          ? Math.max(1, Math.ceil(Number(totalSessionsDesired) / schedule.length))
          : numberOfWeeks
      )
      const expanded: ScheduleItem[] = []
      for (let w = 0; w < weeks; w++) {
        schedule.forEach(slot => expanded.push({ ...slot }))
      }
      setScheduleSummary(expanded)
    } else {
      setScheduleSummary([...schedule])
    }
  }, [schedule, scheduleRepeatWeekly, numberOfWeeks, totalSessionsDesired])

  // Materials upload removed - using simplified course model

  const handleOpenInLiveClass = async () => {
    if (!course) return
    setLaunchingLiveClass(true)
    try {
      const durationFromSchedule =
        Array.isArray(schedule) && schedule.length > 0
          ? Number(schedule[0]?.durationMinutes) || 60
          : 60

      const normalizedDescription = (description?.trim() || course.description || '').trim()
      const payload: Record<string, unknown> = {
        title: (courseName || course.name || '').trim(),
        category: (course.categories || [])[0] || 'general',
        courseId: course.id,
        maxStudents: 50,
        durationMinutes: Math.max(15, Math.min(480, durationFromSchedule)),
      }
      if (normalizedDescription) payload.description = normalizedDescription

      const res = await fetchWithCsrf('/api/class/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData?.error || 'Failed to create live session')
      }

      const data = await res.json()
      const sessionId = data?.session?.sessionId
      if (!sessionId) throw new Error('Live session created but session ID is missing')

      toast.success('Live session created. Redirecting…')
      router.push(`/tutor/classroom?sessionId=${sessionId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to open live session')
    } finally {
      setLaunchingLiveClass(false)
    }
  }

  const handleSaveAll = async (): Promise<boolean> => {
    if (!id) {
      toast.error('Course ID is missing')
      return false
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        categories: selectedCategories,
        schedule,
      }

      const trimmedDescription = description.trim()
      if (trimmedDescription) {
        if (trimmedDescription.length > 200) {
          toast.error('Description must be 200 characters or less')
          setSaving(false)
          return false
        }
        payload.description = sanitizeHtmlWithMax(trimmedDescription, 200)
      }

      const trimmedLanguage = languageOfInstruction.trim()
      if (trimmedLanguage) payload.languageOfInstruction = trimmedLanguage

      payload.currency = 'USD'
      payload.isFree = isFree
      if (!isFree && price !== '') {
        const n = Number(price)
        if (!Number.isNaN(n)) payload.price = n
      }

      // Only include name if it has a value (required field)
      const trimmedName = courseName.trim()
      if (trimmedName) {
        payload.name = trimmedName
      }

      const res = await fetchWithCsrf(`/api/tutor/courses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to save')
        return false
      }
      // Update local course state from API response to keep UI in sync without full reload
      if (data.course) {
        setCourse(data.course)
      } else {
        setCourse(prev =>
          prev
            ? {
                ...prev,
                name: courseName.trim() || prev.name,
                description: description.trim() || prev.description,
                languageOfInstruction: languageOfInstruction || null,
                price: isFree ? 0 : price === '' ? null : Number(price),
                currency: 'USD',
                isFree,
                categories: selectedCategories,
                schedule,
              }
            : null
        )
      }
      toast.success('All changes saved')
      return true
    } catch (err) {
      console.error('[SaveAll] Error:', err)
      toast.error('Failed to save')
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleCourseSelect = async (name: string) => {
    setCourseName(name)
    try {
      const res = await fetchWithCsrf(`/api/tutor/courses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        setCourse(prev => (prev ? { ...prev, name } : null))
        toast.success('Course name updated')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to update name')
      }
    } catch {
      toast.error('Failed to update course name')
    }
  }

  // Materials, outline, and course upload functions removed - using simplified course model

  if (loading || !course) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-muted-foreground">Loading course…</p>
      </div>
    )
  }

  // Select a single category (replaces any previously selected category)
  const selectCategory = (category: string) => {
    setSelectedCategories([category])
  }

  // Add a custom category
  const addCustomCategory = () => {
    const name = customCategoryInput.trim()
    if (!name) return
    if (customCategories.some(c => c.toLowerCase() === name.toLowerCase())) {
      toast.error('This custom category already exists')
      return
    }
    if (name.length > 100) {
      toast.error('Category name must be 100 characters or less')
      return
    }
    const updated = [...customCategories, name]
    setCustomCategories(updated)
    setCustomCategoryInput('')
    // Persist to localStorage
    const userId = tutorProfile?.userId || tutorProfile?.id
    if (userId && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(`tutor-custom-categories:${userId}`, JSON.stringify(updated))
      } catch {
        // ignore
      }
    }
    // Auto-select the newly created category
    setSelectedCategories([name])
  }

  // Remove a custom category
  const removeCustomCategory = (category: string) => {
    const updated = customCategories.filter(c => c !== category)
    setCustomCategories(updated)
    // If the removed category was selected, clear selection
    if (selectedCategories[0] === category) {
      setSelectedCategories([])
    }
    // Persist to localStorage
    const userId = tutorProfile?.userId || tutorProfile?.id
    if (userId && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(`tutor-custom-categories:${userId}`, JSON.stringify(updated))
      } catch {
        // ignore
      }
    }
  }

  // No toggle functions needed — Select handles single-select directly

  /** Effective number of weeks when "repeat weekly" is on: from numberOfWeeks or derived from totalSessionsDesired */
  const effectiveWeeks =
    schedule.length > 0 && scheduleRepeatWeekly
      ? totalSessionsDesired !== ''
        ? Math.max(1, Math.ceil(Number(totalSessionsDesired) / schedule.length))
        : numberOfWeeks
      : 1

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const formatTime = (time: string) => {
    if (!time || typeof time !== 'string') return '–'
    const parts = time.split(':')
    const hour = Number(parts[0])
    const minute = Number(parts[1] ?? 0)
    if (Number.isNaN(hour)) return '–'
    const displayHour = hour % 12 === 0 ? 12 : hour % 12
    const period = hour >= 12 ? 'PM' : 'AM'
    return `${displayHour}:${minute.toString().padStart(2, '0')}${period}`
  }
  const formatTimeRange = (startTime: string, durationMinutes: number) => {
    if (!startTime || typeof startTime !== 'string') return '–'
    const parts = startTime.split(':')
    const startHour = Number(parts[0])
    const startMinute = Number(parts[1] ?? 0)
    if (Number.isNaN(startHour)) return '–'
    const startTotal = startHour * 60 + startMinute
    const dur = Number(durationMinutes) || 0
    const endTotal = startTotal + dur
    const endHour = Math.floor((endTotal / 60) % 24)
    const endMinute = endTotal % 60
    const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`
    return `${formatTime(startTime)}–${formatTime(endTime)}`
  }
  const timezoneLabel = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time'
    } catch {
      return 'Local time'
    }
  })()
  const scheduleByDay = scheduleSummary.reduce(
    (acc, slot) => {
      const day = slot?.dayOfWeek
      if (!day) return acc
      if (!acc[day]) acc[day] = []
      acc[day].push(slot)
      return acc
    },
    {} as Record<string, ScheduleItem[]>
  )
  const priceNumber = Number(price)
  const scheduleCost = scheduleSummary.reduce((sum, slot) => {
    if (!priceNumber || Number.isNaN(priceNumber)) return sum
    const dur = slot?.durationMinutes ?? 0
    return sum + (dur / 60) * priceNumber
  }, 0)
  const totalRevenue = scheduleCost * 0.7
  const totalSessions = scheduleSummary.length
  const totalDurationMinutes = scheduleSummary.reduce(
    (sum, slot) => sum + (slot.durationMinutes ?? 0),
    0
  )
  const totalDurationHours = (totalDurationMinutes / 60).toFixed(1)

  if (!id) {
    return (
      <div className="flex h-full min-h-[calc(100vh-64px)] items-center justify-center bg-white">
        <div className="text-muted-foreground text-center">
          <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin" />
          <p>Loading course…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-[calc(100vh-64px)] bg-white pb-12">
      <div className="mx-auto w-full max-w-[1400px] px-4 pt-8 sm:px-6">
        <div className="space-y-6">
          <div className="panel-header panel-header-metallic course-top-header">
            <div className="relative flex items-center justify-center">
              <div className="absolute left-0">
                <BackButton href={`/tutor/insights?tab=builder&courseId=${id}`} />
              </div>
              <div className="text-center">
                <div className="panel-header-title">Course Details</div>
                <div className="panel-header-subtext">
                  Manage all information and settings for your course.
                </div>
              </div>
            </div>
          </div>

          <Card
            variant="floating"
            elevation={2}
            padding="none"
            className="overflow-hidden rounded-[16px] bg-white"
          >
            <button
              type="button"
              onClick={() => setInfoOpen(o => !o)}
              className="panel-header panel-header-metallic w-full text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="panel-header-icon">
                    <BookOpen className="h-5 w-5 text-slate-900" />
                  </div>
                  <div>
                    <div className="panel-header-title">Course Information</div>
                    <div className="panel-header-subtext">
                      Add the basic details of your course.
                    </div>
                  </div>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
                  {infoOpen ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
              </div>
            </button>
            {infoOpen ? (
              <CardContent spacing="default" className="bg-white text-slate-900">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="form-group space-y-2">
                    <Label className="form-label font-semibold text-slate-700">Course Name</Label>
                    <Input
                      value={courseName}
                      onChange={e => setCourseName(e.target.value)}
                      placeholder="Course name"
                      className="bg-white"
                    />
                    <div className="mt-3 flex items-center gap-3 text-sm text-slate-700">
                      <span className="font-semibold">No. of Lessons</span>
                      <span>{totalLessons}</span>
                    </div>
                  </div>

                  <div className="form-group space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="form-label font-semibold text-slate-700">
                        Course Description
                      </Label>
                      <span
                        className={cn(
                          'text-xs',
                          description.length > 200 ? 'font-medium text-red-500' : 'text-slate-400'
                        )}
                      >
                        {description.length}/200
                      </span>
                    </div>
                    <Textarea
                      value={description}
                      onChange={e => {
                        const val = e.target.value
                        if (val.length <= 200) {
                          setDescription(val)
                        }
                      }}
                      placeholder="What will students learn in this course?"
                      rows={2}
                      maxLength={200}
                      className="h-full min-h-[80px] resize-none bg-white text-slate-900"
                    />
                  </div>
                </div>
              </CardContent>
            ) : null}
          </Card>

          <Card
            variant="floating"
            elevation={2}
            padding="none"
            className="overflow-hidden rounded-[16px] bg-white"
          >
            <button
              type="button"
              onClick={() => setCategoriesOpen(o => !o)}
              className="panel-header panel-header-metallic w-full text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="panel-header-icon">
                    <Globe className="h-5 w-5 text-slate-900" />
                  </div>
                  <div>
                    <div className="panel-header-title">Categories</div>
                    <div className="panel-header-subtext">
                      Select the categories and exams relevant to your course.
                    </div>
                  </div>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
                  {categoriesOpen ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
              </div>
            </button>

            {categoriesOpen ? (
              <CardContent spacing="default" className="bg-white text-slate-900">
                <div className="flex flex-col gap-6">
                  {/* Top Panel - Region & Country Selection Dropdowns */}
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    {/* Region Selection */}
                    <div className="flex-1 space-y-3">
                      <Label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <Globe className="h-4 w-4 text-[#1D4ED8]" />
                        Region
                      </Label>
                      <Select value={selectedRegion} onValueChange={v => { setSelectedRegion(v); setSelectedCountryCode('') }}>
                        <SelectTrigger className="h-10 w-full rounded-lg border border-slate-700/25 bg-white text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:border-slate-400/50 hover:shadow-md focus-visible:!shadow-none focus:outline-none focus-visible:outline-none">
                          <SelectValue placeholder="Select Regions..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg border border-white/20 bg-[#1E2832] p-1.5 shadow-lg w-[var(--radix-select-trigger-width)]">
                          {REGIONS.map(region => (
                            <SelectItem key={region.id} value={region.id} className="text-white focus:text-white hover:bg-white/20 focus:bg-white/20 mx-1.5 focus:outline-none rounded-md">
                              {region.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Country Selection */}
                    <div className="flex-1 space-y-3">
                      <Label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <MapPin className="h-4 w-4 text-[#F17623]" />
                        Country
                      </Label>
                      <Select value={selectedCountryCode} onValueChange={setSelectedCountryCode} disabled={!selectedRegion}>
                        <SelectTrigger className="h-10 w-full rounded-lg border border-slate-700/25 bg-white text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:border-slate-400/50 hover:shadow-md disabled:bg-slate-100/50 disabled:border-slate-400/20 disabled:text-slate-400 disabled:hover:bg-slate-100/50 disabled:hover:border-slate-400/20 disabled:hover:shadow-none focus-visible:!shadow-none focus:outline-none focus-visible:outline-none">
                          <SelectValue placeholder={selectedRegion ? 'Select Countries...' : 'Select Region First'} />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg border border-white/20 bg-[#1E2832] p-1.5 shadow-lg w-[var(--radix-select-trigger-width)]">
                          {availableCountries.length === 0 ? (
                            <div className="py-4 text-center text-xs text-white/70">
                              No countries available
                            </div>
                          ) : (
                            availableCountries.map(country => (
                              <SelectItem key={country.code} value={country.code} className="text-white focus:text-white hover:bg-white/20 focus:bg-white/20 mx-1.5 focus:outline-none rounded-md">
                                {country.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Category Tabs */}
                  <div className="flex flex-col gap-4">
                    <Tabs
                      value={categoryTab}
                      onValueChange={setCategoryTab}
                      className="flex w-full flex-col"
                    >
                      {/* Tabs in direct flow, no background container */}
                      <div className="border-b border-slate-200">
                        <TabsList className="flex w-full flex-wrap justify-start gap-6 bg-transparent p-0">
                          <TabsTrigger
                            value="global"
                            className="rounded-none border-b-2 border-transparent px-1 py-3 font-medium text-slate-500 data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 data-[state=active]:shadow-none"
                          >
                            <Globe className="mr-2 h-4 w-4" />
                            Global
                          </TabsTrigger>
                          <TabsTrigger
                            value="ap"
                            className="rounded-none border-b-2 border-transparent px-1 py-3 font-medium text-slate-500 data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 data-[state=active]:shadow-none"
                          >
                            <Award className="mr-2 h-4 w-4" />
                            AP
                          </TabsTrigger>
                          <TabsTrigger
                            value="alevel"
                            className="rounded-none border-b-2 border-transparent px-1 py-3 font-medium text-slate-500 data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 data-[state=active]:shadow-none"
                          >
                            <GraduationCap className="mr-2 h-4 w-4" />A Level
                          </TabsTrigger>
                          <TabsTrigger
                            value="ib"
                            className="rounded-none border-b-2 border-transparent px-1 py-3 font-medium text-slate-500 data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 data-[state=active]:shadow-none"
                          >
                            <BookOpen className="mr-2 h-4 w-4" />
                            IB
                          </TabsTrigger>
                          <TabsTrigger
                            value="igcse"
                            className="rounded-none border-b-2 border-transparent px-1 py-3 font-medium text-slate-500 data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 data-[state=active]:shadow-none"
                          >
                            <School className="mr-2 h-4 w-4" />
                            IGCSE
                          </TabsTrigger>
                          <TabsTrigger
                            value="national"
                            disabled={nationalExams.length === 0}
                            className="rounded-none border-b-2 border-transparent px-1 py-3 font-medium text-slate-500 disabled:opacity-50 data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 data-[state=active]:shadow-none"
                          >
                            <Flag className="mr-2 h-4 w-4" />
                            National
                          </TabsTrigger>
                          <TabsTrigger
                            value="universities"
                            className="rounded-none border-b-2 border-transparent px-1 py-3 font-medium text-slate-500 data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 data-[state=active]:shadow-none"
                          >
                            <GraduationCap className="mr-2 h-4 w-4" />
                            Universities
                          </TabsTrigger>
                          <TabsTrigger
                            value="languages"
                            className="rounded-none border-b-2 border-transparent px-1 py-3 font-medium text-slate-500 data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 data-[state=active]:shadow-none"
                          >
                            <Globe className="mr-2 h-4 w-4" />
                            Languages
                          </TabsTrigger>
                          <TabsTrigger
                            value="professional"
                            className="rounded-none border-b-2 border-transparent px-1 py-3 font-medium text-slate-500 data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 data-[state=active]:shadow-none"
                          >
                            <Award className="mr-2 h-4 w-4" />
                            Professional
                          </TabsTrigger>
                          <TabsTrigger
                            value="diy"
                            className="rounded-none border-b-2 border-transparent px-1 py-3 font-medium text-slate-500 data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 data-[state=active]:shadow-none"
                          >
                            <Wrench className="mr-2 h-4 w-4" />
                            DIY
                          </TabsTrigger>
                        </TabsList>
                      </div>

                      {/* Search - Integrated into flow without heavy borders */}
                      <div className="pb-2 pt-6">
                        <div className="relative max-w-md">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <Input
                            placeholder="Search categories..."
                            value={categorySearch}
                            onChange={e => setCategorySearch(e.target.value)}
                            className="h-10 border-slate-200 bg-white pl-10"
                          />
                        </div>
                      </div>

                      {/* Tab Contents - Auto height, no box styling */}
                      <div className="py-4">
                        {/* Global Tab */}
                        <TabsContent value="global" className="mt-0">
                          <div className="space-y-6">
                            {GLOBAL_EXAMS_CATEGORIES.filter(
                              cat =>
                                !categorySearch ||
                                cat.exams.some(e =>
                                  e.toLowerCase().includes(categorySearch.toLowerCase())
                                )
                            ).map(category => (
                              <div key={category.id} className="space-y-3">
                                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                  <BookOpen className="h-4 w-4 text-indigo-600" />
                                  {category.label}
                                </h4>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
                                  {category.exams
                                    .filter(
                                      exam =>
                                        !categorySearch ||
                                        exam.toLowerCase().includes(categorySearch.toLowerCase())
                                    )
                                    .map(exam => (
                                      <label
                                        key={exam}
                                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
                                      >
                                        <input
                                          type="radio"
                                          name="category"
                                          checked={selectedCategories[0] === exam}
                                          onChange={() => selectCategory(exam)}
                                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-slate-700">{exam}</span>
                                      </label>
                                    ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </TabsContent>

                        {/* AP Tab */}
                        <TabsContent value="ap" className="mt-0">
                          <div className="space-y-6">
                            {AP_CATEGORIES.filter(
                              cat =>
                                !categorySearch ||
                                cat.exams.some(e =>
                                  e.toLowerCase().includes(categorySearch.toLowerCase())
                                )
                            ).map(category => (
                              <div key={category.id} className="space-y-3">
                                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                  <Award className="h-4 w-4 text-indigo-600" />
                                  {category.label}
                                </h4>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
                                  {category.exams
                                    .filter(
                                      exam =>
                                        !categorySearch ||
                                        exam.toLowerCase().includes(categorySearch.toLowerCase())
                                    )
                                    .map(exam => (
                                      <label
                                        key={exam}
                                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
                                      >
                                        <input
                                          type="radio"
                                          name="category"
                                          checked={selectedCategories[0] === exam}
                                          onChange={() => selectCategory(exam)}
                                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-slate-700">{exam}</span>
                                      </label>
                                    ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </TabsContent>

                        {/* A Level Tab */}
                        <TabsContent value="alevel" className="mt-0">
                          <div className="space-y-6">
                            {A_LEVEL_CATEGORIES.filter(
                              cat =>
                                !categorySearch ||
                                cat.exams.some(e =>
                                  e.toLowerCase().includes(categorySearch.toLowerCase())
                                )
                            ).map(category => (
                              <div key={category.id} className="space-y-3">
                                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                  <GraduationCap className="h-4 w-4 text-indigo-600" />
                                  {category.label}
                                </h4>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
                                  {category.exams
                                    .filter(
                                      exam =>
                                        !categorySearch ||
                                        exam.toLowerCase().includes(categorySearch.toLowerCase())
                                    )
                                    .map(exam => (
                                      <label
                                        key={exam}
                                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
                                      >
                                        <input
                                          type="radio"
                                          name="category"
                                          checked={selectedCategories[0] === exam}
                                          onChange={() => selectCategory(exam)}
                                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-slate-700">{exam}</span>
                                      </label>
                                    ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </TabsContent>

                        {/* IB Tab */}
                        <TabsContent value="ib" className="mt-0">
                          <div className="space-y-6">
                            {IB_CATEGORIES.filter(
                              cat =>
                                !categorySearch ||
                                cat.exams.some(e =>
                                  e.toLowerCase().includes(categorySearch.toLowerCase())
                                )
                            ).map(category => (
                              <div key={category.id} className="space-y-3">
                                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                  <BookOpen className="h-4 w-4 text-indigo-600" />
                                  {category.label}
                                </h4>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
                                  {category.exams
                                    .filter(
                                      exam =>
                                        !categorySearch ||
                                        exam.toLowerCase().includes(categorySearch.toLowerCase())
                                    )
                                    .map(exam => (
                                      <label
                                        key={exam}
                                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
                                      >
                                        <input
                                          type="radio"
                                          name="category"
                                          checked={selectedCategories[0] === exam}
                                          onChange={() => selectCategory(exam)}
                                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-slate-700">{exam}</span>
                                      </label>
                                    ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </TabsContent>

                        {/* IGCSE Tab */}
                        <TabsContent value="igcse" className="mt-0">
                          <div className="space-y-6">
                            {IGCSE_CATEGORIES.filter(
                              cat =>
                                !categorySearch ||
                                cat.exams.some(e =>
                                  e.toLowerCase().includes(categorySearch.toLowerCase())
                                )
                            ).map(category => (
                              <div key={category.id} className="space-y-3">
                                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                  <School className="h-4 w-4 text-indigo-600" />
                                  {category.label}
                                </h4>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
                                  {category.exams
                                    .filter(
                                      exam =>
                                        !categorySearch ||
                                        exam.toLowerCase().includes(categorySearch.toLowerCase())
                                    )
                                    .map(exam => (
                                      <label
                                        key={exam}
                                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
                                      >
                                        <input
                                          type="radio"
                                          name="category"
                                          checked={selectedCategories[0] === exam}
                                          onChange={() => selectCategory(exam)}
                                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-slate-700">{exam}</span>
                                      </label>
                                    ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </TabsContent>

                        {/* National Tab */}
                        <TabsContent value="national" className="mt-0">
                          <div className="space-y-6">
                            {nationalExams.length === 0 ? (
                              <div className="py-12 text-center text-slate-500">
                                <Flag className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                                <p>Select countries to view national exams</p>
                              </div>
                            ) : (
                              nationalExams
                                .filter(
                                  cat =>
                                    !categorySearch ||
                                    cat.exams.some(e =>
                                      e.toLowerCase().includes(categorySearch.toLowerCase())
                                    )
                                )
                                .map(category => (
                                  <div key={category.id} className="space-y-3">
                                    <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                      <Flag className="h-4 w-4 text-[#F17623]" />
                                      {category.label}
                                    </h4>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
                                      {category.exams
                                        .filter(
                                          exam =>
                                            !categorySearch ||
                                            exam
                                              .toLowerCase()
                                              .includes(categorySearch.toLowerCase())
                                        )
                                        .map(exam => (
                                          <label
                                            key={exam}
                                            className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={selectedCategories.includes(exam)}
                                              onChange={() => selectCategory(exam)}
                                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-sm text-slate-700">{exam}</span>
                                          </label>
                                        ))}
                                    </div>
                                  </div>
                                ))
                            )}
                          </div>
                        </TabsContent>

                        {/* Universities Tab */}
                        <TabsContent value="universities" className="mt-0">
                          <div className="space-y-6">
                            {filteredUniversityCategories.length === 0 ? (
                              <div className="py-12 text-center text-slate-500">
                                <GraduationCap className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                                <p className="text-sm">Please select a region or country.</p>
                              </div>
                            ) : (
                              filteredUniversityCategories.filter(
                              cat =>
                                !categorySearch ||
                                cat.exams.some(e =>
                                  e.toLowerCase().includes(categorySearch.toLowerCase())
                                )
                            ).map(category => (
                              <div key={category.id} className="space-y-3">
                                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                  <GraduationCap className="h-4 w-4 text-indigo-600" />
                                  {category.label}
                                </h4>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
                                  {category.exams
                                    .filter(
                                      exam =>
                                        !categorySearch ||
                                        exam.toLowerCase().includes(categorySearch.toLowerCase())
                                    )
                                    .map(exam => (
                                      <label
                                        key={exam}
                                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
                                      >
                                        <input
                                          type="radio"
                                          name="category"
                                          checked={selectedCategories[0] === exam}
                                          onChange={() => selectCategory(exam)}
                                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-slate-700">{exam}</span>
                                      </label>
                                    ))}
                                </div>
                              </div>
                            ))
                            )}
                          </div>
                        </TabsContent>

                        {/* Languages Tab */}
                        <TabsContent value="languages" className="mt-0">
                          <div className="space-y-6">
                            {LANGUAGE_CATEGORIES.filter(
                              cat =>
                                !categorySearch ||
                                cat.exams.some(e =>
                                  e.toLowerCase().includes(categorySearch.toLowerCase())
                                )
                            ).map(category => (
                              <div key={category.id} className="space-y-3">
                                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                  <Globe className="h-4 w-4 text-indigo-600" />
                                  {category.label}
                                </h4>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
                                  {category.exams
                                    .filter(
                                      exam =>
                                        !categorySearch ||
                                        exam.toLowerCase().includes(categorySearch.toLowerCase())
                                    )
                                    .map(exam => (
                                      <label
                                        key={exam}
                                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
                                      >
                                        <input
                                          type="radio"
                                          name="category"
                                          checked={selectedCategories[0] === exam}
                                          onChange={() => selectCategory(exam)}
                                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-slate-700">{exam}</span>
                                      </label>
                                    ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </TabsContent>

                        {/* Professional Tab */}
                        <TabsContent value="professional" className="mt-0">
                          <div className="space-y-6">
                            {PROFESSIONAL_CATEGORIES.filter(
                              cat =>
                                !categorySearch ||
                                cat.exams.some(e =>
                                  e.toLowerCase().includes(categorySearch.toLowerCase())
                                )
                            ).map(category => (
                              <div key={category.id} className="space-y-3">
                                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                  <Award className="h-4 w-4 text-indigo-600" />
                                  {category.label}
                                </h4>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
                                  {category.exams
                                    .filter(
                                      exam =>
                                        !categorySearch ||
                                        exam.toLowerCase().includes(categorySearch.toLowerCase())
                                    )
                                    .map(exam => (
                                      <label
                                        key={exam}
                                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
                                      >
                                        <input
                                          type="radio"
                                          name="category"
                                          checked={selectedCategories[0] === exam}
                                          onChange={() => selectCategory(exam)}
                                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-slate-700">{exam}</span>
                                      </label>
                                    ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </TabsContent>

                        {/* DIY Tab */}
                        <TabsContent value="diy" className="mt-0">
                          <div className="space-y-6">
                            {/* Add custom category input */}
                            <div className="flex items-center gap-3">
                              <div className="relative flex-1 max-w-md">
                                <Input
                                  placeholder="Enter custom category name..."
                                  value={customCategoryInput}
                                  onChange={e => setCustomCategoryInput(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      addCustomCategory()
                                    }
                                  }}
                                  className="h-10 border-slate-200 bg-white"
                                  maxLength={100}
                                />
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                onClick={addCustomCategory}
                                disabled={!customCategoryInput.trim()}
                                className="h-10 gap-1"
                              >
                                <Plus className="h-4 w-4" />
                                Add
                              </Button>
                            </div>

                            {/* Custom categories list */}
                            {customCategories.length === 0 ? (
                              <div className="py-8 text-center text-slate-500">
                                <Wrench className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                                <p>No custom categories yet.</p>
                                <p className="text-sm text-slate-400">Create your own category above.</p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                  <Wrench className="h-4 w-4 text-indigo-600" />
                                  Your Custom Categories
                                </h4>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
                                  {customCategories
                                    .filter(
                                      exam =>
                                        !categorySearch ||
                                        exam.toLowerCase().includes(categorySearch.toLowerCase())
                                    )
                                    .map(exam => (
                                      <label
                                        key={exam}
                                        className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
                                      >
                                        <input
                                          type="radio"
                                          name="category"
                                          checked={selectedCategories[0] === exam}
                                          onChange={() => selectCategory(exam)}
                                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="flex-1 text-sm text-slate-700">{exam}</span>
                                        <button
                                          type="button"
                                          onClick={e => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            removeCustomCategory(exam)
                                          }}
                                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-opacity"
                                          title="Remove"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </label>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </TabsContent>
                      </div>
                    </Tabs>
                  </div>
                </div>

                {/* Selected Categories Summary */}
                {selectedCategories.length > 0 && (
                  <div className="flex items-center gap-2 pt-2 text-sm font-medium text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Category: {selectedCategories[0]}</span>
                  </div>
                )}
              </CardContent>
            ) : null}
          </Card>

          <VariantManager
            ref={variantManagerRef}
            templateCourseId={id}
            templateCourseName={courseName}
            selectedCategories={selectedCategories}
            selectedCountryCodes={selectedCountryCode ? [selectedCountryCode] : ['GL']}
            defaultPrice={price === '' ? null : Number(price)}
            defaultCurrency="USD"
            defaultLanguage={languageOfInstruction || 'English'}
            defaultSchedule={schedule}
            onStatsChange={setVariantStats}
            onSaved={() => router.push('/tutor/my-page')}
            hidePublishAction
          />

          <div className="flex flex-col-reverse justify-end gap-4 pt-2 sm:flex-row sm:items-center">
            <Button
              size="lg"
              variant="default"
              onClick={handleSaveAll}
              disabled={saving}
              className="h-11 w-full rounded-full border-2 border-transparent bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-8 text-white shadow-[0_6px_16px_rgba(37,99,235,0.16),0_2px_4px_rgba(0,0,0,0.08)] transition-all duration-200 ease-in-out hover:border-[#2563eb] hover:bg-white hover:text-[#2563eb] hover:shadow-[0_8px_18px_rgba(37,99,235,0.18)] hover:[background-image:none] active:bg-gradient-to-r active:from-[#1d4ed8] active:to-[#1e40af] active:shadow-[0_4px_10px_rgba(37,99,235,0.16)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:w-[220px]"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button
              size="lg"
              variant="default"
              onClick={async () => {
                if (publishingVariants) return
                setPublishingVariants(true)
                try {
                  // Auto-save course details first, then publish variants
                  const saved = await handleSaveAll()
                  if (saved) {
                    await variantManagerRef.current?.publish()
                  }
                } finally {
                  setPublishingVariants(false)
                }
              }}
              disabled={variantStats.total === 0 || publishingVariants}
              className="h-11 w-full rounded-full border-2 border-transparent bg-gradient-to-r from-[#7c3aed] to-[#8b5cf6] px-8 text-white shadow-[0_6px_16px_rgba(124,58,237,0.18),0_2px_4px_rgba(0,0,0,0.08)] transition-all duration-200 ease-in-out hover:border-[#7c3aed] hover:bg-white hover:text-[#7c3aed] hover:shadow-[0_8px_18px_rgba(124,58,237,0.20)] hover:[background-image:none] active:bg-gradient-to-r active:from-[#6d28d9] active:to-[#7c3aed] active:shadow-[0_4px_10px_rgba(124,58,237,0.16)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:w-[220px]"
            >
              {publishingVariants ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {publishingVariants ? 'Publishing…' : 'Publish'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
