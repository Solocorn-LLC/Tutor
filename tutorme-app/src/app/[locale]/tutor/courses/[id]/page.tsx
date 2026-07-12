/**
 * Tutor course management page
 * Course/materials source, language, price, shareable link, student count, schedule
 */

'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { Checkbox } from '@/components/ui/checkbox'
import { REGIONS } from '@/lib/data/tutor-categories'
import { ArrowLeft, BookOpen, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { sanitizeHtmlWithMax } from '@/lib/security/sanitize'
import { cn } from '@/lib/utils'

import type { ScheduleItem } from './constants'
import { VariantManager, type VariantManagerHandle } from './components/VariantManager'

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
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [tutorProfile, setTutorProfile] = useState<{
    userId?: string
    id?: string
    currency?: string | null
    categories?: string[]
  } | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  const totalLessons = useMemo(
    () => course?.modules?.reduce((sum, m) => sum + (m.lessons?.length ?? 0), 0) ?? 0,
    [course?.modules]
  )
  const [infoOpen, setInfoOpen] = useState(true)
  const [publishingVariants, setPublishingVariants] = useState(false)

  // Country selection for publishing. Each selected country becomes its own
  // variant (category × country); 'GL' publishes worldwide as a single variant.
  const [selectedRegion, setSelectedRegion] = useState<string>('global')
  const [selectedCountryCodes, setSelectedCountryCodes] = useState<string[]>(['GL'])

  const regionCountries = useMemo(() => {
    const region = REGIONS.find(r => r.id === selectedRegion)
    return region ? region.countries : []
  }, [selectedRegion])

  const handleRegionChange = useCallback((regionId: string) => {
    setSelectedRegion(regionId)
    if (regionId === 'global') setSelectedCountryCodes(['GL'])
  }, [])

  const toggleCountry = useCallback((code: string) => {
    setSelectedCountryCodes(prev => {
      const next = prev.includes(code)
        ? prev.filter(c => c !== code)
        : // drop the Global stand-in as soon as a real country is chosen
          [...prev.filter(c => c !== 'GL'), code]
      return next.length > 0 ? next : ['GL']
    })
  }, [])

  const countryLabel = useCallback((code: string): string => {
    if (code === 'GL') return 'Global'
    for (const region of REGIONS) {
      const match = region.countries.find(c => c.code === code)
      if (match) return match.name
    }
    return code
  }, [])

  // Prefill the country picker from the course's already-published variants so a
  // re-published course reflects its real countries instead of defaulting to
  // Global (which would otherwise add a spurious Global variant next to them).
  useEffect(() => {
    if (!id) return
    let active = true
    fetch(`/api/tutor/courses/${id}/publish`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { variants: [] }))
      .then((data: { variants?: Array<{ nationality?: string }> }) => {
        if (!active) return
        const nationalities = [
          ...new Set((data.variants ?? []).map(v => v.nationality).filter(Boolean)),
        ] as string[]
        if (nationalities.length === 0) return // no variants yet → keep Global default
        const codes: string[] = []
        let regionId = ''
        for (const nat of nationalities) {
          if (nat === 'Global') {
            codes.push('GL')
            continue
          }
          for (const region of REGIONS) {
            const match = region.countries.find(c => c.name === nat)
            if (match) {
              codes.push(match.code)
              if (region.id !== 'global') regionId = region.id
              break
            }
          }
        }
        if (codes.length > 0) {
          setSelectedCountryCodes(codes)
          if (regionId) setSelectedRegion(regionId)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [id])

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
          if (
            data.profile.categories &&
            Array.isArray(data.profile.categories) &&
            data.profile.categories.length > 0
          ) {
            setSelectedCategories([data.profile.categories[0]])
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

  // Materials upload removed - using simplified course model
  // (Ad-hoc "Open in Live Class" retired — sessions come from the schedule, and
  // one-off sessions are created via the sessions modal's "Create one-time session".)

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

  // Materials, outline, and course upload functions removed - using simplified course model

  if (loading || !course) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-muted-foreground">Loading course…</p>
      </div>
    )
  }

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
    <div className="h-full min-h-screen bg-white pb-12">
      <div className="mx-auto w-full max-w-[1400px] px-4 pt-8 sm:px-6">
        <div className="space-y-6">
          <div className="relative">
            <div className="absolute left-[5px] top-1/2 z-10 -translate-y-1/2">
              <button
                type="button"
                onClick={() => router.push(`/tutor/insights?tab=builder&courseId=${id}&mode=edit`)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/30 hover:text-white"
                aria-label="Go back"
              >
                <ArrowLeft className="h-5 w-5" style={{ color: 'white' }} />
              </button>
            </div>
            <div className="panel-header panel-header-metallic course-top-header w-full text-left">
              <div className="relative flex items-center justify-center">
                <div className="text-center">
                  <div className="panel-header-title">Course Details</div>
                  <div className="panel-header-subtext">
                    Manage all information and settings for your course.
                  </div>
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
            <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
              <h2 className="text-sm font-semibold text-slate-800">Publish to countries</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Pick a region, then the countries to publish this course to — each becomes its own
                variant. Leave it as Global to publish once, worldwide.
              </p>
            </div>
            <CardContent className="space-y-4 bg-white p-6 text-slate-900">
              <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-slate-700">Region</Label>
                  <Select value={selectedRegion} onValueChange={handleRegionChange}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select a region" />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIONS.map(r => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-slate-700">Countries</Label>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
                    {regionCountries.map(c => (
                      <label
                        key={c.code}
                        className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
                      >
                        <Checkbox
                          checked={selectedCountryCodes.includes(c.code)}
                          onCheckedChange={() => toggleCountry(c.code)}
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Publishing to:{' '}
                <span className="font-medium text-slate-700">
                  {selectedCountryCodes.map(countryLabel).join(', ')}
                </span>
              </p>
            </CardContent>
          </Card>

          <VariantManager
            ref={variantManagerRef}
            templateCourseId={id}
            templateCourseName={courseName}
            selectedCategories={selectedCategories}
            selectedCountryCodes={selectedCountryCodes}
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
              onClick={async () => {
                // Save persists course details, and schedule edits for variants
                // that are ALREADY published — without publishing anything new
                // (saveSchedules runs in schedulesOnly mode, a no-op for an
                // unpublished course). Save never puts a course live.
                const saved = await handleSaveAll()
                if (saved) {
                  await variantManagerRef.current?.saveSchedules()
                }
              }}
              disabled={saving}
              className="h-11 w-full rounded-full border-2 border-transparent bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-8 text-white shadow-[0_6px_16px_rgba(37,99,235,0.16),0_2px_4px_rgba(0,0,0,0.08)] transition-all duration-200 ease-in-out hover:translate-y-0 hover:border-[#2563eb] hover:bg-white hover:text-[#2563eb] hover:shadow-[0_8px_18px_rgba(37,99,235,0.18)] hover:[background-image:none] active:bg-gradient-to-r active:from-[#1d4ed8] active:to-[#1e40af] active:shadow-[0_4px_10px_rgba(37,99,235,0.16)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:w-[220px]"
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
              className="h-11 w-full rounded-full border-2 border-transparent bg-gradient-to-r from-[#7c3aed] to-[#8b5cf6] px-8 text-white shadow-[0_6px_16px_rgba(124,58,237,0.18),0_2px_4px_rgba(0,0,0,0.08)] transition-all duration-200 ease-in-out hover:translate-y-0 hover:border-[#7c3aed] hover:bg-white hover:text-[#7c3aed] hover:shadow-[0_8px_18px_rgba(124,58,237,0.20)] hover:[background-image:none] active:bg-gradient-to-r active:from-[#6d28d9] active:to-[#7c3aed] active:shadow-[0_4px_10px_rgba(124,58,237,0.16)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:w-[220px]"
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
