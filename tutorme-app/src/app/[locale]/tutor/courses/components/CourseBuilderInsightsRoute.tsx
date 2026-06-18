/**
 * Insights-only course builder shell — `/tutor/insights`.
 * Standalone insights builder shell — edit this file independently.
 */

'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
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
import { BackButton } from '@/components/navigation/BackButton'
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
import { useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { CourseBuilder } from '../../dashboard/components/CourseBuilder'
import { GoLiveDialog } from '../../dashboard/components/GoLiveDialog'
import { toast } from 'sonner'
import type { CourseBuilderInsightsProps } from './course-builder-types'
import {
  useCourseBuilderContentModel,
  type UseCourseBuilderContentArgs,
} from './use-course-builder-content-model'
import { saveCourse, resolveLessonDmis } from './save-course'
import type { ScheduleItem } from '../[id]/constants'
import { VariantScheduleEditor } from '../[id]/components/VariantScheduleEditor'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { DollarSign, Languages } from 'lucide-react'

type Props = UseCourseBuilderContentArgs & {
  insightsProps: CourseBuilderInsightsProps
  sessionCategory?: string | null
  sessionNationality?: string | null
  onSaveCourse?: (lessons: any[], options?: any) => void
  onSyncToLiveSession?: (silent?: boolean) => void
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
  courses?: {
    id: string
    name: string
    nationality?: string
    variantCategory?: string
    isPublished?: boolean
    isVariant?: boolean
    categories?: string[]
    schedule?: ScheduleItem[]
  }[]
  draftCourses?: {
    id: string
    name: string
    nationality?: string
    variantCategory?: string
    isPublished?: boolean
    isVariant?: boolean
    categories?: string[]
    schedule?: ScheduleItem[]
  }[]
  courseName?: string
  onCourseNameChange?: (name: string) => void
  saveMode?: 'live' | 'draft'
  onSaveModeChange?: (mode: 'live' | 'draft') => void
  modeLocked?: boolean
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
  modeLocked,
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
  const pathname = usePathname()
  const isClassroomMode =
    (pathname?.startsWith('/tutor/classroom') ?? false) || searchParams.get('view') === 'classroom'
  const tabFromUrl = searchParams.get('tab') as 'live' | 'builder' | 'test-pci' | null
  const [activeMainTab, setActiveMainTab] = useState<'live' | 'builder' | 'test-pci'>(
    isClassroomMode ? 'live' : (tabFromUrl ?? (insightsProps.sessionId ? 'live' : 'builder'))
  )
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [goLiveDialogOpen, setGoLiveDialogOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [leftPanelHidden, setLeftPanelHidden] = useState(false)
  const router = useRouter()

  // Reschedule dialog state
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [rescheduleName, setRescheduleName] = useState('')
  const [rescheduleCategory, setRescheduleCategory] = useState('')
  const [reschedulePrice, setReschedulePrice] = useState<string>('')
  const [rescheduleCurrency, setRescheduleCurrency] = useState('USD')
  const [rescheduleIsFree, setRescheduleIsFree] = useState(false)
  const [rescheduleLanguage, setRescheduleLanguage] = useState('')
  const [rescheduleSchedule, setRescheduleSchedule] = useState<ScheduleItem[]>([])
  const [rescheduleSaving, setRescheduleSaving] = useState(false)

  useEffect(() => {
    if (isClassroomMode) {
      setActiveMainTab('live')
      return
    }
    if (insightsProps.sessionId && !tabFromUrl) {
      setActiveMainTab('live')
    }
  }, [insightsProps.sessionId, tabFromUrl, isClassroomMode])

  // Prevent tab switching away from live in classroom mode
  const handleMainTabChange = useCallback(
    (tab: 'live' | 'builder' | 'test-pci') => {
      if (isClassroomMode) {
        setActiveMainTab('live')
        return
      }
      setActiveMainTab(tab)
    },
    [isClassroomMode]
  )

  const [now, setNow] = useState(new Date())
  useEffect(() => {
    if (activeMainTab !== 'live') return
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [activeMainTab])

  const hasNoCourses =
    (!courses || courses.length === 0) && (!draftCourses || draftCourses.length === 0)

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
      model.router.push(`/tutor/classroom?sessionId=${data.sessionId}`)
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
      model.router.push(`/tutor/classroom?sessionId=${resData.sessionId}`)
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

    // 3. Resolve active DMI versions
    const { lessons, hasMissingDmis } = resolveLessonDmis(rawLessons)

    if (hasMissingDmis) {
      if (
        !window.confirm(
          'Some assessments have no DMIs. Are you sure you want to proceed and publish?'
        )
      ) {
        return
      }
    }

    const isExistingDbCourse = courses?.some((c: any) => c.id === courseId)

    // 4. Publish via shared save function
    const result = await saveCourse({
      courseId,
      lessons,
      mode: 'publish',
      courseName,
      detachedCourseName,
      developmentMode: 'single',
      previewDifficulty: 'all',
      isExistingDbCourse,
    })

    if (result.success && result.courseId) {
      model.router.push(`/tutor/courses/${result.courseId}`)
    } else {
      toast.error(result.error || 'Failed to publish course')
    }
  }

  // Search both lists regardless of saveMode so the selected course is always found
  const currentCourse = [...(courses || []), ...(draftCourses || [])].find(c => c.id === courseId)
  const isCoursePublished = currentCourse?.isPublished === true
  const isCourseVariant = currentCourse?.isVariant === true
  const originalSchedule = currentCourse?.schedule || []

  // Reschedule handlers
  const openRescheduleDialog = useCallback(() => {
    if (!currentCourse) return
    setRescheduleName(`${currentCourse.name} — Rescheduled`)
    setRescheduleCategory(currentCourse.variantCategory || currentCourse.categories?.[0] || '')
    setReschedulePrice('')
    setRescheduleCurrency('USD')
    setRescheduleIsFree(false)
    setRescheduleLanguage('')
    setRescheduleSchedule([])
    setRescheduleDialogOpen(true)
  }, [currentCourse])

  const closeRescheduleDialog = useCallback(() => {
    setRescheduleDialogOpen(false)
    setRescheduleName('')
    setRescheduleCategory('')
    setReschedulePrice('')
    setRescheduleCurrency('USD')
    setRescheduleIsFree(false)
    setRescheduleLanguage('')
    setRescheduleSchedule([])
  }, [])

  const handleRescheduleSave = useCallback(async () => {
    if (!courseId || courseId === 'insights-draft') {
      toast.error('Cannot reschedule: invalid course')
      return
    }
    setRescheduleSaving(true)
    try {
      const payload = {
        name: rescheduleName,
        category: rescheduleCategory,
        price: rescheduleIsFree ? 0 : reschedulePrice ? parseFloat(reschedulePrice) : null,
        currency: rescheduleCurrency,
        isFree: rescheduleIsFree,
        languageOfInstruction: rescheduleLanguage,
        schedule: rescheduleSchedule,
      }
      const res = await fetchWithCsrf(`/api/tutor/courses/${courseId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { courseId?: string; name?: string }
        toast.success(`Independent course "${data.name || rescheduleName}" created`)
        closeRescheduleDialog()
        if (data.courseId) {
          router.push(`/tutor/courses/${data.courseId}`)
        }
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data?.error || 'Failed to create independent course')
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to create independent course')
    } finally {
      setRescheduleSaving(false)
    }
  }, [
    courseId,
    rescheduleName,
    rescheduleCategory,
    reschedulePrice,
    rescheduleCurrency,
    rescheduleIsFree,
    rescheduleLanguage,
    rescheduleSchedule,
    router,
    closeRescheduleDialog,
  ])

  return (
    <div
      className="text-foreground flex h-screen w-full flex-col items-stretch overflow-hidden bg-[#fafafc]"
      data-tutor-route="insights-builder"
      style={model.themeStyle}
    >
      <div className="sticky top-0 z-10 w-full bg-[#fafafc] pb-4 pt-4">
        <div className="flex w-full flex-col gap-4">
          <div className="flex min-h-[72px] w-full flex-col gap-4 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-[0_8px_20px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <BackButton href="/tutor/dashboard" />

              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  {/* Course selector — locked to read-only when a session is active */}
                  {activeMainTab !== 'live' && insightsProps.sessionId && currentCourse && (
                    <div className="flex h-9 min-w-[160px] max-w-[320px] items-center px-2 text-sm font-semibold text-slate-700">
                      {currentCourse.nationality && currentCourse.nationality !== 'Global'
                        ? `${currentCourse.name} — ${currentCourse.variantCategory || ''} — ${currentCourse.nationality}`
                        : currentCourse.name}
                    </div>
                  )}
                  {activeMainTab !== 'live' && insightsProps.onCourseChange && (
                    <Select
                      value={courseId ?? ''}
                      onValueChange={v => insightsProps.onCourseChange?.(v)}
                      disabled={hasNoCourses}
                    >
                      <SelectTrigger
                        className={cn(
                          'h-9 min-w-[160px] max-w-[320px] border-none bg-transparent text-sm font-semibold shadow-none transition-colors focus:ring-0',
                          hasNoCourses ? 'cursor-not-allowed opacity-60' : 'hover:bg-slate-100'
                        )}
                      >
                        <SelectValue
                          placeholder={hasNoCourses ? 'Create your first course.' : 'Select course'}
                        >
                          {(() => {
                            const c = currentCourse
                            if (!c)
                              return hasNoCourses ? 'Create your first course.' : 'Select course'
                            return c.nationality && c.nationality !== 'Global'
                              ? `${c.name} — ${c.variantCategory || ''} — ${c.nationality}`
                              : c.name
                          })()}
                        </SelectValue>
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
                            {c.nationality && c.nationality !== 'Global'
                              ? `${c.name} — ${c.variantCategory || ''} — ${c.nationality}`
                              : c.isVariant
                                ? `${c.name} — Global`
                                : c.name}
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
                            {c.nationality && c.nationality !== 'Global'
                              ? `${c.name} — ${c.variantCategory || ''} — ${c.nationality}`
                              : c.isVariant
                                ? `${c.name} — Global`
                                : c.name}
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
                      title={hasNoCourses ? 'Create your first course' : 'New Course'}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  )}

                  {onCourseNameChange && courseId && courseId !== 'insights-draft' && (
                    <input
                      className={cn(
                        'h-9 min-w-[200px] rounded-md border-none bg-transparent px-2 text-sm font-semibold transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0',
                        isCoursePublished ? 'cursor-not-allowed opacity-70' : 'hover:bg-slate-100'
                      )}
                      value={courseName || ''}
                      readOnly={isCoursePublished}
                      onChange={e => {
                        onCourseNameChange(e.target.value)
                      }}
                      placeholder="Course Name..."
                      title={
                        isCoursePublished ? 'Published variant names cannot be edited' : undefined
                      }
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

            <div className="flex items-center gap-2">
                {(activeMainTab === 'builder' || activeMainTab === 'live') &&
                  onSaveModeChange &&
                  !modeLocked && (
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
                {(activeMainTab === 'builder' || activeMainTab === 'live') && modeLocked && (
                  <div className="flex h-9 w-[190px] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600">
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                    Editing
                  </div>
                )}
                {activeMainTab === 'builder' && onSaveCourse && (
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
                {activeMainTab === 'builder' &&
                  courseId &&
                  courseId !== 'insights-draft' &&
                  (saveMode === 'draft' || (saveMode === 'live' && isCourseVariant)) && (
                    <Button
                      variant="default"
                      className="gap-2 bg-blue-600 font-medium text-white hover:bg-blue-700"
                      onClick={saveMode === 'draft' ? handlePublishDraft : openRescheduleDialog}
                    >
                      <Calendar className="h-4 w-4" />
                      {saveMode === 'draft' ? 'Schedule' : 'Reschedule'}
                    </Button>
                  )}
                {/* Kebab menu — visible for all real courses on the builder tab */}
                {activeMainTab === 'builder' && courseId && courseId !== 'insights-draft' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="shrink-0">
                        <MoreVertical className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {/* Go Live only when in draft mode and no active session */}
                      {saveMode === 'draft' && !insightsProps.sessionId && (
                        <DropdownMenuItem onClick={handleStartSessionClick}>
                          <VideoIcon className="mr-2 h-4 w-4 text-green-600" />
                          Go Live
                        </DropdownMenuItem>
                      )}
                      {onDeleteCourse && (
                        <DropdownMenuItem
                          onClick={onDeleteCourse}
                          disabled={!!insightsProps.sessionId}
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Course
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
            </div>
          </div>

          {/* Live classroom banner */}
          {isClassroomMode && (
            <div className="flex items-center justify-center bg-red-600 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm">
              <div className="mr-2 h-2 w-2 animate-pulse rounded-full bg-white" />
              Live Classroom — Students can see your screen
            </div>
          )}

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
            courseDescription={model.course?.description ?? undefined}
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
            onMainTabChange={handleMainTabChange}
            initialMainTab={isClassroomMode ? 'live' : (tabFromUrl ?? 'builder')}
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
            <Button variant="modal-secondary-dark" onClick={() => setIsCreateDialogOpen?.(false)}>
              Cancel
            </Button>
            <Button variant="modal-primary-dark" onClick={onCreateNewCourse}>
              Create
            </Button>
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
            <Button variant="modal-secondary-dark" onClick={() => setIsRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="modal-primary-dark"
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
            <Button variant="modal-secondary-dark" onClick={() => setIsDeleteDialogOpen?.(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDeleteCourseConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
        <DialogContent className="h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw] overflow-hidden border-0 bg-[rgba(31,41,51,0.72)] p-0 shadow-[0_24px_64px_rgba(15,23,42,0.32)] backdrop-blur-[18px] sm:h-[90vh] sm:max-h-[800px] sm:w-[90vw] sm:max-w-[820px]">
          <div className="flex h-full flex-col p-7 sm:p-8">
            <DialogHeader className="p-0">
              <DialogTitle>Reschedule as Independent Course</DialogTitle>
              <DialogDescription>
                Create a new independent course with a different schedule. Original schedule slots
                are greyed out.
              </DialogDescription>
            </DialogHeader>

            <div className="scrollbar-hide mt-6 flex flex-1 flex-col overflow-hidden pr-2">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-white">Course Name</Label>
                  <Input
                    value={rescheduleName}
                    onChange={e => setRescheduleName(e.target.value)}
                    placeholder="Course name"
                    className="mt-1 border-slate-200 bg-white"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-white">Category</Label>
                  <Input
                    value={rescheduleCategory}
                    onChange={e => setRescheduleCategory(e.target.value)}
                    placeholder="Category"
                    className="mt-1 border-slate-200 bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-white">Free</Label>
                    <div className="mt-1 flex h-10 items-center justify-between rounded-xl border border-slate-200 bg-white px-4">
                      <span className="text-sm font-medium text-slate-600">
                        {rescheduleIsFree ? 'Yes' : 'No'}
                      </span>
                      <Switch checked={rescheduleIsFree} onCheckedChange={setRescheduleIsFree} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-white">Price</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-slate-400" />
                      <Input
                        type="number"
                        min={0}
                        value={reschedulePrice}
                        onChange={e => setReschedulePrice(e.target.value)}
                        placeholder="0.00"
                        disabled={rescheduleIsFree}
                        className="border-slate-200 bg-white"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-white">Currency</Label>
                    <Select value={rescheduleCurrency} onValueChange={setRescheduleCurrency}>
                      <SelectTrigger className="mt-1 border-slate-200 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['USD', 'SGD', 'EUR', 'GBP', 'KRW', 'JPY', 'HKD', 'CNY', 'INR'].map(c => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-white">Language</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Languages className="h-4 w-4 text-slate-400" />
                      <Input
                        value={rescheduleLanguage}
                        onChange={e => setRescheduleLanguage(e.target.value)}
                        placeholder="e.g. English"
                        className="border-slate-200 bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden">
                <p className="mb-2 text-sm font-medium text-white">Schedule</p>
                <p className="mb-3 text-xs text-white/60">
                  Select a new schedule. Original course slots are greyed out and cannot be
                  selected.
                </p>
                <VariantScheduleEditor
                  schedule={rescheduleSchedule}
                  onScheduleChange={updater => setRescheduleSchedule(prev => updater(prev))}
                  price={rescheduleIsFree ? 0 : parseFloat(reschedulePrice) || 0}
                  weeksToSchedule={8}
                  excludedSchedules={originalSchedule.length > 0 ? [originalSchedule] : undefined}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={closeRescheduleDialog}
                className="h-11 rounded-[12px] border-white/30 bg-white/10 px-6 text-white hover:bg-white/20"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleRescheduleSave}
                disabled={rescheduleSaving || !rescheduleName.trim()}
                className="h-11 rounded-[12px] bg-white px-6 text-[#0B3A9B] hover:bg-white/90"
              >
                {rescheduleSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {rescheduleSaving ? 'Creating...' : 'Create Independent Course'}
              </Button>
            </div>
          </div>
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
