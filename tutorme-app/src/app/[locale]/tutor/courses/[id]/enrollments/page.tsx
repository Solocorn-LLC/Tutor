'use client'

import { useEffect, useState } from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Users } from 'lucide-react'
import { BackButton } from '@/components/navigation'
import { PendingRefundsPanel } from '@/components/tutor/pending-refunds-panel'
import { toast } from 'sonner'

interface EnrollmentItem {
  id: string
  studentId: string
  studentName: string
  studentEmail: string | null
  batchId: string | null
  batchName: string | null
  enrolledAt: string
  lastActivity: string
  lessonsCompleted: number
  completedAt: string | null
}

export default function TutorCourseEnrollmentsPage() {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const courseId = typeof params?.id === 'string' ? params.id : ''
  const locale = typeof params?.locale === 'string' ? params.locale : 'en'
  const hasLocalePrefix = pathname.startsWith(`/${locale}/`)
  const coursePath = hasLocalePrefix ? `/${locale}/tutor/dashboard` : `/tutor/dashboard`

  const [loading, setLoading] = useState(true)
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([])

  useEffect(() => {
    if (!courseId) return
    const loadEnrollments = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/tutor/courses/${courseId}/enrollments`, {
          credentials: 'include',
        })
        if (!res.ok) throw new Error('Failed to load enrollments')
        const data = await res.json()
        setEnrollments(data.enrollments ?? [])
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load enrollments')
      } finally {
        setLoading(false)
      }
    }

    loadEnrollments()
  }, [courseId])

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Users className="h-5 w-5" />
            Course Enrollments
          </h1>
          <p className="text-muted-foreground text-sm">
            Track students currently enrolled in this course.
          </p>
        </div>
        <BackButton href={coursePath} iconDirection="right" />
      </div>

      <PendingRefundsPanel courseId={courseId} />

      <Card>
        <CardHeader>
          <CardTitle>Enrolled Students</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : enrollments.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              No students enrolled yet.
            </div>
          ) : (
            enrollments.map(enrollment => (
              <div
                key={enrollment.id}
                className="flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{enrollment.studentName}</p>
                  <p className="text-muted-foreground text-xs">
                    {enrollment.studentEmail || 'No email on file'}
                  </p>
                  <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span>Enrolled {new Date(enrollment.enrolledAt).toLocaleDateString()}</span>
                    {enrollment.batchName ? <span>• {enrollment.batchName}</span> : null}
                    {enrollment.completedAt ? <span>• Completed</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{enrollment.lessonsCompleted} lessons</Badge>
                  {enrollment.completedAt ? (
                    <Badge>Completed</Badge>
                  ) : (
                    <Badge variant="outline">Active</Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
