'use client'

import { useState } from 'react'
import { useAutoScrollOnExpand } from '@/hooks/use-auto-scroll-on-expand'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  BookOpen,
  ChevronRight,
  Loader2,
  Plus,
  List,
  UserPlus,
  FileText,
  School,
  Trophy,
  CalendarClock,
} from 'lucide-react'
import { toast } from 'sonner'
import { ScheduleViewModal } from '@/components/course/ScheduleViewModal'

export interface EnrolledCourse {
  id: string
  name: string
  subject: string
  description: string | null
  progress: number
  completedLessons: number
  totalLessons: number
  lastStudied: string | null
  /** 'browse' = added from Add subject; 'signup' = enrolled via signup/course flow. null = legacy, treat as signup. */
  enrollmentSource?: string | null
}

const VISIBLE_COURSES = 5

interface MyCoursesCardProps {
  courses: EnrolledCourse[]
  onCourseRemoved?: () => void
}

export function MyCoursesCard({ courses, onCourseRemoved }: MyCoursesCardProps) {
  const [showAll, setShowAll] = useState(false)
  const contentRef = useAutoScrollOnExpand(showAll, { delay: 150 })
  const [removingSubject, setRemovingSubject] = useState<string | null>(null)
  const [scheduleCourse, setScheduleCourse] = useState<{ id: string; name: string } | null>(null)

  const visibleCourses =
    showAll || courses.length <= VISIBLE_COURSES ? courses : courses.slice(0, VISIBLE_COURSES)
  const hasMore = courses.length > VISIBLE_COURSES
  const isExpanded = showAll && hasMore

  const getCsrf = async () => {
    const res = await fetch('/api/csrf', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    return data?.token ?? null
  }

  const handleRemove = async (course: EnrolledCourse) => {
    setRemovingSubject(course.subject)
    try {
      const csrf = await getCsrf()
      const res = await fetch('/api/student/subjects/unenroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrf && { 'X-CSRF-Token': csrf }) },
        credentials: 'include',
        body: JSON.stringify({ subjectCode: course.subject }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.message ?? 'Failed to remove subject')
        return
      }
      toast.success('Subject removed')
      onCourseRemoved?.()
    } catch {
      toast.error('Failed to remove subject')
    } finally {
      setRemovingSubject(null)
    }
  }

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="h-5 w-5 text-blue-500" />
            My courses
          </CardTitle>
          <div className="flex items-center gap-2">
            <Link href="/student/courses?tab=browse">
              <Button variant="ghost" size="sm">
                <Plus className="mr-1 h-4 w-4" />
                Add subject
              </Button>
            </Link>
            {courses.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowAll(s => !s)}>
                <List className="mr-1 h-4 w-4" />
                {isExpanded ? 'Show less' : 'Browse all'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {courses.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center">
            <BookOpen className="text-muted-foreground/60 mx-auto mb-3 h-12 w-12" />
            <p className="text-foreground font-medium">No courses yet</p>
            <p className="mt-1 text-sm">Browse subjects and enroll in a course to get started.</p>
            <Link href="/student/courses?tab=browse">
              <Button className="mt-4">Add subject</Button>
            </Link>
          </div>
        ) : (
          <div ref={contentRef} className="space-y-4">
            {visibleCourses.map(course => (
              <div
                key={course.id}
                className="border-border hover:bg-muted/60 flex flex-wrap items-center gap-4 rounded-lg border px-3 py-4 transition-colors sm:py-3"
              >
                <Link
                  href={`/student/subjects/${encodeURIComponent(course.subject)}`}
                  className="flex min-w-0 flex-1 items-center gap-4"
                >
                  <div className="bg-primary/15 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg">
                    <BookOpen className="text-primary h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium">{course.name}</h3>
                    <p className="text-muted-foreground text-sm capitalize">{course.subject}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Progress value={course.progress} className="h-2 flex-1" />
                      <span className="text-muted-foreground w-10 text-right text-xs">
                        {course.progress}%
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="text-muted-foreground h-5 w-5 shrink-0" />
                </Link>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-1">
                  <Button variant="default" size="sm" className="h-8 text-xs" asChild>
                    <Link
                      href={
                        course.enrollmentSource === 'browse'
                          ? `/student/subjects/${encodeURIComponent(course.subject)}/signup`
                          : `/student/courses?subject=${encodeURIComponent(course.subject)}`
                      }
                      onClick={e => e.stopPropagation()}
                    >
                      <School className="mr-1 h-3 w-3" />
                      Enter classroom
                    </Link>
                  </Button>
                  {course.enrollmentSource === 'signup' || course.enrollmentSource == null ? (
                    <Button variant="outline" size="sm" className="h-8 text-xs" disabled>
                      <UserPlus className="mr-1 h-3 w-3" />
                      Enrolled
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                      <Link
                        href={`/student/subjects/${encodeURIComponent(course.subject)}/signup`}
                        onClick={e => e.stopPropagation()}
                      >
                        <UserPlus className="mr-1 h-3 w-3" />
                        Sign up
                      </Link>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                    <Link href="/student/scores" onClick={e => e.stopPropagation()}>
                      <Trophy className="mr-1 h-3 w-3" />
                      My scores
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={e => {
                      e.stopPropagation()
                      setScheduleCourse({ id: course.id, name: course.name })
                    }}
                  >
                    <CalendarClock className="mr-1 h-3 w-3" />
                    Schedule
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                    <Link
                      href={`/student/subjects/${encodeURIComponent(course.subject)}/courses/${encodeURIComponent(course.id)}/details`}
                      onClick={e => e.stopPropagation()}
                    >
                      <FileText className="mr-1 h-3 w-3" />
                      View course details
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 text-xs"
                    onClick={() => handleRemove(course)}
                    disabled={removingSubject === course.subject}
                  >
                    {removingSubject === course.subject ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Remove'
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <ScheduleViewModal
        courseId={scheduleCourse?.id ?? null}
        courseName={scheduleCourse?.name}
        onClose={() => setScheduleCourse(null)}
      />
    </Card>
  )
}
