'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { AvailabilityEditor } from './AvailabilityEditor'

export default function ParentStudentAvailabilityPage() {
  const params = useParams()
  const studentId = params.studentId as string
  const [studentName, setStudentName] = useState<string>('')

  useEffect(() => {
    if (!studentId) return
    let cancelled = false
    fetch(`/api/parent/students/${studentId}`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (cancelled) return
        const name = json?.data?.name || json?.data?.student?.name
        if (typeof name === 'string') setStudentName(name)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [studentId])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/parent/students/${studentId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Availability</h1>
          <p className="text-sm text-gray-500">
            Set the hours {studentName ? studentName : 'your child'} is free for 1-on-1 sessions.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-orange-500" />
            Weekly availability
          </CardTitle>
          <CardDescription>
            Toggle the hours your child is available. Changes save automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AvailabilityEditor studentId={studentId} studentName={studentName || undefined} />
        </CardContent>
      </Card>
    </div>
  )
}
