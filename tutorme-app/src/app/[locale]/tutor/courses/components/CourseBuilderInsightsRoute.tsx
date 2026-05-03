/**
 * Insights-only course builder shell — `/tutor/insights`.
 * Standalone insights builder shell — edit this file independently.
 */

'use client'

import { Suspense, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  ArrowLeft,
  Loader2,
  BookOpen,
  Edit3,
  MoreVertical,
  Plus,
  Timer,
  LayoutTemplate,
  Save,
  Calendar,
  Trash2,
  Video as VideoIcon,
} from 'lucide-react'
import Link from 'next/link'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { CourseBuilder } from '../../dashboard/components/CourseBuilder'
import { GoLiveDialog } from '../../dashboard/components/GoLiveDialog'
import { toast } from 'sonner'
import type { CourseBuilderInsightsProps } from './course-builder-types'
import {
  useCourseBuilderContentModel,
  type UseCourseBuilderContentArgs,
} from './use-course-builder-content-model'

type Props = UseCourseBuilderContentArgs & {
  insightsProps: CourseBuilderInsightsProps
  sessionCategory?: string | null
  sessionNationality?: string | null
  onSaveCourse?: (lessons: any[], options?: any) => void
  onSyncToLiveSession?: () => void
  onCreateCourse?: () => void
  onDeleteCourse?: () => void
  isCreateDialogOpen?: boolean
  setIsCreateDialogOpen?: (v: boolean) => void
  newCourseName?: string
  setNewCourseName?: (v: string) => void
  onCreateNewCourse?: () => void
  isDeleteDialogOpen?: boolean
  setIsDeleteDialogOpen?: (v: boolean) => void
  onDeleteCourseConfirm?: () => void
  courses?: { id: string; name: string }[]
  draftCourses?: { id: string; name: string }[]
  courseName?: string
  onCourseNameChange?: (name: string) => void
  saveMode?: 'live' | 'draft'
  onSaveModeChange?: (mode: 'live' | 'draft') => void
}

