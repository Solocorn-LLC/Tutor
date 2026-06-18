'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BookOpen,
  Loader2,
  FileText,
  GraduationCap,
  Users,
  Clock,
  CalendarClock,
} from 'lucide-react'
import { useNavigationOverlay } from '@/components/navigation/NavigationOverlay'
import { TutorList } from './components/TutorList'
import { DASHBOARD_THEMES, getThemeStyle } from '@/components/dashboard-theme'
import { BackButton } from '@/components/navigation'
import { ScheduleViewModal } from '@/components/course/ScheduleViewModal'
import { cn } from '@/lib/utils'

interface CourseListItem {
  id: string
  name: string
  subject: string
  description: string | null
  difficulty: string
  estimatedHours: number
  price: number | null
  currency: string | null
  modulesCount: number
  lessonsCount: number
  studentCount: number
  createdAt: string
}

export default function SubjectCoursesPage() {
  const { showOverlay } = useNavigationOverlay()
  const params = useParams()
  const subjectCode = typeof params.subjectCode === 'string' ? params.subjectCode : ''
  const [courses, setCourses] = useState<CourseListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scheduleCourse, setScheduleCourse] = useState<{ id: string; name: string } | null>(null)

  // Theme state with localStorage persistence
  const [themeId, setThemeId] = useState('current')
  const selectedTheme = DASHBOARD_THEMES.find(theme => theme.id === themeId) ?? DASHBOARD_THEMES[0]
  const themeStyle = getThemeStyle(selectedTheme)

  useEffect(() => {
    const savedTheme = localStorage.getItem('student-dashboard-theme')
    if (savedTheme) {
      setThemeId(savedTheme)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('student-dashboard-theme', themeId)
  }, [themeId])

  const subjectLabel = subjectCode.charAt(0).toUpperCase() + subjectCode.slice(1).replace(/-/g, ' ')
  const signupUrl = `/student/subjects/${encodeURIComponent(subjectCode)}/signup`

  useEffect(() => {
    if (!subjectCode) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/courses/list?subject=${encodeURIComponent(subjectCode)}`, {
      credentials: 'include',
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load courses')
        return res.json()
      })
      .then((data: { courses: CourseListItem[] }) => {
        if (!cancelled) setCourses(data.courses ?? [])
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load courses')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [subjectCode])

  const formatPrice = (price: number | null, currency: string | null) => {
    if (price == null || price === 0) return 'Free'
    const curr = currency ?? 'SGD'
    return `${curr} ${Number(price).toFixed(2)}`
  }

  return (
    <div className="bg-background text-foreground min-h-screen" style={themeStyle}>
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <div className="mb-6 flex items-center justify-between">
          <BackButton href={signupUrl} />
          {/* Theme Selector */}
          <Select value={themeId} onValueChange={setThemeId}>
            <SelectTrigger className="border-border bg-card text-foreground h-8 w-[160px] text-xs">
              <SelectValue placeholder="Theme" />
            </SelectTrigger>
            <SelectContent>
              {DASHBOARD_THEMES.map(theme => (
                <SelectItem key={theme.id} value={theme.id}>
                  {theme.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <h1 className="text-foreground mb-2 text-2xl font-semibold">
          Choose a Course / Tutor — {subjectLabel}
        </h1>
        <p className="text-muted-foreground mb-6 text-sm">
          Select a course to enroll or find a tutor for personalized help.
        </p>

        <Tabs defaultValue="courses" className="space-y-6">
          <TabsList className="bg-muted grid w-full grid-cols-2">
            <TabsTrigger value="courses" className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              Courses
            </TabsTrigger>
            <TabsTrigger value="tutors" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Tutors
            </TabsTrigger>
          </TabsList>

          <TabsContent value="courses" className="space-y-4">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
              </div>
            )}

            {error && (
              <Card className="border-destructive/50 bg-card">
                <CardContent className="pt-6">
                  <p className="text-destructive text-sm">{error}</p>
                  <Button variant="outline" asChild className="mt-4">
                    <Link href={signupUrl}>Back to signup</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {!loading && !error && courses.length === 0 && (
              <Card className="border-border bg-card">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center py-8 text-center">
                    <BookOpen className="text-muted mb-4 h-12 w-12" />
                    <p className="text-muted-foreground mb-4">
                      No courses available for {subjectLabel} yet.
                    </p>
                    <Button variant="outline" asChild>
                      <Link href={signupUrl}>Back to signup</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {!loading && !error && courses.length > 0 && (
              <ul className="space-y-4">
                {courses.map(c => (
                  <li key={c.id}>
                    <div
                      className={cn(
                        'group relative flex flex-col overflow-hidden rounded-[20px] text-left transition-all duration-300',
                        'border border-[rgba(255,255,255,0.08)]',
                        'bg-[rgba(30,40,50,0.65)] backdrop-blur-[12px]',
                        'shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_25px_rgba(0,0,0,0.30)]',
                        'hover:-translate-y-[2px] hover:brightness-105',
                        'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_14px_30px_rgba(0,0,0,0.40)]'
                      )}
                      style={{
                        backgroundImage:
                          'linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.00) 65%), linear-gradient(145deg, rgba(55, 65, 75, 0.85), rgba(25, 35, 45, 0.95))',
                      }}
                    >
                      <div className="flex flex-col p-5">
                        <h3 className="text-xl font-semibold text-slate-100">{c.name}</h3>
                        {c.difficulty && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.08)] px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-200">
                              {c.difficulty}
                            </span>
                          </div>
                        )}

                        {c.description && (
                          <p className="mt-4 line-clamp-2 text-sm text-slate-300">
                            {c.description}
                          </p>
                        )}

                        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" /> {c.estimatedHours}h estimated
                          </span>
                          <span className="flex items-center gap-1.5">
                            <BookOpen className="h-3.5 w-3.5" /> {c.modulesCount} modules ·{' '}
                            {c.lessonsCount} lessons
                          </span>
                          {c.studentCount > 0 && (
                            <span className="flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5" /> {c.studentCount} students
                            </span>
                          )}
                          <span className="ml-auto text-sm font-semibold text-emerald-400">
                            {formatPrice(c.price, c.currency)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3 border-t border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.1)] p-4">
                        <Link
                          href={`/student/subjects/${encodeURIComponent(subjectCode)}/courses/${encodeURIComponent(c.id)}`}
                          onClick={() => showOverlay()}
                          className="inline-flex flex-1 items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                        >
                          Select Course
                        </Link>
                        <Link
                          href={`/student/subjects/${encodeURIComponent(subjectCode)}/courses/${encodeURIComponent(c.id)}/details`}
                          onClick={() => showOverlay()}
                          className="inline-flex flex-1 items-center justify-center rounded-full border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-[rgba(255,255,255,0.15)]"
                        >
                          <FileText className="mr-2 h-4 w-4 text-[rgba(255,255,255,0.7)]" />
                          View Details
                        </Link>
                        <button
                          type="button"
                          onClick={() => setScheduleCourse({ id: c.id, name: c.name })}
                          className="inline-flex items-center justify-center rounded-full border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-[rgba(255,255,255,0.15)]"
                        >
                          <CalendarClock className="mr-2 h-4 w-4 text-[rgba(255,255,255,0.7)]" />
                          View Schedule
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <ScheduleViewModal
              courseId={scheduleCourse?.id ?? null}
              courseName={scheduleCourse?.name}
              onClose={() => setScheduleCourse(null)}
            />
          </TabsContent>

          <TabsContent value="tutors">
            <TutorList subjectCode={subjectCode} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
