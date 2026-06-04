'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { UserNav } from '@/components/user-nav'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { toast } from 'sonner'
import { Settings, AlertCircle } from 'lucide-react'

import {
  DashboardSkeleton,
  MyCoursesCard,
  DashboardCalendar,
  LearningPathCard,
  MissedClassesCard,
  PendingAssignmentsCard,
} from '../dashboard/components'
import { SpacedRepetitionDashboard } from '@/components/spaced-repetition'
import type { DashboardClass, DashboardData } from '../dashboard/types'
import { getDashboardStrings } from '../dashboard/dashboard-strings'

export default function StudentDashboardDetails() {
  const router = useRouter()
  const { status } = useSession()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData | null>(null)
  const [bookingClassId, setBookingClassId] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [reviewData, setReviewData] = useState<{
    subjectCurves: any[]
    upcomingReviews: any[]
    overdueReviews: any[]
    totalDue: number
    reviewHistory?: any[]
  } | null>(null)

  const strings = getDashboardStrings('en')

  const fetchDashboardData = useCallback(async () => {
    if (status !== 'authenticated') return
    setFetchError(null)
    setLoading(true)

    try {
      const responses = await Promise.all([
        fetch('/api/content').catch(() => null),
        fetch('/api/recommendations').catch(() => null),
        fetch('/api/student/subjects').catch(() => null),
        fetch('/api/student/reviews').catch(() => null),
      ])

      const authErrors = responses.filter(r => r && r.status === 401)
      if (authErrors.length > 0) {
        router.replace('/login')
        return
      }

      const safeJson = async (res: Response | null) => {
        if (!res || !res.ok) return {}
        try {
          return await res.json()
        } catch {
          return {}
        }
      }

      const [contentData, recsData, subjectsData, reviewsData] = await Promise.all(
        responses.map(r => safeJson(r))
      )

      const subjects = subjectsData?.subjects ?? []
      setData({
        contents: contentData?.contents ?? [],
        recommendations: recsData?.recommendations ?? [],
        classes: [],
        courses: subjects.map(
          (s: {
            id: string
            name: string
            subject: string
            description?: string | null
            progress: number
            completedLessons: number
            totalLessons: number
            lastStudied?: string | null
            enrollmentSource?: string | null
          }) => ({
            id: s.id,
            name: s.name,
            subject: s.subject,
            description: s.description ?? null,
            progress: s.progress ?? 0,
            completedLessons: s.completedLessons ?? 0,
            totalLessons: s.totalLessons ?? 0,
            lastStudied: s.lastStudied ?? null,
            enrollmentSource: s.enrollmentSource ?? null,
          })
        ),
      })
      setReviewData(reviewsData?.data || null)
      setLoading(false)
    } catch (error) {
      console.error('Dashboard fetch error:', error)
      setFetchError('error')
      setLoading(false)
    }
  }, [status, router])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
      return
    }
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetchDashboardData()
  }, [status, fetchDashboardData])

  const handleBookClass = async (classId: string) => {
    setBookingClassId(classId)
    try {
      const response = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId }),
      })
      const result = await response.json()

      if (response.ok) {
        if (result.checkoutUrl) {
          toast.success('Redirecting to payment...')
          window.location.href = result.checkoutUrl
          return
        }
        toast.success('Successfully booked session!')
        setData(prev =>
          prev
            ? {
                ...prev,
                classes: prev.classes.map(c =>
                  c.id === classId
                    ? {
                        ...c,
                        isBooked: true,
                        bookingId: result.booking?.id,
                        currentBookings: (c.currentBookings ?? 0) + 1,
                      }
                    : c
                ),
              }
            : null
        )
      } else {
        toast.error(result.error || 'Failed to book session')
      }
    } catch {
      toast.error('An error occurred while booking')
    } finally {
      setBookingClassId(null)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="safe-top sticky top-0 z-sticky border-b bg-white">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <div className="h-7 w-24 animate-pulse rounded bg-gray-200" />
              <div className="h-9 w-9 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        </nav>
        <DashboardSkeleton loadingLabel={strings.loadingDashboard} />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="safe-top sticky top-0 z-sticky border-b bg-white">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex items-center">
              <Link
                href="/student/dashboard"
                className="inline-flex items-center"
                aria-label="Student dashboard"
              >
                <span className="sr-only">Dashboard</span>
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600" aria-hidden="true" />
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <NotificationBell />
              <Link href="/student/settings">
                <Button variant="ghost" size="icon">
                  <Settings className="h-5 w-5" />
                </Button>
              </Link>
              <UserNav />
            </div>
          </div>
        </div>
      </nav>

      <main className="w-full px-4 py-8 sm:px-6 lg:px-8" aria-busy={loading}>
        {fetchError && (
          <div
            role="alert"
            className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
              <p className="text-sm font-medium">{strings.errorLoading}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchDashboardData()}
              className="focus-visible:ring-ring shrink-0 focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {strings.retry}
            </Button>
          </div>
        )}

        <div className="space-y-6">
          <MyCoursesCard courses={data?.courses ?? []} onCourseRemoved={fetchDashboardData} />
          <LearningPathCard />
          <PendingAssignmentsCard />
          <MissedClassesCard />
          <DashboardCalendar
            onRefresh={fetchDashboardData}
            contents={
              (data?.contents ?? []) as {
                id: string
                subject: string
                topic: string
                progress: number
                lastStudied?: string
              }[]
            }
            upcomingClasses={(data?.classes || []).map(
              (
                c: DashboardClass & {
                  scheduledAt?: string
                  tutor?: { name?: string }
                  _count?: { participants?: number }
                  type?: string
                }
              ) => ({
                id: c.id,
                title: c.title,
                subject: c.subject,
                scheduledAt: c.startTime || c.scheduledAt || '',
                duration: c.duration,
                maxStudents: c.maxStudents,
                students: c.currentBookings || c._count?.participants || 0,
                tutorName: c.tutor?.name || 'Unknown Tutor',
                type: (c.type || 'online') as 'online' | 'in-person',
              })
            )}
            bookingClassId={bookingClassId}
            onBookClass={handleBookClass}
          />
          <SpacedRepetitionDashboard
            reviewData={reviewData}
            onRefresh={fetchDashboardData}
            fullWidth={true}
          />
        </div>
      </main>
    </div>
  )
}
