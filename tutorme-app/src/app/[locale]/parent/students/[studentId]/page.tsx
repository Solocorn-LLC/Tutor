'use client'

import { useState, useEffect } from 'react'
import { useParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  ClipboardList,
  Bot,
  Loader2,
  BookOpen,
  Calendar,
  CalendarClock,
  TrendingUp,
  CreditCard,
} from 'lucide-react'

interface StudentData {
  id: string
  name: string
  email: string | null
  relation: string
  enrollments: Array<{
    courseId: string
    courseName: string
    enrolledAt: string
  }>
  level: number | null
  xp: number | null
}

const tabs = [
  {
    id: 'overview',
    label: 'Overview',
    href: (id: string) => `/parent/students/${id}`,
    icon: TrendingUp,
  },
  {
    id: 'assignments',
    label: 'Assignments',
    href: (id: string) => `/parent/students/${id}/assignments`,
    icon: ClipboardList,
  },
  {
    id: 'availability',
    label: 'Availability',
    href: (id: string) => `/parent/students/${id}/availability`,
    icon: CalendarClock,
  },
  {
    id: 'ai-tutor',
    label: 'AI Tutor',
    href: (id: string) => `/parent/students/${id}/ai-tutor`,
    icon: Bot,
  },
  {
    id: 'classes',
    label: 'Classes',
    href: (id: string) => `/parent/students/${id}`,
    icon: Calendar,
  },
  {
    id: 'financial',
    label: 'Finance',
    href: (id: string) => `/parent/students/${id}`,
    icon: CreditCard,
  },
]

export default function StudentDetailPage() {
  const params = useParams()
  const pathname = usePathname()
  const studentId = params.studentId as string
  const [student, setStudent] = useState<StudentData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!studentId) return
    let cancelled = false
    fetch(`/api/parent/students/${studentId}`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (!cancelled && json?.success && json.data) {
          setStudent(json.data)
        }
      })
      .catch(err => console.error('[Parent] Failed to load student data:', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [studentId])

  const isChildRoute = pathname !== `/parent/students/${studentId}`

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!student) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/parent/children">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <p className="text-gray-500">Failed to load student information</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/parent/children">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{student.name}</h1>
            <p className="text-sm text-gray-500">
              {student.email && `${student.email} · `}
              {student.relation}
              {student.level != null && ` · Level ${student.level}`}
              {student.xp != null && ` · ${student.xp} XP`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map(tab => {
          const href = tab.href(studentId)
          const isActive = pathname === href || (tab.id !== 'overview' && pathname.startsWith(href))
          const Icon = tab.icon
          return (
            <Button key={tab.id} variant={isActive ? 'default' : 'outline'} size="sm" asChild>
              <Link href={href} className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            </Button>
          )
        })}
      </div>

      {!isChildRoute && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Enrolled courses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {student.enrollments.length === 0 ? (
                <p className="text-sm text-gray-500">No courses yet</p>
              ) : (
                <ul className="space-y-2">
                  {student.enrollments.map(e => (
                    <li key={e.courseId} className="text-sm">
                      {e.courseName}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">Quick access</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/parent/students/${studentId}/assignments`}>
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Assignments
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/parent/students/${studentId}/ai-tutor`}>
                  <Bot className="mr-2 h-4 w-4" />
                  AI Tutor
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {isChildRoute && <p className="text-sm text-gray-500">Use the tabs above to switch views</p>}
    </div>
  )
}
