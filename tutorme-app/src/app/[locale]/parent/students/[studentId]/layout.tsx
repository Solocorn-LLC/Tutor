'use client'

import { useState, useEffect } from 'react'
import { useParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  ClipboardList,
  Bot,
  Loader2,
  BookOpen,
  Calendar,
  TrendingUp,
  CreditCard,
} from 'lucide-react'

interface StudentData {
  id: string
  name: string
  email: string | null
  relation: string
  enrollments: Array<{ courseId: string; courseName: string }>
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

export default function StudentLayout({ children }: { children: React.ReactNode }) {
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
        if (!cancelled && json?.success && json.data) setStudent(json.data)
      })
      .catch(err => console.error('[Parent Layout] Failed to load student:', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [studentId])

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
            <h1 className="text-2xl font-bold">
              {loading ? (
                <span className="inline-block h-7 w-32 animate-pulse rounded bg-gray-200" />
              ) : (
                (student?.name ?? 'Student')
              )}
            </h1>
            <p className="text-sm text-gray-500">
              {loading ? (
                <span className="inline-block h-4 w-48 animate-pulse rounded bg-gray-200" />
              ) : (
                <>
                  {student?.email && `${student.email} · `}
                  {student?.relation}
                  {student?.level != null && ` · Level ${student.level}`}
                  {student?.xp != null && ` · ${student.xp} XP`}
                </>
              )}
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

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        children
      )}
    </div>
  )
}
