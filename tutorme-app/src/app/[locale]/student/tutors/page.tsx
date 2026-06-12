'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
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
import { BookOpen, Calendar, Compass, Search, Sparkles, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
  const { data: session } = useSession()
  const { showOverlay } = useNavigationOverlay()
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

  const [greeting, setGreeting] = useState('Good morning')
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 18) setGreeting('Good afternoon')
    else setGreeting('Good evening')

    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

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

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })

  return (
    <div className="text-foreground flex h-full flex-col overflow-hidden">
      <div className="flex h-full w-full flex-col px-3 lg:px-4">
        {/* Hero */}
        <div className="mb-4 flex-shrink-0">
          <Card className="overflow-hidden rounded-[18px] border border-white/10 bg-gradient-to-br from-[#F97316] to-[#EA580C] shadow-[0_14px_45px_rgba(0,0,0,0.12)] ring-1 ring-white/20">
            <div className="relative z-10 flex min-h-[180px] flex-col p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-0.5 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-white/70" />
                    <span className="text-sm font-medium text-white/70">
                      {greeting}, {session?.user?.name?.split(' ')[0] || 'Student'}
                    </span>
                  </div>
                  <h1 className="text-3xl font-bold text-white">Find Your Tutor</h1>
                  <p className="mt-1 max-w-2xl text-sm text-white/80">
                    Explore tutor profiles, compare subjects and courses, and open any tutor profile
                    instantly.
                  </p>
                </div>

                <div
                  className={cn(
                    'flex flex-wrap items-center justify-end gap-2',
                    loading && 'animate-pulse'
                  )}
                >
                  <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm">
                    <Users className="h-4 w-4 text-white/80" />
                    <span className="text-xs font-medium text-white/80">Tutors</span>
                    <span className="text-sm font-bold text-white">
                      {headlineMetrics.tutorCount}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm">
                    <BookOpen className="h-4 w-4 text-white/80" />
                    <span className="text-xs font-medium text-white/80">Published Courses</span>
                    <span className="text-sm font-bold text-white">
                      {headlineMetrics.totalCourses}
                    </span>
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

              {/* Action bar */}
              <div className="mt-auto flex flex-wrap items-center justify-end gap-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-white/80">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {formatDate(currentTime)} •{' '}
                    {currentTime.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <Button
                  asChild
                  size="sm"
                  className="gap-1.5 rounded-lg bg-white px-4 text-sm font-semibold text-[#EA580C] hover:bg-white/90"
                >
                  <Link href={`/${locale}/student/courses`}>
                    <Compass className="h-4 w-4" />
                    My Courses
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Search & Filter */}
        <Card className="mb-4 flex-shrink-0 overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
          <CardHeader className="pb-2">
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

        {/* Tutor grid */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid items-stretch gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <Card
                  key={`loading-${index}`}
                  className="animate-pulse overflow-hidden rounded-[20px] border border-white/10 bg-[rgba(30,40,50,0.65)] shadow-[0_12px_30px_rgba(0,0,0,0.25)]"
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
              <Card className="col-span-full overflow-hidden rounded-[20px] border border-white/10 bg-[rgba(30,40,50,0.65)] shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
                <CardHeader>
                  <CardTitle className="text-white">No tutors match your current filters</CardTitle>
                  <CardDescription className="text-white/70">
                    Try broadening search terms or selecting a different subject or country.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              tutors.map(tutor => (
                <TutorCard
                  key={tutor.id}
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
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
