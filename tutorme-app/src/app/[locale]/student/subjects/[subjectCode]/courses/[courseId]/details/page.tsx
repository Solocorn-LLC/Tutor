'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  BookOpen,
  Loader2,
  User,
  Clock,
  DollarSign,
  Languages,
  Calendar,
  Users,
} from 'lucide-react'

interface ScheduleSlot {
  dayOfWeek?: number
  startTime?: string
  durationMinutes?: number
}

import { BackButton } from '@/components/navigation'

interface CourseDetails {
  id: string
  name: string
  subject: string
  description: string | null
  difficulty: string
  estimatedHours: number
  price: number | null
  currency: string | null
  languageOfInstruction: string | null
  schedule: ScheduleSlot[] | null
  isLiveOnline: boolean
  modulesCount: number
  lessonsCount: number
  studentCount?: number
  enrolled?: boolean
  creator: {
    id: string
    name: string
    bio: string | null
  } | null
}

export default function CourseDetailsPage() {
  const params = useParams()
  const subjectCode = typeof params.subjectCode === 'string' ? params.subjectCode : ''
  const courseId = typeof params.courseId === 'string' ? params.courseId : ''
  const [data, setData] = useState<CourseDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const coursesUrl = `/student/subjects/${encodeURIComponent(subjectCode)}/courses`
  const enrollUrl = `/student/subjects/${encodeURIComponent(subjectCode)}/courses/${encodeURIComponent(courseId)}`

  useEffect(() => {
    if (!courseId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/courses/${encodeURIComponent(courseId)}`, { credentials: 'include' })
      .then(res => {
        if (res.status === 404) throw new Error('Course not found')
        if (!res.ok) throw new Error('Failed to load course')
        return res.json()
      })
      .then((d: CourseDetails) => {
        if (!cancelled) setData(d)
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load course')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [courseId])

  const formatPrice = (price: number | null, currency: string | null) => {
    if (price == null || price === 0) return 'Free'
    const curr = currency ?? 'SGD'
    return `${curr} ${Number(price).toFixed(2)}`
  }

  const formatSchedule = (schedule: ScheduleSlot[] | null) => {
    if (!schedule || !Array.isArray(schedule) || schedule.length === 0) return null
    return schedule
      .map(s => {
        const day =
          typeof s.dayOfWeek === 'number'
            ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.dayOfWeek]
            : ''
        const time = s.startTime ?? ''
        const mins = s.durationMinutes ?? 0
        return `${day} ${time} (${mins} min)`.trim()
      })
      .filter(Boolean)
      .join(' · ')
  }

  const backUrl = `/student/subjects/${encodeURIComponent(subjectCode)}/courses`

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-3xl p-4 sm:p-6">
          <BackButton href={backUrl} className="mb-4" />
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-xl p-4 sm:p-6">
          <Link
            href={coursesUrl}
            className="mb-6 inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to courses
          </Link>
          <Card className="border-destructive/50">
            <CardContent className="pt-6">
              <p className="text-destructive text-sm">{error ?? 'Course not found'}</p>
              <Button variant="outline" asChild className="mt-4">
                <Link href={coursesUrl}>Back to courses</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const scheduleText = formatSchedule(data.schedule)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <Link
          href={coursesUrl}
          className="mb-6 inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to courses
        </Link>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg">
                <BookOpen className="text-primary h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-xl">{data.name}</CardTitle>
                <CardDescription className="mt-1 flex flex-wrap gap-2">
                  {data.difficulty && (
                    <Badge variant="secondary" className="capitalize">
                      {data.difficulty}
                    </Badge>
                  )}
                  {data.subject && (
                    <span className="capitalize">{data.subject.replace(/-/g, ' ')}</span>
                  )}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {data.description && (
              <div>
                <h3 className="mb-1 text-sm font-medium text-gray-700">Description</h3>
                <p className="text-muted-foreground whitespace-pre-wrap text-sm">
                  {data.description}
                </p>
              </div>
            )}

            {data.creator && (
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                  <User className="h-4 w-4" />
                  Tutor
                </h3>
                <div className="bg-muted/30 rounded-lg border p-3">
                  <p className="font-medium">{data.creator.name}</p>
                  {data.creator.bio && (
                    <p className="text-muted-foreground mt-1 text-sm">{data.creator.bio}</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="text-muted-foreground h-4 w-4" />
                <span>
                  <strong>Duration:</strong> {data.estimatedHours} hours estimated
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="text-muted-foreground h-4 w-4" />
                <span>
                  <strong>Price:</strong> {formatPrice(data.price, data.currency)}
                </span>
              </div>
              {data.languageOfInstruction && (
                <div className="flex items-center gap-2 text-sm">
                  <Languages className="text-muted-foreground h-4 w-4" />
                  <span>
                    <strong>Language:</strong> {data.languageOfInstruction}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <BookOpen className="text-muted-foreground h-4 w-4" />
                <span>
                  {data.modulesCount} modules · {data.lessonsCount} lessons
                </span>
              </div>
              {data.studentCount != null && data.studentCount > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Users className="text-muted-foreground h-4 w-4" />
                  <span>{data.studentCount} students enrolled</span>
                </div>
              )}
            </div>

            {data.isLiveOnline && (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                Live online sessions available
              </p>
            )}

            {scheduleText && (
              <div>
                <h3 className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Calendar className="h-4 w-4" />
                  Schedule
                </h3>
                <p className="text-muted-foreground text-sm">{scheduleText}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-4">
              <Button asChild>
                <Link href={enrollUrl}>
                  {data.enrolled ? 'View enrollment' : 'Enroll or view details'}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={coursesUrl}>Back to course list</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
