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
import { ScrollArea } from '@/components/ui/scroll-area'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { BackButton } from '@/components/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
    currency?: string | null
    categories?: string[]
  } | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [categoryTab, setCategoryTab] = useState('global')

  const regionTriggerRef = useRef<HTMLButtonElement>(null)
  const countryTriggerRef = useRef<HTMLButtonElement>(null)
  const [regionDropdownWidth, setRegionDropdownWidth] = useState(0)
  const [countryDropdownWidth, setCountryDropdownWidth] = useState(0)

  useLayoutEffect(() => {
    const measure = () => {
      if (regionTriggerRef.current) {
        setRegionDropdownWidth(regionTriggerRef.current.offsetWidth)
      }
      if (countryTriggerRef.current) {
        setCountryDropdownWidth(countryTriggerRef.current.offsetWidth)
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const totalLessons = useMemo(
    () => course?.modules?.reduce((sum, m) => sum + (m.lessons?.length ?? 0), 0) ?? 0,
    [course?.modules]
  )
  const [categorySearch, setCategorySearch] = useState('')
  const [scheduleSummary, setScheduleSummary] = useState<ScheduleItem[]>([])
  const [infoOpen, setInfoOpen] = useState(true)
  const [categoriesOpen, setCategoriesOpen] = useState(true)
  const [publishingVariants, setPublishingVariants] = useState(false)

  // Available countries based on selected regions
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

  // National exams based on selected countries
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
          // Load tutor's categories from profile if available
          if (data.profile.categories && Array.isArray(data.profile.categories)) {
            setSelectedCategories(data.profile.categories)
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
    // Load categories from course if available, otherwise use tutor profile categories
    if (course.categories && Array.isArray(course.categories)) {
      setSelectedCategories(course.categories)
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
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

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

      const res = await fetch('/api/class/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData?.error || 'Failed to create live class')
      }

      const data = await res.json()
      const sessionId = data?.session?.sessionId
      if (!sessionId) throw new Error('Live class created but session ID is missing')

      toast.success('Live class created. Redirecting…')
      router.push(`/tutor/insights?sessionId=${sessionId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to open live class')
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
      const csrf = await getCsrf()

      const payload: Record<string, unknown> = {
        categories: selectedCategories,
        schedule,
      }

      const trimmedDescription = description.trim()
      if (trimmedDescription) payload.description = trimmedDescription

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

      const res = await fetch(`/api/tutor/courses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(csrf && { 'X-CSRF-Token': csrf }) },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to save')
        return false
      }
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
      toast.success('All changes saved')
      loadCourse()
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
      const csrf = await getCsrf()
      const res = await fetch(`/api/tutor/courses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(csrf && { 'X-CSRF-Token': csrf }) },
        credentials: 'include',
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

  const getCsrf = async () => {
    const res = await fetch('/api/csrf', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    return data?.token ?? null
  }

  // Materials, outline, and course upload functions removed - using simplified course model

  if (loading || !course) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-muted-foreground">Loading course…</p>
      </div>
    )
  }

  // Toggle category selection
  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    )
  }

  // Toggle region selection
  const toggleRegion = (regionId: string) => {
    setSelectedRegions(prev =>
      prev.includes(regionId) ? prev.filter(r => r !== regionId) : [...prev, regionId]
    )
    // Clear countries when region is deselected
    if (selectedRegions.includes(regionId)) {
      const region = REGIONS.find(r => r.id === regionId)
      if (region) {
        setSelectedCountries(prev => prev.filter(c => !region.countries.some(rc => rc.code === c)))
      }
    }
  }

  // Toggle country selection
  const toggleCountry = (countryCode: string) => {
    setSelectedCountries(prev =>
      prev.includes(countryCode) ? prev.filter(c => c !== countryCode) : [...prev, countryCode]
    )
  }

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
                    <Label className="form-label font-semibold text-slate-700">
                      Course Description
                    </Label>
                    <Textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="What will students learn in this course?"
                      rows={2}
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            ref={regionTriggerRef}
                            variant="outline"
                            className="w-full justify-between border-slate-200 bg-white font-normal"
                          >
                            {selectedRegions.length === 0
                              ? 'Select Regions...'
                              : `${selectedRegions.length} Region${selectedRegions.length === 1 ? '' : 's'} Selected`}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          style={{ width: regionDropdownWidth || undefined }}
                          align="start"
                          sideOffset={6}
                          className="rounded-[16px]"
                        >
                          <ScrollArea className="h-[200px]">
                            {REGIONS.map(region => (
                              <DropdownMenuCheckboxItem
                                key={region.id}
                                checked={selectedRegions.includes(region.id)}
                                onCheckedChange={() => toggleRegion(region.id)}
                              >
                                {region.name}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </ScrollArea>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Country Selection */}
                    <div className="flex-1 space-y-3">
                      <Label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <MapPin className="h-4 w-4 text-[#F17623]" />
                        Country
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            ref={countryTriggerRef}
                            variant="outline"
                            className="w-full justify-between border-slate-200 bg-white font-normal"
                            disabled={selectedRegions.length === 0}
                          >
                            {selectedRegions.length === 0
                              ? 'Select Region First'
                              : selectedCountries.length === 0
                                ? 'Select Countries...'
                                : `${selectedCountries.length} Countr${selectedCountries.length === 1 ? 'y' : 'ies'} Selected`}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          variant="metallic"
                          align="start"
                          sideOffset={6}
                          style={{ width: countryDropdownWidth || undefined }}
                          className="max-h-[320px] overflow-y-auto rounded-[16px] p-4"
                        >
                          {availableCountries.length === 0 ? (
                            <div className="py-4 text-center text-xs text-white/70">
                              No countries available
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-3">
                                {availableCountries.map(country => (
                                  <label
                                    key={country.code}
                                    className="flex cursor-pointer items-center gap-2.5 text-sm text-white"
                                  >
                                    <Checkbox
                                      checked={selectedCountries.includes(country.code)}
                                      onCheckedChange={() => toggleCountry(country.code)}
                                      className="border-white/40 data-[state=checked]:bg-white data-[state=checked]:text-slate-900"
                                    />
                                    <span>{country.name}</span>
                                  </label>
                                ))}
                              </div>
                              <div className="mt-4 border-t border-white/10 pt-3 text-xs text-white/60">
                                {selectedCountries.length > 0
                                  ? `${selectedCountries.length} selected`
                                  : 'Select one or more countries'}
                              </div>
                            </>
                          )}
                        </PopoverContent>
                      </Popover>
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
                                          type="checkbox"
                                          checked={selectedCategories.includes(exam)}
                                          onChange={() => toggleCategory(exam)}
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
                                          type="checkbox"
                                          checked={selectedCategories.includes(exam)}
                                          onChange={() => toggleCategory(exam)}
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
                                          type="checkbox"
                                          checked={selectedCategories.includes(exam)}
                                          onChange={() => toggleCategory(exam)}
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
                                          type="checkbox"
                                          checked={selectedCategories.includes(exam)}
                                          onChange={() => toggleCategory(exam)}
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
                                          type="checkbox"
                                          checked={selectedCategories.includes(exam)}
                                          onChange={() => toggleCategory(exam)}
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
                                              onChange={() => toggleCategory(exam)}
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
                      </div>
                    </Tabs>
                  </div>
                </div>

                {/* Selected Categories Summary */}
                {selectedCategories.length > 0 && (
                  <div className="flex items-center gap-2 pt-2 text-sm font-medium text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      {selectedCategories.length} categor
                      {selectedCategories.length === 1 ? 'y' : 'ies'} selected
                    </span>
                  </div>
                )}
              </CardContent>
            ) : null}
          </Card>

          <VariantManager
            ref={variantManagerRef}
            templateCourseId={id}
            selectedCategories={selectedCategories}
            selectedCountryCodes={selectedCountries.length > 0 ? selectedCountries : ['GL']}
            defaultPrice={price === '' ? null : Number(price)}
            defaultCurrency="USD"
            defaultLanguage={languageOfInstruction || 'English'}
            defaultSchedule={schedule}
            onStatsChange={setVariantStats}
            hidePublishAction
          />

          <div className="flex flex-col-reverse justify-end gap-4 pt-2 sm:flex-row sm:items-center">
            <Button
              size="lg"
              variant="default"
              onClick={handleSaveAll}
              disabled={saving}
              className="h-11 w-full rounded-full bg-[#1D4ED8] px-8 text-white shadow-[0_10px_24px_rgba(31,41,51,0.16),0_2px_6px_rgba(31,41,51,0.08)] sm:w-[220px]"
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
                  await variantManagerRef.current?.publish()
                } finally {
                  setPublishingVariants(false)
                }
              }}
              disabled={variantStats.total === 0 || publishingVariants}
              className="h-11 w-full rounded-full bg-[#6D59D8] px-8 text-white shadow-[0_10px_24px_rgba(31,41,51,0.16),0_2px_6px_rgba(31,41,51,0.08)] sm:w-[220px]"
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
