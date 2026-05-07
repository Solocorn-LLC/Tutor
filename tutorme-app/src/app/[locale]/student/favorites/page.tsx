'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { Heart, BookOpen, Users, Star, Trash2, ExternalLink } from 'lucide-react'

interface FavoriteTutor {
  id: string
  name: string
  username: string
  bio: string
  avatarUrl: string | null
  specialties: string[]
  courseCount: number
  averageRating?: number
  totalReviewCount?: number
}

interface FavoriteCourse {
  id: string
  name: string
  description: string | null
  subject: string
  difficulty: string
  estimatedHours: number
  moduleCount: number
  lessonCount: number
  price?: number | null
  currency?: string | null
  tutorName?: string
  tutorUsername?: string
  rating?: number
  reviewCount?: number
}

export default function StudentFavoritesPage() {
  const params = useParams<{ locale?: string }>()
  const locale = typeof params?.locale === 'string' ? params.locale : 'en'

  const [activeTab, setActiveTab] = useState('tutors')
  const [favoriteTutors, setFavoriteTutors] = useState<FavoriteTutor[]>([])
  const [favoriteCourses, setFavoriteCourses] = useState<FavoriteCourse[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFavorites()
  }, [])

  const loadFavorites = async () => {
    setLoading(true)
    try {
      const saved = localStorage.getItem('tutorme-favorites')
      if (!saved) {
        setLoading(false)
        return
      }

      const parsed = JSON.parse(saved)
      const tutorIds = parsed.tutors || []
      const courseIds = parsed.courses || []

      // Fetch tutor details
      if (tutorIds.length > 0) {
        const tutorsRes = await fetch('/api/public/tutors?ids=' + tutorIds.join(','))
        if (tutorsRes.ok) {
          const data = await tutorsRes.json()
          setFavoriteTutors(data.tutors || [])
        }
      }

      // Fetch course details
      if (courseIds.length > 0) {
        const coursesRes = await fetch('/api/course/batch?ids=' + courseIds.join(','))
        if (coursesRes.ok) {
          const data = await coursesRes.json()
          setFavoriteCourses(data.curricula || [])
        }
      }
    } catch (error) {
      console.error('Failed to load favorites:', error)
    } finally {
      setLoading(false)
    }
  }

  const removeTutor = (tutorId: string) => {
    const saved = localStorage.getItem('tutorme-favorites')
    if (saved) {
      const parsed = JSON.parse(saved)
      parsed.tutors = (parsed.tutors || []).filter((id: string) => id !== tutorId)
      localStorage.setItem('tutorme-favorites', JSON.stringify(parsed))
      setFavoriteTutors(prev => prev.filter(t => t.id !== tutorId))
      toast.success('Removed from favorites')
    }
  }

  const removeCourse = (courseId: string) => {
    const saved = localStorage.getItem('tutorme-favorites')
    if (saved) {
      const parsed = JSON.parse(saved)
      parsed.courses = (parsed.courses || []).filter((id: string) => id !== courseId)
      localStorage.setItem('tutorme-favorites', JSON.stringify(parsed))
      setFavoriteCourses(prev => prev.filter(c => c.id !== courseId))
      toast.success('Removed from favorites')
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Favorites</h1>
        <p className="text-muted-foreground">Your saved tutors and courses for quick access.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="tutors">
            Tutors
            {favoriteTutors.length > 0 && (
              <span className="bg-muted ml-2 rounded-full px-2 py-0.5 text-xs">
                {favoriteTutors.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="courses">
            Courses
            {favoriteCourses.length > 0 && (
              <span className="bg-muted ml-2 rounded-full px-2 py-0.5 text-xs">
                {favoriteCourses.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tutors" className="space-y-4">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="space-y-3">
                    <div className="bg-muted h-6 w-2/3 rounded" />
                    <div className="bg-muted h-4 w-1/2 rounded" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : favoriteTutors.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Heart className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
                <h3 className="mb-2 text-lg font-medium">No favorite tutors yet</h3>
                <p className="text-muted-foreground mb-4">
                  Browse tutors and click the heart icon to save them here.
                </p>
                <Button asChild>
                  <Link href={`/${locale}/student/tutors`}>Book a Tutor</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {favoriteTutors.map(tutor => (
                <Card key={tutor.id} className="relative">
                  <button
                    onClick={() => removeTutor(tutor.id)}
                    className="hover:bg-muted absolute right-3 top-3 rounded-full p-2 transition-colors"
                  >
                    <Trash2 className="text-muted-foreground h-4 w-4 hover:text-red-500" />
                  </button>
                  <CardHeader>
                    <div className="flex items-start gap-3 pr-8">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={tutor.avatarUrl || undefined} alt={tutor.name} />
                        <AvatarFallback className="bg-indigo-100 font-bold text-indigo-600">
                          {tutor.name
                            .split(' ')
                            .map(n => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-lg">{tutor.name}</CardTitle>
                        <CardDescription>@{tutor.username}</CardDescription>
                      </div>
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-sm">
                      {tutor.bio || 'Experienced tutor ready to help you improve quickly.'}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {tutor.averageRating && (
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="font-medium">{tutor.averageRating.toFixed(1)}</span>
                        <span className="text-muted-foreground text-sm">
                          ({tutor.totalReviewCount} reviews)
                        </span>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {tutor.specialties.slice(0, 3).map(specialty => (
                        <Badge key={specialty} variant="secondary">
                          {specialty}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between border-t pt-2">
                      <span className="text-muted-foreground text-sm">
                        {tutor.courseCount} courses
                      </span>
                      <Button asChild size="sm">
                        <Link href={`/${locale}/u/${tutor.username}`}>
                          View Profile
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="courses" className="space-y-4">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="space-y-3">
                    <div className="bg-muted h-6 w-2/3 rounded" />
                    <div className="bg-muted h-4 w-1/2 rounded" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : favoriteCourses.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BookOpen className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
                <h3 className="mb-2 text-lg font-medium">No favorite courses yet</h3>
                <p className="text-muted-foreground mb-4">
                  Browse courses and click the heart icon to save them here.
                </p>
                <Button asChild>
                  <Link href={`/${locale}/course`}>Explore Courses</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {favoriteCourses.map(course => (
                <Card key={course.id} className="relative">
                  <button
                    onClick={() => removeCourse(course.id)}
                    className="hover:bg-muted absolute right-3 top-3 rounded-full p-2 transition-colors"
                  >
                    <Trash2 className="text-muted-foreground h-4 w-4 hover:text-red-500" />
                  </button>
                  <CardHeader>
                    <div className="pr-8">
                      <CardTitle className="text-lg">{course.name}</CardTitle>
                      <CardDescription>{course.subject}</CardDescription>
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-sm">
                      {course.description || 'No description available.'}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{course.difficulty}</Badge>
                      {course.estimatedHours > 0 && (
                        <Badge variant="outline">{course.estimatedHours} hours</Badge>
                      )}
                    </div>
                    {course.rating && (
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="font-medium">{course.rating.toFixed(1)}</span>
                        <span className="text-muted-foreground text-sm">
                          ({course.reviewCount} reviews)
                        </span>
                      </div>
                    )}
                    <div className="text-muted-foreground flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-4 w-4" />
                        {course.moduleCount} modules
                      </span>
                      <span>{course.lessonCount} lessons</span>
                    </div>
                    {course.tutorName && (
                      <p className="text-sm">
                        By{' '}
                        <Link
                          href={course.tutorUsername ? `/${locale}/u/${course.tutorUsername}` : '#'}
                          className="text-indigo-600 hover:text-indigo-800"
                        >
                          {course.tutorName}
                        </Link>
                      </p>
                    )}
                    <div className="flex items-center justify-between border-t pt-2">
                      {course.price && (
                        <span className="text-lg font-bold">
                          {course.currency === 'USD' ? '$' : course.currency + ' '}
                          {course.price}
                        </span>
                      )}
                      <Button asChild size="sm">
                        <Link href={`/${locale}/course/${course.id}`}>
                          View Course
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