function CourseBuilderInsightsRouteInner({
  courseId,
  insightsProps,
  dataMode = 'default',
  detachedStorageKey,
  detachedCourseName,
  sessionCategory,
  sessionNationality,
  onSaveCourse,
  onSyncToLiveSession,
  onCreateCourse,
  onDeleteCourse,
  isCreateDialogOpen,
  setIsCreateDialogOpen,
  newCourseName,
  setNewCourseName,
  onCreateNewCourse,
  isDeleteDialogOpen,
  setIsDeleteDialogOpen,
  onDeleteCourseConfirm,
  courses,
  draftCourses,
  courseName,
  onCourseNameChange,
  saveMode,
  onSaveModeChange,
}: Props) {
  const model = useCourseBuilderContentModel({
    courseId,
    insightsProps,
    dataMode,
    detachedStorageKey,
    detachedCourseName,
  })

  const [endingSession, setEndingSession] = useState(false)
  const searchParams = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as 'live' | 'builder' | 'test-pci' | null
  const [activeMainTab, setActiveMainTab] = useState<'live' | 'builder' | 'test-pci'>(
    tabFromUrl ?? (insightsProps.sessionId ? 'live' : 'builder')
  )
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [goLiveDialogOpen, setGoLiveDialogOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [leftPanelHidden, setLeftPanelHidden] = useState(false)

  useEffect(() => {
    if (insightsProps.sessionId && !tabFromUrl) {
      setActiveMainTab('live')
    }
  }, [insightsProps.sessionId, tabFromUrl])

  const [now, setNow] = useState(new Date())
  useEffect(() => {
    if (activeMainTab !== 'live') return
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [activeMainTab])

  const currentSession = insightsProps?.sessions?.find(s => s.id === insightsProps?.sessionId)
  const scheduledDateStr = currentSession?.scheduledAt
  const sessionPlannedDurationMinutes = currentSession?.durationMinutes || 60
  let countdownText = '--:--'
  let isOverdue = false
  if (scheduledDateStr && activeMainTab === 'live') {
    const scheduled = new Date(scheduledDateStr).getTime()
    const endTime = scheduled + sessionPlannedDurationMinutes * 60 * 1000
    const diff = endTime - now.getTime()
    if (diff < 0) {
      isOverdue = true
      const absDiff = Math.abs(diff)
      const minutes = Math.floor(absDiff / 60000)
      const seconds = Math.floor((absDiff % 60000) / 1000)
      countdownText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} over`
    } else {
      const minutes = Math.floor(diff / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      countdownText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} remaining`
    }
  }

  const handleStartSessionClick = () => {
    if (insightsProps.sessionId) {
      if (insightsProps.onStartSession) {
        insightsProps.onStartSession()
      } else {
        // Fallback if not provided from parent
        setGoLiveDialogOpen(true)
      }
    } else {
      setGoLiveDialogOpen(true)
    }
  }

  const handleConfirmTeaching = async () => {
    if (!courseId || courseId === 'insights-draft') {
      toast.error('Please save your course first.')
      return
    }

    try {
      const res = await fetch('/api/tutor/classes/start-ad-hoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'teaching', courseId, title: courseName }),
      })
      if (!res.ok) throw new Error('Failed to start session')

      const data = await res.json()
      toast.success('Teaching session started!')
      model.router.push(`/tutor/insights?sessionId=${data.sessionId}`)
    } catch (err) {
      toast.error('Could not start teaching session')
    }
  }

  const handleConfirmTraining = async (data: {
    token: string
    targetAudience: string
    category: string
  }) => {
    try {
      const res = await fetch('/api/tutor/classes/start-ad-hoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'training',
          trainingToken: data.token,
          targetAudience: data.targetAudience,
          trainingCategory: data.category,
          title: 'Training Session',
        }),
      })
      if (!res.ok) {
        if (res.status === 403) throw new Error('Invalid token')
        throw new Error('Failed to start session')
      }

      const resData = await res.json()
      toast.success('Training session started!')
      model.router.push(`/tutor/insights?sessionId=${resData.sessionId}`)
    } catch (err) {
      const error = err as Error
      toast.error(error.message || 'Could not start training session')
    }
  }

  const handleEndSession = async () => {
    if (!insightsProps.sessionId || endingSession) return
    if (!window.confirm('End this session? This will finalize the recording and analytics.')) {
      return
    }
    setEndingSession(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch(`/api/tutor/classes/${insightsProps.sessionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to end session')
      }

      toast.success('Session ended. Recording saved.')
      model.router.push(`/tutor/sessions/${insightsProps.sessionId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to end session')
    } finally {
      setEndingSession(false)
    }
  }

  const handlePublishDraft = async () => {
    if (!courseId || courseId === 'insights-draft') return

    // 1. Trigger save to ensure latest data is persisted
    const saveCb = (model.courseBuilderRef.current as any)?.saveAll
    if (typeof saveCb === 'function') await saveCb()

    // 2. Get current lessons from the builder ref
    const getLessonsCb = (model.courseBuilderRef.current as any)?.getLessons
    const rawLessons = typeof getLessonsCb === 'function' ? getLessonsCb() : []

    let hasNoDmis = false
    const lessons = rawLessons.map((lesson: any) => ({
      ...lesson,
      homework: (lesson.homework || []).map((hw: any) => {
        if (!hw.dmiVersions || hw.dmiVersions.length === 0) {
          hasNoDmis = true
          return hw
        }
        const activeVersionId = hw.activeDmiVersionId || hw.dmiVersions[0].id
        const activeVersion =
          hw.dmiVersions.find((v: any) => v.id === activeVersionId) || hw.dmiVersions[0]
        return {
          ...hw,
          dmiItems: activeVersion.items,
        }
      }),
      tasks: (lesson.tasks || []).map((task: any) => {
        if (!task.dmiVersions || task.dmiVersions.length === 0) {
          return task
        }
        const activeVersionId = task.activeDmiVersionId || task.dmiVersions[0].id
        const activeVersion =
          task.dmiVersions.find((v: any) => v.id === activeVersionId) || task.dmiVersions[0]
        return {
          ...task,
          dmiItems: activeVersion.items,
        }
      }),
    }))

    if (hasNoDmis) {
      if (
        !window.confirm(
          'Some assessments have no DMIs. Are you sure you want to proceed and publish?'
        )
      ) {
        return
      }
    }

    const isExistingDbCourse = courses?.some((c: any) => c.id === courseId)
    const courseTitle = courseName || detachedCourseName || 'Untitled Course'

    try {
      let csrfToken: string | null = null
      try {
        const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
        const csrfData = await csrfRes.json().catch(() => ({}))
        csrfToken = csrfData?.token ?? null
      } catch {
        // proceed without CSRF
      }

      let targetCourseId = courseId

      // If this is a draft-only course, create it in the DB first
      if (!isExistingDbCourse) {
        const createRes = await fetch('/api/tutor/courses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            title: courseTitle,
            categories: [],
            schedule: [],
            isLiveOnline: false,
          }),
        })

        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}))
          toast.error(err.error || 'Failed to create course')
          return
        }

        const newCourseData = await createRes.json()
        targetCourseId = newCourseData.courses?.[0]?.id
        if (!targetCourseId) {
          toast.error('Course created but ID is missing')
          return
        }
      }

      // Save lessons to the course (existing or newly created)
      const saveRes = await fetch(`/api/tutor/courses/${targetCourseId}/course`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(
          {
            lessons,
            developmentMode: 'single',
            previewDifficulty: 'all',
          },
          (key, value) => {
            // Remove any DOM nodes or Window objects
            if (value && (value instanceof Window || value instanceof Node)) {
              return undefined
            }
            return value
          }
        ),
      })

      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}))
        toast.error(err.error || 'Failed to save course content')
        return
      }

      model.router.push(`/tutor/courses/${targetCourseId}`)
    } catch (err: any) {
      console.error('Publish draft error:', err)
      const errMsg = err?.message || String(err) || 'Unknown error'
      toast.error(`Failed to publish course: ${errMsg}`)
    }
  }

  const currentCourse = (saveMode === 'draft' ? draftCourses : courses)?.find(
    c => c.id === courseId
  )

  return (
    <div
      className="text-foreground flex h-screen w-full flex-col items-stretch overflow-hidden bg-[#fafafc]"
      data-tutor-route="insights-builder"
      style={model.themeStyle}
    >
      <div className="sticky top-0 z-10 w-full bg-[#fafafc] px-4 pb-4 pt-4 sm:px-6">
        <div className="flex w-full flex-col gap-4">
          <div className="flex w-full flex-col gap-4 rounded-2xl border border-[#E5E7EB] bg-white px-4 pb-3 pt-4 shadow-[0_8px_20px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Link href="/tutor/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>

              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  {activeMainTab !== 'live' && insightsProps.onCourseChange && (
                    <Select
                      value={courseId ?? ''}
                      onValueChange={v => insightsProps.onCourseChange?.(v)}
                    >
                      <SelectTrigger className="h-9 w-[160px] border-none bg-transparent text-sm font-semibold shadow-none transition-colors hover:bg-slate-100 focus:ring-0">
                        <SelectValue placeholder="Select course" />
                      </SelectTrigger>
                      <SelectContent>
                        {courses && courses.length > 0 && (
                          <SelectItem
                            value="__live-header__"
                            disabled
                            className="text-muted-foreground text-xs font-semibold"
                          >
                            Live Courses
                          </SelectItem>
                        )}
                        {courses?.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                        {draftCourses && draftCourses.length > 0 && (
                          <SelectItem
                            value="__draft-header__"
                            disabled
                            className="text-muted-foreground text-xs font-semibold"
                          >
                            Draft Courses
                          </SelectItem>
                        )}
                        {draftCourses?.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {activeMainTab === 'builder' && saveMode === 'draft' && onCreateCourse && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700"
                      onClick={onCreateCourse}
                      title="New Course"
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  )}

                  {onCourseNameChange && courseId && courseId !== 'insights-draft' && (
                    <input
                      className="h-9 min-w-[200px] rounded-md border-none bg-transparent px-2 text-sm font-semibold transition-colors placeholder:text-gray-400 hover:bg-slate-100 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      value={courseName || ''}
                      onChange={e => {
                        const newName = e.target.value
                        if (newName.trim() !== '') {
                          onCourseNameChange(newName)
                        }
                      }}
                      placeholder="Course Name..."
                    />
                  )}

                  {activeMainTab === 'live' && (
                    <h1 className="text-foreground flex items-center gap-2 text-2xl font-bold tracking-tight">
                      {model.course?.name && (
                        <span className="text-muted-foreground ml-2 text-xl font-normal">
                          {model.course.name}
                        </span>
                      )}
                      {scheduledDateStr && (
                        <span
                          className={cn(
                            'ml-2 flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-medium shadow-sm transition-colors',
                            isOverdue
                              ? 'border-red-200 bg-red-50 text-red-700'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          )}
                        >
                          <Timer className="h-4 w-4" />
                          <span>{countdownText}</span>
                        </span>
                      )}
                    </h1>
                  )}
                  {activeMainTab === 'live' && (sessionCategory || sessionNationality) && (
                    <span className="bg-muted text-muted-foreground ml-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium">
                      {sessionCategory && sessionNationality
                        ? `${sessionCategory} — ${sessionNationality}`
                        : sessionCategory || sessionNationality}
                    </span>
                  )}
                  {activeMainTab !== 'live' &&
                  currentCourse &&
                  (currentCourse as any).categories?.length > 0 ? (
                    <span className="bg-muted text-muted-foreground ml-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium">
                      {(currentCourse as any).categories.join(', ')}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex h-full flex-col items-end justify-between gap-4 pb-0">
              <div className="mt-0 flex shrink-0 items-center gap-2">
                {activeMainTab === 'builder' && onSaveModeChange && (
                  <Select
                    value={saveMode}
                    onValueChange={(val: 'live' | 'draft') => onSaveModeChange(val)}
                  >
                    <SelectTrigger className="h-9 w-[190px] border-slate-200 bg-white text-sm font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="live">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-green-500" />
                          Live
                        </div>
                      </SelectItem>
                      <SelectItem value="draft">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-amber-500" />
                          Editing
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {activeMainTab === 'builder' &&
                  (onSaveCourse ||
                    (onCreateCourse && !insightsProps.sessionId) ||
                    (onDeleteCourse &&
                      !insightsProps.sessionId &&
                      ((courses && courses.length > 1) ||
                        (draftCourses && draftCourses.length > 1))) ||
                    (onCourseNameChange && courseId && courseId !== 'insights-draft')) && (
                    <>
                      {onSaveCourse && (
                        <Button
                          variant="outline"
                          className="gap-2 font-medium text-slate-700 hover:text-slate-900"
                          onClick={async () => {
                            const cb = (model.courseBuilderRef.current as any)?.saveAll
                            if (typeof cb === 'function') {
                              await cb()
                            } else {
                              toast.error('Builder not ready to save')
                            }
                          }}
                        >
                          <Save className="h-4 w-4" />
                          Save
                        </Button>
                      )}
                      {courseId && courseId !== 'insights-draft' && saveMode === 'draft' && (
                        <Button
                          variant="default"
                          className="gap-2 bg-blue-600 font-medium text-white hover:bg-blue-700"
                          onClick={handlePublishDraft}
                        >
                          <Calendar className="h-4 w-4" />
                          Schedule
                        </Button>
                      )}
                      {/* Kebab menu with Go Live and Delete Course */}
                      {((courseId && courseId !== 'insights-draft' && saveMode === 'draft') ||
                        (onDeleteCourse &&
                          !insightsProps.sessionId &&
                          saveMode === 'draft' &&
                          ((courses && courses.length > 1) ||
                            (draftCourses && draftCourses.length > 1)))) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon">
                              <MoreVertical className="h-5 w-5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {courseId && courseId !== 'insights-draft' && saveMode === 'draft' && (
                              <DropdownMenuItem onClick={handleStartSessionClick}>
                                <VideoIcon className="mr-2 h-4 w-4 text-green-600" />
                                Go Live
                              </DropdownMenuItem>
                            )}
                            {onDeleteCourse &&
                              !insightsProps.sessionId &&
                              saveMode === 'draft' &&
                              ((courses && courses.length > 1) ||
                                (draftCourses && draftCourses.length > 1)) && (
                                <DropdownMenuItem
                                  onClick={onDeleteCourse}
                                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Course
                                </DropdownMenuItem>
                              )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </>
                  )}
              </div>
            </div>
          </div>

          {/* The outer container for Course Builder Tabs */}
          <div id="course-builder-tabs-portal" className="w-full"></div>
        </div>
      </div>

      <div className="[&::-webkit-scrollbar-thumb]:bg-border flex w-full flex-1 flex-col overflow-hidden bg-gray-50/50 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
        {model.savedVariants.length > 0 && (
          <Card className="mb-8 w-full border border-emerald-200/50 bg-emerald-50/30 shadow-xl backdrop-blur-md">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-foreground text-sm">Adaptive Variant Join Links</CardTitle>
              <CardDescription>
                Share the correct link with students for each difficulty level.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pb-4">
              {model.savedVariants.map(variant => (
                <div key={variant.batchId} className="bg-card rounded-md border p-2.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-medium capitalize">{variant.difficulty}</p>
                      <p className="text-muted-foreground truncate text-[11px]">
                        {variant.batchName}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(variant.joinLink)
                          toast.success(`${variant.difficulty} join link copied`)
                        } catch {
                          toast.error('Failed to copy link')
                        }
                      }}
                    >
                      Copy Link
                    </Button>
                  </div>
                  <p className="text-muted-foreground mt-1 break-all text-[11px]">
                    {variant.joinLink}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {model.loading ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <CourseBuilder
            ref={model.courseBuilderRef}
            courseId={courseId ?? ''}
            courseName={courseName || model.course?.name}
            initialLessons={model.loadedLessons ?? undefined}
            hideDirectorySearch
            directoryMenusAlwaysVisible
            onSave={onSaveCourse}
            insightsProps={{
              ...insightsProps,
              onEndSession: insightsProps.sessionId ? handleEndSession : undefined,
              onStartSession: handleStartSessionClick,
              endingSession,
            }}
            onMainTabChange={setActiveMainTab}
            initialMainTab={tabFromUrl ?? 'builder'}
            leftPanelHidden={leftPanelHidden}
            onLeftPanelHiddenChange={setLeftPanelHidden}
            saveMode={saveMode}
            onSaveModeChange={onSaveModeChange}
            onSyncToLiveSession={onSyncToLiveSession}
          />
        )}
      </div>
      {/* Create Course Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Course</DialogTitle>
            <DialogDescription>Enter a name for your new course.</DialogDescription>
          </DialogHeader>
          <Input
            value={newCourseName}
            onChange={e => setNewCourseName?.(e.target.value)}
            placeholder="Course name"
            onKeyDown={e => {
              if (e.key === 'Enter') onCreateNewCourse?.()
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen?.(false)}>
              Cancel
            </Button>
            <Button onClick={onCreateNewCourse}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Course Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Course</DialogTitle>
            <DialogDescription>Enter a new name for this course.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            placeholder="Course name"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                onCourseNameChange?.(renameValue)
                setIsRenameDialogOpen(false)
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onCourseNameChange?.(renameValue)
                setIsRenameDialogOpen(false)
              }}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Course Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Course</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this course? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen?.(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDeleteCourseConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GoLiveDialog
        open={goLiveDialogOpen}
        onOpenChange={setGoLiveDialogOpen}
        onConfirmTeaching={handleConfirmTeaching}
        onConfirmTraining={handleConfirmTraining}
      />
    </div>
  )
}

export function CourseBuilderInsightsRoute(props: Props) {
  return (
    <Suspense fallback={null}>
      <CourseBuilderInsightsRouteInner {...props} />
    </Suspense>
  )
}
