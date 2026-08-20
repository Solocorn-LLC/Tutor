'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { TrendingUp, Search, ExternalLink, AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface TutorStudent {
  id: string
  name: string
  email: string
  courseCount: number
  classCount: number
}

interface StudentProgressRow {
  studentId: string
  overallProgress: number
  engagementRate: number
  assignmentCompletion: number
  averageScore: number
  recentRisk: 'low' | 'medium' | 'high'
}

interface StudentProgressCardProps {
  students?: TutorStudent[]
  loading?: boolean
}

const getRiskBadge = (risk: StudentProgressRow['recentRisk']) => {
  if (risk === 'high') return <Badge variant="destructive">Needs attention</Badge>
  if (risk === 'medium') return <Badge variant="secondary">Watch</Badge>
  return <Badge variant="outline">Stable</Badge>
}

export function StudentProgressCard({ students = [], loading }: StudentProgressCardProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [progressRows, setProgressRows] = useState<Record<string, StudentProgressRow>>({})
  const [loadingProgress, setLoadingProgress] = useState(false)

  useEffect(() => {
    let active = true
    const loadProgress = async () => {
      if (students.length === 0) {
        setProgressRows({})
        return
      }

      setLoadingProgress(true)
      try {
        const res = await fetch('/api/tutor/dashboard/student-progress', { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()
        const rows = Array.isArray(data.students) ? data.students : []
        if (!active) return
        const next: Record<string, StudentProgressRow> = {}
        for (const row of rows) {
          if (typeof row?.studentId !== 'string') continue
          next[row.studentId] = row as StudentProgressRow
        }
        setProgressRows(next)
      } catch {
        // Non-fatal: base roster still renders.
      } finally {
        if (active) setLoadingProgress(false)
      }
    }

    loadProgress()
    return () => {
      active = false
    }
  }, [students])

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return students
    return students.filter(
      s => s.name.toLowerCase().includes(query) || s.email.toLowerCase().includes(query)
    )
  }, [searchQuery, students])

  const summary = useMemo(() => {
    const rows = students
      .map(s => progressRows[s.id])
      .filter((r): r is StudentProgressRow => Boolean(r))
    if (rows.length === 0) {
      return { avgProgress: 0, avgEngagement: 0, riskCount: 0 }
    }
    return {
      avgProgress: Math.round(rows.reduce((sum, r) => sum + r.overallProgress, 0) / rows.length),
      avgEngagement: Math.round(rows.reduce((sum, r) => sum + r.engagementRate, 0) / rows.length),
      riskCount: rows.filter(r => r.recentRisk === 'high').length,
    }
  }, [students, progressRows])

  if (loading) {
    return (
      <Card className="border border-slate-200 bg-white/95 shadow-xl backdrop-blur-md">
        <CardContent className="p-6">
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border border-slate-200 bg-white/95 shadow-xl backdrop-blur-md">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            Student Progress
          </CardTitle>
          {summary.riskCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {summary.riskCount} at risk
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-blue-50 p-2">
            <p className="text-lg font-bold text-blue-600">{summary.avgProgress}%</p>
            <p className="text-xs text-blue-500">Avg progress</p>
          </div>
          <div className="rounded-lg bg-green-50 p-2">
            <p className="text-lg font-bold text-green-700">{summary.avgEngagement}%</p>
            <p className="text-xs text-green-600">Engagement</p>
          </div>
          <div className="rounded-lg bg-purple-50 p-2">
            <p className="text-lg font-bold text-purple-700">{students.length}</p>
            <p className="text-xs text-purple-600">Students</p>
          </div>
        </div>
        <div className="relative">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search students"
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">No students found.</p>
        ) : (
          filtered.map(student => {
            const row = progressRows[student.id]
            return (
              <div
                key={student.id}
                className="space-y-2 rounded-lg border border-slate-200 bg-white/50 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{student.name}</p>
                    <p className="text-muted-foreground truncate text-xs">{student.email}</p>
                  </div>
                  {row ? (
                    getRiskBadge(row.recentRisk)
                  ) : (
                    <Badge variant="outline">No metrics yet</Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground flex justify-between text-xs">
                    <span>Progress</span>
                    <span>{row?.overallProgress ?? 0}%</span>
                  </div>
                  <Progress value={row?.overallProgress ?? 0} className="h-2" />
                </div>
                <div className="text-muted-foreground flex items-center justify-between text-xs">
                  <span>Courses: {student.courseCount}</span>
                  <span>Classes: {student.classCount}</span>
                  <span>Score: {row?.averageScore ?? 0}%</span>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/tutor/reports/${student.id}`)}
                  >
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                    Open Report
                  </Button>
                </div>
              </div>
            )
          })
        )}
        {loadingProgress && <p className="text-muted-foreground text-xs">Refreshing metrics…</p>}
      </CardContent>
    </Card>
  )
}
