'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BookOpen, Search, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useStudentNav } from '../StudentNavContext'
import { REGIONS } from '@/lib/data/tutor-categories'
import { useNavigationOverlay } from '@/components/navigation/NavigationOverlay'
import { TutorCard } from '../subjects/[subjectCode]/courses/components/TutorCard'

interface TutorCoursePreview {
  id: string
  name: string
  categories: string[]
  enrollmentCount: number
  moduleCount: number
  lessonCount: number
  updatedAt: string
  price?: number | null
  currency?: string | null
  rating?: number
  reviewCount?: number
}

interface TutorDirectoryItem {
  id: string
  name: string
  username: string
  bio: string
  avatarUrl: string | null
  specialties: string[]
  hourlyRate: number | null
  courseCount: number
  totalEnrollments: number
  categories: string[]
  tutorNationalities?: string[]
  latestCourseUpdatedAt: string | null
  coursePreview: TutorCoursePreview[]
  averageRating?: number
  totalReviewCount?: number
}

export default function StudentTutorDirectoryPage() {
  const params = useParams<{ locale?: string }>()
  const router = useRouter()
  const { showOverlay } = useNavigationOverlay()
  const locale = typeof params?.locale === 'string' ? params.locale : 'en'

  const [loading, setLoading] = useState(true)
  const [tutors, setTutors] = useState<TutorDirectoryItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('')
  const [selectedCountryCode, setSelectedCountryCode] = useState('')
  const [sortBy, setSortBy] = useState<'popular' | 'newest' | 'courses' | 'rate'>('popular')

  const availableCountries = useMemo(() => {
    const region = REGIONS.find(r => r.id === selectedRegion)
    return region ? region.countries : []
  }, [selectedRegion])
  const [following, setFollowing] = useState<Set<string>>(new Set())

  // Load following from API on mount
  useEffect(() => {
    const loadFollowing = async () => {
      try {
        const res = await fetch('/api/follows/list')
        if (res.ok) {
          const data = await res.json()
          setFollowing(new Set(data.following.map((t: any) => t.id)))
        }
      } catch (error) {
        console.error('Failed to load following list:', error)
      }
    }
    loadFollowing()
  }, [])

  // Toggle follow
  const toggleFollow = async (tutorId: string) => {
    const isFollowing = following.has(tutorId)
    const method = isFollowing ? 'DELETE' : 'POST'
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch('/api/follows', {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
        },
        credentials: 'include',
        body: JSON.stringify({ tutorId }),
      })
      if (res.ok) {
        setFollowing(prev => {
          const next = new Set(prev)
          if (isFollowing) {
            next.delete(tutorId)
            toast.success('Unfollowed tutor')
          } else {
            next.add(tutorId)
            toast.success('Following tutor')
          }
          return next
        })
      } else {
        const data = await res.json()
        toast.error(data.error || `Failed to ${isFollowing ? 'unfollow' : 'follow'} tutor`)
      }
    } catch (error) {
      toast.error('Network error. Please try again.')
    }
  }

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      try {
        const qs = new URLSearchParams()
        if (searchQuery.trim()) qs.set('q', searchQuery.trim())
        if (selectedRegion && selectedRegion !== 'global' && selectedCountryCode) {
          qs.set('country', selectedCountryCode)
        }
        qs.set('sort', sortBy)

        const res = await fetch(`/api/public/tutors?${qs.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!res.ok) throw new Error('Failed to load tutors')
        const data = await res.json()
        if (!active) return

        const enrichedTutors = Array.isArray(data?.tutors) ? data.tutors : []

        setTutors(enrichedTutors)
      } catch {
        if (!active) return
        setTutors([])
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [searchQuery, selectedRegion, selectedCountryCode, sortBy])

  const headlineMetrics = useMemo(() => {
    const totalCourses = tutors.reduce((sum, tutor) => sum + tutor.courseCount, 0)
    const totalEnrollments = tutors.reduce((sum, tutor) => sum + tutor.totalEnrollments, 0)
    return {
      tutorCount: tutors.length,
      totalCourses,
      totalEnrollments,
    }
  }, [tutors])
  const { desktopNavOpen } = useStudentNav()

  return (
    <div className="text-foreground flex min-h-full flex-col bg-white px-6 pb-6 pt-2">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[20px] border border-white/10 bg-gradient-to-br from-[#F97316] to-[#EA580C] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.20)] ring-1 ring-white/20">
        <div className="relative flex flex-wrap items-center justify-center gap-3">
          <div className="text-center">
            <h2 className="text-xl font-bold text-white">Solocorn Tutors</h2>
            <p className="mt-1 text-sm text-white/60">Find and book your tutor</p>
          </div>

          <div
            className={cn(
              'flex w-full flex-wrap items-center justify-center gap-2 md:absolute md:right-5 md:top-1/2 md:w-auto md:-translate-y-1/2 md:justify-end',
              loading && 'animate-pulse'
            )}
          >
            <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm">
              <Users className="h-4 w-4 text-white/80" />
              <span className="text-xs font-medium text-white/80">Tutors</span>
              <span className="text-sm font-bold text-white">{headlineMetrics.tutorCount}</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm">
              <BookOpen className="h-4 w-4 text-white/80" />
              <span className="text-xs font-medium text-white/80">Published Courses</span>
              <span className="text-sm font-bold text-white">{headlineMetrics.totalCourses}</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm">
              <Users className="h-4 w-4 text-white/80" />
              <span className="text-xs font-medium text-white/80">Total Enrollments</span>
              <span className="text-sm font-bold text-white">
                {headlineMetrics.totalEnrollments}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <div className="py-4 sm:py-6">
        <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search tutor, subject, specialty..."
                className="border-slate-200 bg-white pl-9 text-slate-900 placeholder:text-slate-400"
              />
            </div>
            <Select
              value={selectedRegion}
              onValueChange={value => {
                setSelectedRegion(value)
                setSelectedCountryCode('')
              }}
            >
              <SelectTrigger className="h-10 w-full rounded-lg border border-slate-700/25 bg-white/30 text-slate-700 shadow-[0_4px_12px_rgba(0,0,0,0.15)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-[1px] hover:border-slate-700/50 hover:bg-white/60 hover:shadow-[0_6px_16px_rgba(0,0,0,0.20)] focus:outline-none focus-visible:!shadow-none focus-visible:outline-none disabled:border-slate-400/20 disabled:bg-slate-100/20 disabled:text-slate-400 disabled:backdrop-blur-none">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-lg border border-slate-700/25 bg-white/30 bg-none p-1.5 shadow-lg backdrop-blur-xl">
                {REGIONS.map(region => (
                  <SelectItem
                    key={region.id}
                    value={region.id}
                    className="mx-1.5 rounded-md text-slate-700 hover:bg-slate-100/50 focus:bg-slate-100/50 focus:text-slate-900 focus:outline-none"
                  >
                    {region.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedCountryCode}
              onValueChange={setSelectedCountryCode}
              disabled={!selectedRegion || selectedRegion === 'global'}
            >
              <SelectTrigger className="h-10 w-full rounded-lg border border-slate-700/25 bg-white/30 text-slate-700 shadow-[0_4px_12px_rgba(0,0,0,0.15)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-[1px] hover:border-slate-700/50 hover:bg-white/60 hover:shadow-[0_6px_16px_rgba(0,0,0,0.20)] focus:outline-none focus-visible:!shadow-none focus-visible:outline-none disabled:border-slate-400/20 disabled:bg-slate-100/20 disabled:text-slate-400 disabled:backdrop-blur-none disabled:hover:translate-y-0 disabled:hover:border-slate-400/20 disabled:hover:bg-slate-100/20 disabled:hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-lg border border-slate-700/25 bg-white/30 bg-none p-1.5 shadow-lg backdrop-blur-xl">
                {availableCountries.map(country => (
                  <SelectItem
                    key={country.code}
                    value={country.code}
                    className="mx-1.5 rounded-md text-slate-700 hover:bg-slate-100/50 focus:bg-slate-100/50 focus:text-slate-900 focus:outline-none"
                  >
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={value => setSortBy(value as typeof sortBy)}>
              <SelectTrigger className="h-10 w-full rounded-lg border border-slate-700/25 bg-white/30 text-slate-700 shadow-[0_4px_12px_rgba(0,0,0,0.15)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-[1px] hover:border-slate-700/50 hover:bg-white/60 hover:shadow-[0_6px_16px_rgba(0,0,0,0.20)] focus:outline-none focus-visible:!shadow-none focus-visible:outline-none">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-lg border border-slate-700/25 bg-white/30 bg-none p-1.5 shadow-lg backdrop-blur-xl">
                <SelectItem
                  value="popular"
                  className="mx-1.5 rounded-md text-slate-700 hover:bg-slate-100/50 focus:bg-slate-100/50 focus:text-slate-900 focus:outline-none"
                >
                  Most Popular
                </SelectItem>
                <SelectItem
                  value="newest"
                  className="mx-1.5 rounded-md text-slate-700 hover:bg-slate-100/50 focus:bg-slate-100/50 focus:text-slate-900 focus:outline-none"
                >
                  Recently Updated
                </SelectItem>
                <SelectItem
                  value="courses"
                  className="mx-1.5 rounded-md text-slate-700 hover:bg-slate-100/50 focus:bg-slate-100/50 focus:text-slate-900 focus:outline-none"
                >
                  Most Courses
                </SelectItem>
                <SelectItem
                  value="rate"
                  className="mx-1.5 rounded-md text-slate-700 hover:bg-slate-100/50 focus:bg-slate-100/50 focus:text-slate-900 focus:outline-none"
                >
                  Highest Rated
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tutor grid */}
      <div className="h-[calc(100vh-380px)] min-h-[400px] flex-1 overflow-y-auto rounded-[18px] bg-slate-50/50 p-4">
        <div
          className={cn(
            'grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4',
            !desktopNavOpen && 'lg:gap-8'
          )}
        >
          {loading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <Card
                key={`loading-${index}`}
                className="animate-pulse overflow-hidden rounded-[20px] border border-white/10 bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] shadow-[0_12px_30px_rgba(0,0,0,0.25)]"
              >
                <CardHeader className="space-y-2 p-4">
                  <div className="h-5 w-2/3 rounded bg-white/10" />
                  <div className="h-3 w-1/2 rounded bg-white/10" />
                </CardHeader>
                <CardContent className="space-y-2 p-4 pt-0">
                  <div className="h-3 rounded bg-white/10" />
                  <div className="h-3 rounded bg-white/10" />
                </CardContent>
              </Card>
            ))
          ) : tutors.length === 0 ? (
            <Card className="col-span-full overflow-hidden rounded-[20px] border border-white/10 bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
              <CardHeader>
                <CardTitle className="text-white">No tutors match your current filters</CardTitle>
                <CardDescription className="text-white/70">
                  Try broadening search terms or selecting a different region or country.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            tutors.map(tutor => (
              <TutorCard
                key={tutor.id}
                compact
                tutor={{
                  id: tutor.id,
                  username: tutor.username,
                  name: tutor.name,
                  avatar: tutor.avatarUrl,
                  bio: tutor.bio,
                  rating: tutor.averageRating || 0,
                  reviewCount: tutor.totalReviewCount || 0,
                  hourlyRate: tutor.hourlyRate,
                  currency: 'SGD',
                  nextAvailableSlot: null,
                  totalStudents: tutor.totalEnrollments,
                  totalClasses: tutor.courseCount,
                  specialties: tutor.categories,
                  countries: tutor.tutorNationalities,
                }}
                onClick={() => {
                  showOverlay()
                  router.push(`/${locale}/u/${tutor.username}`)
                }}
                followState={following.has(tutor.id) ? 'following' : 'not-following'}
                onFollowToggle={() => toggleFollow(tutor.id)}
                bookHref={`/${locale}/u/${tutor.username}?book=1`}
                countryLabel={tutor.tutorNationalities?.[0] ?? '--'}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
