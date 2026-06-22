'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { BookOpen, CheckCircle, FileEdit, Layers } from 'lucide-react'

interface ContentOverview {
  summary: {
    totalCourses: number
    publishedCourses: number
    draftCourses: number
    totalLessons: number
  }
  recentCourses: Array<{
    id: string
    name: string
    isPublished: boolean
    createdAt: string
    creatorName: string | null
  }>
}

export default function ContentPage() {
  const [data, setData] = useState<ContentOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/content/overview', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (!cancelled) setData(json)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const s = data?.summary
  const stats = [
    {
      label: 'Total Courses',
      value: s?.totalCourses,
      icon: BookOpen,
      color: 'bg-blue-100 text-blue-600',
    },
    {
      label: 'Published',
      value: s?.publishedCourses,
      icon: CheckCircle,
      color: 'bg-emerald-100 text-emerald-600',
    },
    {
      label: 'Drafts',
      value: s?.draftCourses,
      icon: FileEdit,
      color: 'bg-amber-100 text-amber-600',
    },
    {
      label: 'Lessons',
      value: s?.totalLessons,
      icon: Layers,
      color: 'bg-violet-100 text-violet-600',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Content Management</h1>
        <p className="text-slate-500">Courses and learning materials across the platform</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}
                >
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">{stat.label}</p>
                  {loading ? (
                    <Skeleton className="mt-1 h-7 w-12" />
                  ) : (
                    <p className="text-2xl font-bold">{(stat.value ?? 0).toLocaleString()}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent courses</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !data?.recentCourses?.length ? (
            <p className="py-6 text-center text-slate-500">No courses yet</p>
          ) : (
            <div className="divide-y">
              {data.recentCourses.map(c => (
                <div key={c.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{c.name}</p>
                    <p className="text-sm text-slate-500">
                      {c.creatorName || 'Unknown'} · {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={c.isPublished ? 'default' : 'secondary'} className="text-xs">
                    {c.isPublished ? 'Published' : 'Draft'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
