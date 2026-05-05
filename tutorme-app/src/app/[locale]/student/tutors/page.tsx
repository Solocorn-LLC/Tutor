'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BookOpen,
  Compass,
  ExternalLink,
  Search,
  Sparkles,
  Users,
  Star,
  Heart,
  Video,
  Calendar,
  UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { DASHBOARD_THEMES, getThemeStyle } from '@/components/dashboard-theme'
import { cn } from '@/lib/utils'

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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function StarRating({ rating, count }: { rating: number; count?: number }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
      <span className="ml-1 text-base font-medium text-slate-100">{rating.toFixed(1)}</span>
      {count !== undefined && <span className="ml-1 text-slate-400">({count})</span>}
    </div>
  )
}

export default function StudentTutorDirectoryPage() {
  const params = useParams<{ locale?: string }>()
  const router = useRouter()
  const locale = typeof params?.locale === 'string' ? params.locale : 'en'

  const [loading, setLoading] = useState(true)
  const [tutors, setTutors] = useState<TutorDirectoryItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [nationalities, setNationalities] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [nationalityFilter, setNationalityFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'popular' | 'newest' | 'courses' | 'rate'>('popular')
  const [following, setFollowing] = useState<Set<string>>(new Set())

  // Theme state with localStorage persistence
  const [themeId, setThemeId] = useState('current')
  const selectedTheme = DASHBOARD_THEMES.find(theme => theme.id === themeId) ?? DASHBOARD_THEMES[0]
  const themeStyle = getThemeStyle(selectedTheme)

  useEffect(() => {
    const savedTheme = localStorage.getItem('student-dashboard-theme')
    if (savedTheme) {
      setThemeId(savedTheme)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('student-dashboard-theme', themeId)
  }, [themeId])

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
        if (categoryFilter !== 'all') qs.set('subject', categoryFilter)
        if (nationalityFilter !== 'all') qs.set('nationality', nationalityFilter)
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
        setCategories(Array.isArray(data?.availableCategories) ? data.availableCategories : [])
        setNationalities(
          Array.isArray(data?.availableNationalities) ? data.availableNationalities : []
        )
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
  }, [searchQuery, categoryFilter, nationalityFilter, sortBy])

  const headlineMetrics = useMemo(() => {
    const totalCourses = tutors.reduce((sum, tutor) => sum + tutor.courseCount, 0)
    const totalEnrollments = tutors.reduce((sum, tutor) => sum + tutor.totalEnrollments, 0)
    return {
      tutorCount: tutors.length,
      totalCourses,
      totalEnrollments,
    }
  }, [tutors])

  return (
    <div
      className="min-h-screen w-full space-y-6 bg-white p-4 text-slate-900 sm:p-6"
      style={themeStyle}
    >
      <Card className="overflow-hidden border border-slate-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
        <div className="bg-gradient-to-br from-sky-50/80 via-cyan-50/80 to-emerald-50/80 p-6 sm:p-8 dark:from-sky-950/30 dark:via-cyan-950/30 dark:to-emerald-950/30">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Find Your Tutor</h1>
              <p className="max-w-2xl text-sm text-slate-600">
                Explore tutor profiles, compare subjects and courses, and open any tutor profile
                instantly.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Theme Selector */}
              <Select value={themeId} onValueChange={setThemeId}>
                <SelectTrigger className="h-9 w-[150px] border-slate-200 bg-white text-xs text-slate-900">
                  <SelectValue placeholder="Theme" />
                </SelectTrigger>
                <SelectContent>
                  {DASHBOARD_THEMES.map(theme => (
                    <SelectItem key={theme.id} value={theme.id}>
                      {theme.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button asChild>
                <Link href={`/${locale}/student/courses`}>
                  <Compass className="mr-2 h-4 w-4" />
                  Go to My Courses
                </Link>
              </Button>
            </div>
          </div>
        </div>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3 sm:p-6">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_10px_30px_rgba(0,0,0,0.10)]">
            <p className="text-xs uppercase tracking-wide text-slate-500">Tutors</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {headlineMetrics.tutorCount}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_10px_30px_rgba(0,0,0,0.10)]">
            <p className="text-xs uppercase tracking-wide text-slate-500">Published Courses</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {headlineMetrics.totalCourses}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_10px_30px_rgba(0,0,0,0.10)]">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total Enrollments</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {headlineMetrics.totalEnrollments}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-slate-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
        <CardHeader>
          <CardTitle className="text-slate-900">Search & Filter</CardTitle>
          <CardDescription className="text-slate-600">
            Refine by keywords, subject, country, and ranking.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search tutor, subject, specialty..."
              className="border-slate-200 bg-white pl-9 text-slate-900"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="border-slate-200 bg-white text-slate-900">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(category => (
                <SelectItem key={category} value={category.toLowerCase()}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={nationalityFilter} onValueChange={setNationalityFilter}>
            <SelectTrigger className="border-slate-200 bg-white text-slate-900">
              <SelectValue placeholder="Filter by country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              {nationalities.map(nat => (
                <SelectItem key={nat} value={nat.toLowerCase()}>
                  {nat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={value => setSortBy(value as typeof sortBy)}>
            <SelectTrigger className="border-slate-200 bg-white text-slate-900">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="popular">Most Popular</SelectItem>
              <SelectItem value="newest">Recently Updated</SelectItem>
              <SelectItem value="courses">Most Courses</SelectItem>
              <SelectItem value="rate">Highest Rated</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <Card
              key={`loading-${index}`}
              className="animate-pulse border border-slate-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]"
            >
              <CardHeader className="space-y-2 p-4">
                <div className="h-5 w-2/3 rounded bg-slate-100" />
                <div className="h-3 w-1/2 rounded bg-slate-100" />
              </CardHeader>
              <CardContent className="space-y-2 p-4 pt-0">
                <div className="h-3 rounded bg-slate-100" />
                <div className="h-3 rounded bg-slate-100" />
              </CardContent>
            </Card>
          ))
        ) : tutors.length === 0 ? (
          <Card className="col-span-full border border-slate-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
            <CardHeader>
              <CardTitle className="text-slate-900">No tutors match your current filters</CardTitle>
              <CardDescription className="text-slate-600">
                Try broadening search terms or selecting a different subject or country.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          tutors.map(tutor => (
            <div
              key={tutor.id}
              className={cn(
                'group relative flex cursor-pointer flex-col overflow-hidden rounded-[20px] text-left transition-all duration-300',
                'border border-[rgba(255,255,255,0.12)]',
                'bg-[rgba(30,40,50,0.65)] backdrop-blur-[12px]',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_12px_30px_rgba(0,0,0,0.35)]',
                'hover:-translate-y-[2px] hover:brightness-105',
                'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_14px_30px_rgba(0,0,0,0.40)]',
                ''
              )}
              style={{
                backgroundImage:
                  'linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.00) 65%), linear-gradient(145deg, rgba(70, 110, 180, 0.75), rgba(25, 55, 110, 0.95))',
              }}
              onClick={() => router.push(`/${locale}/u/${tutor.username}`)}
            >
              <div className="flex flex-col p-5">
                {/* Header */}
                <div className="flex items-start gap-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.03)] shadow-[0_6px_16px_rgba(0,0,0,0.35)] sm:h-24 sm:w-24">
                    <img
                      src={tutor.avatarUrl || undefined}
                      alt={tutor.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col pt-1">
                    <h3 className="truncate text-lg font-semibold leading-tight text-slate-50">
                      {tutor.name}
                    </h3>
                    <p className="text-xs font-medium text-slate-300">@{tutor.username}</p>
                    <p className="mt-1 truncate text-xs text-slate-300">
                      {tutor.specialties?.[0] ||
                        tutor.categories?.[0] ||
                        'Experienced tutor ready to help'}
                    </p>
                  </div>
                </div>

                {/* Bio — supports up to ~500 chars */}
                <div className="mt-3 text-sm leading-relaxed text-slate-100">
                  {tutor.bio || 'Experienced tutor ready to help you improve quickly.'}
                </div>

                {/* Rating */}
                <div className="mt-3">
                  <StarRating
                    rating={tutor.averageRating || 0}
                    count={tutor.totalReviewCount || 0}
                  />
                </div>

                {/* Tags */}
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {tutor.categories.slice(0, 3).map(category => (
                      <span
                        key={`${tutor.id}:${category}`}
                        className="rounded-full border border-[rgba(255,255,255,0.2)] px-2.5 py-0.5 text-[11px] text-slate-200"
                      >
                        {category}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(tutor.tutorNationalities || []).slice(0, 3).map(nat => (
                      <span
                        key={`${tutor.id}:nat:${nat}`}
                        className="rounded-full border border-[rgba(255,255,255,0.2)] px-2.5 py-0.5 text-[11px] text-slate-200"
                      >
                        {nat}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div className="my-3 border-b border-[rgba(255,255,255,0.1)]" />

                {/* Stats — icon + label + number on one line */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] px-3 py-2">
                    <BookOpen className="h-4 w-4 text-slate-300" />
                    <span className="text-xs text-slate-300">Courses</span>
                    <span className="ml-auto text-sm font-semibold text-slate-100">
                      {tutor.courseCount}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] px-3 py-2">
                    <Users className="h-4 w-4 text-slate-300" />
                    <span className="text-xs text-slate-300">Enrollments</span>
                    <span className="ml-auto text-sm font-semibold text-slate-100">
                      {tutor.totalEnrollments}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Button
                    asChild
                    variant="solocorn-book"
                    className="h-auto rounded-xl py-2.5 text-sm"
                  >
                    <Link
                      href={`/${locale}/u/${tutor.username}?book=1`}
                      onClick={e => e.stopPropagation()}
                    >
                      <Video className="h-4 w-4" />
                      Book 1 on 1
                    </Link>
                  </Button>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      toggleFollow(tutor.id)
                    }}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-all duration-200',
                      following.has(tutor.id)
                        ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-50 hover:bg-emerald-500/30'
                        : 'border-white/50 bg-transparent text-white hover:border-transparent hover:bg-white hover:text-[#0B3A9B]'
                    )}
                  >
                    <UserPlus className="h-4 w-4" />
                    {following.has(tutor.id) ? 'Following' : 'Follow'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
