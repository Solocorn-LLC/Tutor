/**
 * Insights-only course builder shell — `/tutor/insights`.
 * Standalone insights builder shell — edit this file independently.
 */

'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
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
  Plus,
  Timer,
  LayoutTemplate,
  Save,
  Calendar,
  Trash2,
  Video as VideoIcon,
  RefreshCw,
  TestTube2,
  PencilRuler,
  MonitorPlay,
  Wrench,
  PhoneOff,
} from 'lucide-react'
import { BackButton } from '@/components/navigation/BackButton'
import { CourseCategoryPicker } from './CourseCategoryPicker'
import { getCategoryBoard } from '@/lib/data/category-board'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence, useDragControls } from 'framer-motion'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { CourseBuilder } from '../../dashboard/components/CourseBuilder'
import { PanelErrorBoundary } from '@/components/ui/panel-error-boundary'
import { GoLiveDialog } from '../../dashboard/components/GoLiveDialog'
import { toast } from 'sonner'
import type { CourseBuilderInsightsProps } from './course-builder-types'
import type { CourseBuilderRef } from '../../dashboard/components/builder-types'
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
import { CountryFlag } from '@/components/country-flag'
import { DollarSign, Languages } from 'lucide-react'

function WifiSignal({ connected, error }: { connected: boolean; error: boolean }) {
  const color = error ? 'text-red-500' : connected ? 'text-emerald-500' : 'text-amber-400'

  return (
    <div className="relative flex items-center justify-center">
      <style jsx>{`
        @keyframes wifi-bar {
          0%,
          100% {
            opacity: 0.25;
          }
          50% {
            opacity: 1;
          }
        }
        .wifi-bar {
          animation: wifi-bar 1.2s ease-in-out infinite;
        }
        .wifi-bar-1 {
          animation-delay: 0s;
        }
        .wifi-bar-2 {
          animation-delay: 0.3s;
        }
        .wifi-bar-3 {
          animation-delay: 0.6s;
        }
        .wifi-dot {
          animation-delay: 0.9s;
        }
      `}</style>
      <svg
        className={cn('h-4 w-4', color)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1.5 8.5a15 15 0 0 1 21 0" className="wifi-bar wifi-bar-3" />
        <path d="M5 12.5a11 11 0 0 1 14 0" className="wifi-bar wifi-bar-2" />
        <path d="M8.5 16.5a7 7 0 0 1 7 0" className="wifi-bar wifi-bar-1" />
        <path d="M12 20h.01" className="wifi-bar wifi-dot" />
      </svg>
    </div>
  )
}

type Props = UseCourseBuilderContentArgs & {
  insightsProps: CourseBuilderInsightsProps
  sessionCategory?: string | null
  sessionNationality?: string | null
  sessionVariantName?: string | null
  onSaveCourse?: (lessons: any[], options?: any) => void
  onSyncToLiveSession?: (silent?: boolean) => void
  onCreateCourse?: () => void
  onDeleteCourse?: () => void
  isCreateDialogOpen?: boolean
  setIsCreateDialogOpen?: (v: boolean) => void
  newCourseName?: string
  setNewCourseName?: (v: string) => void
  newCourseCategories?: string[]
  setNewCourseCategories?: (v: string[]) => void
  createStorageUserId?: string
  /** Persist an edited course name/categories (from the control-panel Edit button). */
  onUpdateCourse?: (id: string, patch: { name: string; categories: string[] }) => void
  editStorageUserId?: string
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

type ControlsMode = 'build' | 'test' | 'classroom'

interface TutorControlsPanelProps {
  mode: ControlsMode
  onModeChange: (mode: ControlsMode) => void
  disabled?: boolean
  onSave: () => void
  onSchedule: () => void
  onDelete: () => void
  onGoLive: () => void
  onVideo: () => void
  onSync: () => void
  onCreateCourse?: () => void
  onEditCourse?: () => void
  canDelete: boolean
  canSchedule: boolean
  canGoLive: boolean
  hasSession: boolean
  hasUnsyncedChanges?: boolean
  onEndSession?: () => void
  endingSession?: boolean
  isConnected?: boolean
  connectionError?: boolean
}

function TutorControlsPanel({
  mode,
  onModeChange,
  disabled,
  onSave,
  onSchedule,
  onDelete,
  onGoLive,
  onVideo,
  onSync,
  onCreateCourse,
  onEditCourse,
  canDelete,
  canSchedule,
  canGoLive,
  hasSession,
  hasUnsyncedChanges,
  onEndSession,
  endingSession,
  isConnected,
  connectionError,
}: TutorControlsPanelProps) {
  const [open, setOpen] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const dragControls = useDragControls()

  const modeButtonBase =
    'flex h-7 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors'

  const actionButtonBase =
    'flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/20 active:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white disabled:hover:bg-white/10'

  const panelDisabled = disabled || false

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div className="pointer-events-none absolute bottom-4 right-4">
        <motion.div
          drag
          dragConstraints={{
            left: -window.innerWidth + 384,
            right: 0,
            top: -window.innerHeight + 100,
            bottom: 0,
          }}
          dragControls={dragControls}
          dragListener={false}
          dragMomentum={false}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={() => setTimeout(() => setIsDragging(false), 50)}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            'pointer-events-auto relative w-96 cursor-default select-none overflow-hidden rounded-2xl border border-white/10 bg-[rgba(31,41,51,0.60)] shadow-2xl backdrop-blur-xl',
            open ? 'p-3' : ''
          )}
        >
          {/* Header / drag handle */}
          <button
            type="button"
            className={cn(
              'relative flex w-full cursor-grab items-center active:cursor-grabbing',
              open ? 'h-8 rounded-t-xl border-b border-white/10 px-2' : 'h-10 px-3'
            )}
            onPointerDown={e => dragControls.start(e)}
            onClick={() => {
              if (isDragging) return
              setOpen(v => !v)
            }}
          >
            <span className="w-4 shrink-0" aria-hidden="true" />
            <span className="mx-auto text-xs font-semibold text-white">Controls</span>
            <WifiSignal connected={isConnected ?? false} error={connectionError ?? false} />
          </button>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                key="controls-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                {/* Mode selector */}
                <Tabs
                  value={mode}
                  onValueChange={v => onModeChange(v as ControlsMode)}
                  className="mt-2 w-full"
                >
                  <TabsList
                    data-testid="builder-mode-tabs"
                    className="grid h-9 w-full grid-cols-3 gap-1 rounded-lg bg-white/10 p-1"
                  >
                    <TabsTrigger
                      value="build"
                      className={cn(
                        modeButtonBase,
                        'text-white hover:bg-white/5 hover:text-white',
                        'data-[state=active]:bg-white data-[state=active]:text-[#2563EB] data-[state=active]:shadow-sm'
                      )}
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      Build
                    </TabsTrigger>
                    <TabsTrigger
                      value="test"
                      className={cn(
                        modeButtonBase,
                        'text-white hover:bg-white/5 hover:text-white',
                        'data-[state=active]:bg-white data-[state=active]:text-[#7C3AED] data-[state=active]:shadow-sm'
                      )}
                    >
                      <TestTube2 className="h-3.5 w-3.5" />
                      Test
                    </TabsTrigger>
                    <TabsTrigger
                      value="classroom"
                      className={cn(
                        modeButtonBase,
                        'text-white hover:bg-white/5 hover:text-white',
                        'data-[state=active]:bg-white data-[state=active]:text-[#F97316] data-[state=active]:shadow-sm'
                      )}
                    >
                      <MonitorPlay className="h-3.5 w-3.5" />
                      Classroom
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Action buttons */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={panelDisabled}
                      onClick={onSave}
                      className={cn(
                        actionButtonBase,
                        'bg-white text-gray-900 hover:bg-gray-100 active:bg-gray-200'
                      )}
                    >
                      <Save className="h-4 w-4" />
                      Save
                    </button>

                    <button
                      type="button"
                      disabled={panelDisabled || mode !== 'build' || !canDelete}
                      onClick={onDelete}
                      className={cn(
                        actionButtonBase,
                        'bg-white text-red-600 hover:bg-red-50 active:bg-red-100'
                      )}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>

                    <button
                      type="button"
                      disabled={panelDisabled || mode !== 'build' || !onEditCourse}
                      onClick={onEditCourse}
                      className={cn(
                        actionButtonBase,
                        'bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100'
                      )}
                    >
                      <Edit3 className="h-4 w-4" />
                      Edit Category
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={panelDisabled || mode !== 'build' || !canGoLive}
                      onClick={onGoLive}
                      className={cn(
                        actionButtonBase,
                        'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700'
                      )}
                    >
                      <VideoIcon className="h-4 w-4" />
                      Go Live
                    </button>

                    <button
                      type="button"
                      // Video joins the live session — it must be usable while
                      // live (mode === 'classroom'), not only in build mode. It
                      // was wrongly gated on mode === 'build' (like the adjacent
                      // build-only actions), so it was disabled during a session.
                      disabled={panelDisabled || !hasSession}
                      onClick={onVideo}
                      className={cn(
                        actionButtonBase,
                        'bg-pink-500 hover:bg-pink-600 active:bg-pink-700'
                      )}
                    >
                      <VideoIcon className="h-4 w-4" />
                      Video
                    </button>

                    <button
                      type="button"
                      disabled={panelDisabled || mode !== 'build'}
                      onClick={onCreateCourse}
                      className={cn(
                        actionButtonBase,
                        'group bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                      )}
                    >
                      <span className="flex items-center gap-2 transition-opacity group-disabled:opacity-50">
                        <Plus className="h-4 w-4" />
                        New Course
                      </span>
                    </button>
                  </div>
                </div>

                {/* Schedule & Publish — full width, below the grid */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={panelDisabled || mode !== 'build' || !canSchedule}
                        onClick={onSchedule}
                        className={cn(
                          actionButtonBase,
                          'mt-2 w-full bg-white text-[#2563EB] hover:bg-blue-50 active:bg-blue-100'
                        )}
                      >
                        <Calendar className="h-4 w-4" />
                        Schedule & Publish
                      </button>
                    </TooltipTrigger>
                  </Tooltip>
                </TooltipProvider>

                {/* End the live session — finalizes recording + analytics. Only
                    shown while a session is active. */}
                {onEndSession && hasSession && (
                  <button
                    type="button"
                    disabled={panelDisabled || endingSession}
                    onClick={onEndSession}
                    className={cn(
                      actionButtonBase,
                      'mt-2 justify-center bg-red-600 text-white hover:bg-red-700 active:bg-red-800'
                    )}
                  >
                    {endingSession ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PhoneOff className="h-4 w-4" />
                    )}
                    {endingSession ? 'Ending…' : 'End Session'}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}

function CourseBuilderInsightsRouteInner({
  courseId,
  insightsProps,
  dataMode = 'default',
  detachedStorageKey,
  detachedCourseName,
  sessionCategory,
  sessionNationality,
  sessionVariantName,
  onSaveCourse,
  onSyncToLiveSession,
  onCreateCourse,
  onDeleteCourse,
  isCreateDialogOpen,
  setIsCreateDialogOpen,
  newCourseName,
  setNewCourseName,
  newCourseCategories,
  setNewCourseCategories,
  createStorageUserId,
  onUpdateCourse,
  editStorageUserId,
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
    (pathname?.startsWith('/tutor/classroom') ?? false) ||
    (searchParams?.get('view') ?? '') === 'classroom'
  const tabFromUrl = searchParams.get('tab') as 'live' | 'builder' | 'test-pci' | null
  const initialMainTab = isClassroomMode
    ? 'live'
    : (tabFromUrl ?? (insightsProps.sessionId ? 'live' : 'builder'))
  const [activeMainTab, setActiveMainTab] = useState<'live' | 'builder' | 'test-pci'>(
    initialMainTab
  )
  const showWifiSignal = isClassroomMode || activeMainTab === 'live'
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  // Two-step create flow: name → category (category is required at creation).
  const [createStep, setCreateStep] = useState<'name' | 'category'>('name')
  // Close + clear the create dialog so a cancelled attempt doesn't leave a stale
  // name/category on the next open. (Successful create clears via its own handler.)
  const closeCreateDialog = () => {
    setCreateStep('name')
    setNewCourseName?.('')
    setNewCourseCategories?.([])
    setIsCreateDialogOpen?.(false)
  }
  // Edit-course dialog (control-panel Edit button): edit name + category of the
  // current course. Prefilled from currentCourse; persisted via onUpdateCourse.
  const [isEditCourseOpen, setIsEditCourseOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editCategories, setEditCategories] = useState<string[]>([])
  const openEditCourse = () => {
    setEditName(currentCourse?.name ?? '')
    setEditCategories(((currentCourse as { categories?: string[] })?.categories ?? []).slice())
    setIsEditCourseOpen(true)
  }
  const saveEditCourse = () => {
    if (!courseId || !editName.trim() || editCategories.length === 0) return
    onUpdateCourse?.(courseId, { name: editName.trim(), categories: editCategories })
    setIsEditCourseOpen(false)
  }
  // Missing-category dialog: shown when user tries to schedule without a category.
  const [isCategoryRequiredOpen, setIsCategoryRequiredOpen] = useState(false)
  const openCategoryRequired = () => setIsCategoryRequiredOpen(true)
  const closeCategoryRequired = () => setIsCategoryRequiredOpen(false)
  const handleEditCourseFromCategoryRequired = () => {
    closeCategoryRequired()
    openEditCourse()
  }
  const [goLiveDialogOpen, setGoLiveDialogOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [leftPanelHidden, setLeftPanelHidden] = useState(false)
  const [controlsMode, setControlsMode] = useState<ControlsMode>(
    initialMainTab === 'live' ? 'classroom' : initialMainTab === 'test-pci' ? 'test' : 'build'
  )
  type CourseStateFilter = 'creating' | 'unpublished' | 'published'

  // Course-state filter for the toggle. It controls which courses appear in the
  // dropdown and is updated automatically when the selected course changes.
  const initialCourseStateFilter: CourseStateFilter =
    saveMode === 'draft' ? 'creating' : 'unpublished'
  const [courseStateFilter, setCourseStateFilter] =
    useState<CourseStateFilter>(initialCourseStateFilter)

  // The selected course's actual state (draft / unpublished / published).
  const currentCourseState = useMemo((): CourseStateFilter => {
    if (!courseId) return courseStateFilter
    if (draftCourses?.some(c => c.id === courseId)) return 'creating'
    const dbCourse = courses?.find(c => c.id === courseId)
    if (dbCourse?.isPublished) return 'published'
    return 'unpublished'
  }, [courseId, courses, draftCourses, courseStateFilter])

  // Persist mode is determined by the course itself, not by the toggle.
  const effectiveSaveMode = useMemo((): 'live' | 'draft' => {
    if (draftCourses?.some(c => c.id === courseId)) return 'draft'
    return 'live'
  }, [courseId, draftCourses])

  // Sync the filter toggle to the selected course whenever the course changes.
  useEffect(() => {
    if (!courseId) return
    setCourseStateFilter(prev => (prev === currentCourseState ? prev : currentCourseState))
  }, [courseId, currentCourseState])

  const handleCourseStateFilterChange = (filter: CourseStateFilter) => {
    setCourseStateFilter(filter)
  }
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false)
  const router = useRouter()

  // Reschedule dialog state
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [wizardTab, setWizardTab] = useState<'details' | 'category' | 'schedule'>('details')
  const [rescheduleName, setRescheduleName] = useState('')
  const [rescheduleCategories, setRescheduleCategories] = useState<string[]>([])
  const [reschedulePrice, setReschedulePrice] = useState<string>('')
  const [rescheduleCurrency, setRescheduleCurrency] = useState('USD')
  const [rescheduleIsFree, setRescheduleIsFree] = useState(false)
  const [rescheduleLanguage, setRescheduleLanguage] = useState('')
  const [rescheduleSchedule, setRescheduleSchedule] = useState<ScheduleItem[]>([])
  const [rescheduleSaving, setRescheduleSaving] = useState(false)

  useEffect(() => {
    if (isClassroomMode) {
      setActiveMainTab('live')
      setControlsMode('classroom')
      return
    }
    if (insightsProps.sessionId && !tabFromUrl) {
      setActiveMainTab('live')
      setControlsMode('classroom')
    }
  }, [insightsProps.sessionId, tabFromUrl, isClassroomMode])

  // Allow switching between Live / Build / Test even during a live session so
  // tutors can edit and test the course mid-class. Classroom mode only sets the
  // INITIAL tab to 'live' (see the effect above) — it no longer locks it.
  const handleMainTabChange = useCallback((tab: 'live' | 'builder' | 'test-pci') => {
    setActiveMainTab(tab)
    if (tab === 'builder') setControlsMode('build')
    if (tab === 'test-pci') setControlsMode('test')
    if (tab === 'live') setControlsMode('classroom')
  }, [])

  const handleControlsModeChange = useCallback(
    (mode: ControlsMode) => {
      setControlsMode(mode)
      if (mode === 'build') {
        if (activeMainTab !== 'builder') setActiveMainTab('builder')
      } else if (mode === 'test') {
        if (activeMainTab !== 'test-pci') setActiveMainTab('test-pci')
      } else if (mode === 'classroom') {
        if (activeMainTab !== 'live') setActiveMainTab('live')
      }
    },
    [activeMainTab]
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

    // 0. Validate category is selected before publishing.
    const courseCategories = [...(courses || []), ...(draftCourses || [])].find(
      (c: any) => c.id === courseId
    )?.categories
    if (!courseCategories || courseCategories.length === 0) {
      openCategoryRequired()
      return
    }

    // 1. Read the editor's current tree. If it hasn't hydrated it can come back
    //    empty — fall back to the draft's persisted builder content so we never
    //    publish an empty tree over real draft lessons.
    const getLessonsCb = (model.courseBuilderRef.current as any)?.getLessons
    const editorLessons = typeof getLessonsCb === 'function' ? getLessonsCb() : []
    let rawLessons = editorLessons
    if ((!Array.isArray(rawLessons) || rawLessons.length === 0) && typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(`insights-course-builder:${courseId}`)
        const parsed = stored ? JSON.parse(stored) : null
        if (Array.isArray(parsed?.lessons) && parsed.lessons.length > 0) {
          rawLessons = parsed.lessons
        }
      } catch {
        // ignore a malformed draft cache
      }
    }
    const { lessons, hasMissingDmis } = resolveLessonDmis(rawLessons)

    const isLocalDraft = (draftCourses ?? []).some((c: any) => c.id === courseId)

    // An empty tree on a course that already exists in the DB means the editor
    // never loaded — its content is safe there, so just open scheduling instead
    // of a destructive empty publish. A local draft with no lessons still
    // materializes fine: saveCourse keeps the default lesson created on POST.
    if (lessons.length === 0 && !isLocalDraft) {
      model.router.push(`/tutor/courses/${courseId}`)
      return
    }

    // 2. Persist the latest editor edits before publishing — but only if the
    //    editor actually had content, so an unhydrated (empty) editor can't
    //    clobber the draft's stored lessons.
    if (editorLessons.length > 0) {
      const saveCb = (model.courseBuilderRef.current as any)?.saveAll
      if (typeof saveCb === 'function') await saveCb()
    }

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

    // Carry the category chosen at creation. Creating-mode courses hold it locally, so when
    // this first persists the course to the DB we must pass it through — else
    // the new course row gets categories:[] and the Course Details page shows
    // no variant and no scheduler. (executeSave threads it the same way.)
    const draftCategories = [...(courses || []), ...(draftCourses || [])].find(
      (c: any) => c.id === courseId
    )?.categories

    // 4. Publish via shared save function
    const result = await saveCourse({
      courseId,
      lessons,
      mode: 'publish',
      courseName,
      detachedCourseName,
      categories: draftCategories,
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
  const originalSchedule = currentCourse?.schedule || []

  // Reschedule handlers
  const openRescheduleDialog = useCallback(() => {
    if (!currentCourse) return
    setRescheduleName(`${currentCourse.name} — Rescheduled`)
    setRescheduleCategories(
      currentCourse.categories || ([currentCourse.variantCategory].filter(Boolean) as string[])
    )
    setWizardTab('details')
    setReschedulePrice('')
    setRescheduleCurrency('USD')
    setRescheduleIsFree(false)
    setRescheduleLanguage('')
    setRescheduleSchedule([])
    setRescheduleDialogOpen(true)
  }, [currentCourse])

  const closeRescheduleDialog = useCallback(() => {
    setRescheduleDialogOpen(false)
    setWizardTab('details')
    setRescheduleName('')
    setRescheduleCategories([])
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
        categories: rescheduleCategories,
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
    rescheduleCategories,
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
      className="text-foreground flex h-full w-full flex-col items-stretch overflow-hidden bg-[#fafafc]"
      data-tutor-route="insights-builder"
      style={model.themeStyle}
    >
      <div className="sticky top-0 z-10 w-full bg-[#fafafc] px-3 pb-4 pt-4 sm:px-4">
        <div className="flex w-full flex-col gap-4">
          <div className="flex min-h-[72px] w-full flex-col gap-4 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-[0_8px_20px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <BackButton
                href="/tutor/dashboard"
                className="rounded-full hover:bg-[#F17623] hover:text-white"
              />

              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  {/* Course selector — locked to read-only when a session is active */}
                  {activeMainTab !== 'live' &&
                    activeMainTab !== 'test-pci' &&
                    insightsProps.onCourseChange && (
                      <Select
                        // Only feed a value that has a matching <SelectItem>. courseId can
                        // be an id absent from courses/draftCourses (template vs published
                        // id split), and a controlled Radix Select value with no matching
                        // item loops its value-sync forever → React #185 ("Maximum update
                        // depth exceeded"). currentCourse is the in-list match or undefined.
                        value={currentCourse?.id ?? ''}
                        onValueChange={v => insightsProps.onCourseChange?.(v)}
                        disabled={hasNoCourses}
                      >
                        <SelectTrigger
                          className={cn(
                            // Header card is hardcoded light (bg-white) regardless of
                            // theme, so use a hardcoded dark text colour — the theme
                            // token text-foreground flips to white under dark themes
                            // and made the course name unreadable here.
                            'h-9 min-w-[220px] max-w-[420px] border border-slate-300 bg-transparent text-sm font-semibold text-[#1F2933] shadow-none transition-colors focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0',
                            hasNoCourses ? 'cursor-not-allowed opacity-60' : 'hover:bg-slate-100'
                          )}
                        >
                          <SelectValue
                            placeholder={
                              hasNoCourses ? 'Create your first course.' : 'Select course'
                            }
                          >
                            {(() => {
                              const c = currentCourse
                              if (!c)
                                return hasNoCourses ? 'Create your first course.' : 'Select course'
                              return c.nationality && c.nationality !== 'Global' ? (
                                <span className="inline-flex items-center gap-1">
                                  {c.name} — {c.variantCategory || ''} —{' '}
                                  <CountryFlag countryName={c.nationality} size="xs" showLabel />
                                </span>
                              ) : (
                                c.name
                              )
                            })()}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[420px] border-white/10 bg-[rgba(31,41,51,0.60)] shadow-2xl backdrop-blur-xl">
                          {courseStateFilter === 'unpublished' &&
                            courses &&
                            courses.filter(c => !c.isPublished).length > 0 && (
                              <SelectItem
                                value="__unpublished-header__"
                                disabled
                                className="text-xs font-semibold text-white transition-none focus-visible:ring-0"
                              >
                                Unpublished Courses
                              </SelectItem>
                            )}
                          {courseStateFilter === 'unpublished' &&
                            courses
                              ?.filter(c => !c.isPublished)
                              .map(c => (
                                <SelectItem key={c.id} value={c.id} className="transition-none">
                                  {c.nationality && c.nationality !== 'Global' ? (
                                    <span className="inline-flex items-center gap-1">
                                      {c.name} — {c.variantCategory || ''} —{' '}
                                      <CountryFlag
                                        countryName={c.nationality}
                                        size="xs"
                                        showLabel
                                      />
                                    </span>
                                  ) : c.isVariant ? (
                                    `${c.name} — Global`
                                  ) : (
                                    c.name
                                  )}
                                </SelectItem>
                              ))}
                          {courseStateFilter === 'published' &&
                            courses &&
                            courses.filter(c => c.isPublished).length > 0 && (
                              <SelectItem
                                value="__published-header__"
                                disabled
                                className="text-xs font-semibold text-white transition-none focus-visible:ring-0"
                              >
                                Published Courses
                              </SelectItem>
                            )}
                          {courseStateFilter === 'published' &&
                            courses
                              ?.filter(c => c.isPublished)
                              .map(c => (
                                <SelectItem key={c.id} value={c.id} className="transition-none">
                                  {c.nationality && c.nationality !== 'Global' ? (
                                    <span className="inline-flex items-center gap-1">
                                      {c.name} — {c.variantCategory || ''} —{' '}
                                      <CountryFlag
                                        countryName={c.nationality}
                                        size="xs"
                                        showLabel
                                      />
                                    </span>
                                  ) : c.isVariant ? (
                                    `${c.name} — Global`
                                  ) : (
                                    c.name
                                  )}
                                </SelectItem>
                              ))}
                          {courseStateFilter === 'creating' &&
                            draftCourses &&
                            draftCourses.length > 0 && (
                              <SelectItem
                                value="__creating-header__"
                                disabled
                                className="text-xs font-semibold text-white transition-none focus-visible:ring-0"
                              >
                                Creating Courses
                              </SelectItem>
                            )}
                          {courseStateFilter === 'creating' &&
                            draftCourses?.map(c => (
                              <SelectItem key={c.id} value={c.id} className="transition-none">
                                {c.nationality && c.nationality !== 'Global' ? (
                                  <span className="inline-flex items-center gap-1">
                                    {c.name} — {c.variantCategory || ''} —{' '}
                                    <CountryFlag countryName={c.nationality} size="xs" showLabel />
                                  </span>
                                ) : c.isVariant ? (
                                  `${c.name} — Global`
                                ) : (
                                  c.name
                                )}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}

                  {activeMainTab === 'builder' && (
                    <h1 className="pointer-events-none absolute left-0 right-0 mx-auto flex items-center justify-center gap-2 text-2xl font-bold tracking-tight text-[#1F2933]">
                      {currentCourse?.name && (
                        <span className="text-xl font-normal text-slate-500">
                          {currentCourse.name}
                        </span>
                      )}
                      {/* Full identity next to the name: Board (derived) · category ·
                          country (country appears once published, from the variant). */}
                      {(currentCourse as any)?.categories?.length > 0 && (
                        <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-3 py-1 text-xs font-medium">
                          {[
                            getCategoryBoard((currentCourse as any).categories[0]),
                            (currentCourse as any).categories.join(', '),
                            (currentCourse as any).nationality,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </h1>
                  )}
                  {activeMainTab === 'live' && (
                    // Centered across the full header via absolute positioning;
                    // pointer-events-none so the overlay never blocks the back
                    // button / header controls underneath it.
                    <h1 className="pointer-events-none absolute left-0 right-0 mx-auto flex items-center justify-center gap-2 text-2xl font-bold tracking-tight text-[#1F2933]">
                      {model.course?.name && (
                        <span className="text-xl font-normal text-slate-500">
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
                  {activeMainTab === 'test-pci' && (
                    <h1 className="pointer-events-none absolute left-0 right-0 mx-auto flex items-center justify-center gap-2 text-2xl font-bold tracking-tight text-[#1F2933]">
                      {(model.course?.name || currentCourse?.name) && (
                        <span className="text-xl font-normal text-slate-500">
                          {model.course?.name || currentCourse?.name}
                        </span>
                      )}
                    </h1>
                  )}
                  {activeMainTab === 'live' &&
                    (sessionVariantName || sessionCategory || sessionNationality) && (
                      <span className="bg-muted text-muted-foreground ml-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium">
                        {/* Prefer the canonical variant label (same helper the
                            student side uses) so both headers read identically. */}
                        {sessionVariantName
                          ? sessionVariantName
                          : sessionCategory && sessionNationality
                            ? `${sessionCategory} — ${sessionNationality}`
                            : sessionCategory || sessionNationality}
                      </span>
                    )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {(activeMainTab === 'builder' || activeMainTab === 'live') &&
                onSaveModeChange &&
                !modeLocked && (
                  <Select
                    value={courseStateFilter}
                    onValueChange={(val: CourseStateFilter) => handleCourseStateFilterChange(val)}
                  >
                    <SelectTrigger className="h-9 w-[190px] border-slate-200 bg-white text-sm font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unpublished" className="">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-green-500" />
                          Unpublished
                        </div>
                      </SelectItem>
                      <SelectItem value="published" className="">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-blue-500" />
                          Published
                        </div>
                      </SelectItem>
                      <SelectItem value="creating" className="">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-amber-500" />
                          Creating
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              {(activeMainTab === 'builder' || activeMainTab === 'live') && modeLocked && (
                <div className="flex h-9 w-[190px] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600">
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  Creating
                </div>
              )}
              {/* Reflect the real socket connection: emerald when connected,
                  red when a session is live but the socket has dropped, amber
                  when idle (no active session). */}
              <WifiSignal
                connected={!!insightsProps.isConnected}
                error={!!insightsProps.sessionId && !insightsProps.isConnected}
              />
            </div>
          </div>
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
          <PanelErrorBoundary label="the course builder" resetKeys={[courseId, activeMainTab]}>
            <CourseBuilder
              ref={model.courseBuilderRef}
              courseId={courseId ?? ''}
              courseName={courseName || model.course?.name || currentCourse?.name}
              courseDescription={model.course?.description ?? undefined}
              initialLessons={model.loadedLessons ?? undefined}
              hideDirectorySearch
              directoryMenusAlwaysVisible
              onSave={onSaveCourse}
              insightsProps={{
                ...insightsProps,
                // Expose drafts too so the builder can resolve the course's
                // category (Board/Subject) before it's published — drafts hold
                // the category chosen at creation.
                draftCourses,
                onEndSession: insightsProps.sessionId ? handleEndSession : undefined,
                onStartSession: handleStartSessionClick,
                endingSession,
              }}
              onMainTabChange={handleMainTabChange}
              initialMainTab={isClassroomMode ? 'live' : (tabFromUrl ?? 'builder')}
              mainTab={activeMainTab}
              leftPanelHidden={leftPanelHidden}
              onLeftPanelHiddenChange={setLeftPanelHidden}
              saveMode={effectiveSaveMode}
              onSaveModeChange={onSaveModeChange}
              onSyncToLiveSession={onSyncToLiveSession}
              onUnsyncedChangesChange={setHasUnsyncedChanges}
              focusLessonId={
                isClassroomMode ? (searchParams.get('lessonId') ?? undefined) : undefined
              }
            />
          </PanelErrorBoundary>
        )}

        {!model.loading && courseId && (
          <TutorControlsPanel
            mode={controlsMode}
            onModeChange={handleControlsModeChange}
            onSave={async () => {
              const ref = model.courseBuilderRef.current as CourseBuilderRef | null
              if (typeof ref?.saveAll === 'function') {
                await ref.saveAll()
              } else {
                toast.error('Builder not ready to save')
              }
            }}
            onSchedule={effectiveSaveMode === 'draft' ? handlePublishDraft : openRescheduleDialog}
            onDelete={() => onDeleteCourse?.()}
            onGoLive={handleStartSessionClick}
            onVideo={() => {
              const ref = model.courseBuilderRef.current as CourseBuilderRef | null
              ref?.openVideo?.()
            }}
            onSync={() => {
              const ref = model.courseBuilderRef.current as CourseBuilderRef | null
              ref?.triggerSync?.()
            }}
            onCreateCourse={onCreateCourse}
            onEditCourse={courseId ? openEditCourse : undefined}
            canDelete={!!(courseId && courseId !== 'insights-draft' && onDeleteCourse)}
            // Schedule is only available in Creating mode. In Unpublished mode, scheduling
            // is not allowed — publication is handled through the Course Details page.
            canSchedule={
              !!(courseId && courseId !== 'insights-draft' && effectiveSaveMode === 'draft')
            }
            canGoLive={
              !!(
                courseId &&
                courseId !== 'insights-draft' &&
                effectiveSaveMode === 'draft' &&
                !insightsProps.sessionId
              )
            }
            hasSession={!!insightsProps.sessionId}
            hasUnsyncedChanges={hasUnsyncedChanges}
            onEndSession={insightsProps.sessionId ? handleEndSession : undefined}
            endingSession={endingSession}
            isConnected={!!insightsProps.isConnected}
            connectionError={!!insightsProps.sessionId && !insightsProps.isConnected}
          />
        )}
      </div>
      {/* Create Course Dialog — step 1: name, step 2: category (required) */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={next => (next ? setIsCreateDialogOpen?.(true) : closeCreateDialog())}
      >
        <DialogContent
          className={
            createStep === 'name'
              ? 'max-w-md border border-slate-200 bg-[rgba(31,41,51,0.60)] shadow-2xl backdrop-blur-xl'
              : 'max-h-[90vh] w-full max-w-5xl overflow-hidden border border-slate-200 bg-[rgba(31,41,51,0.60)] shadow-2xl backdrop-blur-xl'
          }
          aria-describedby={undefined}
        >
          <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-slate-900/5 via-slate-900/10 to-slate-900/20" />
          <div className="relative z-10 flex flex-col overflow-hidden">
            <DialogHeader className="shrink-0 border-b-0 pb-4 pt-4 text-center">
              <DialogTitle className="mx-auto text-center text-white">
                {createStep === 'category' ? 'Choose a Category' : 'Create New Course'}
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 pb-4">
              {createStep === 'name' ? (
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Input
                      value={newCourseName}
                      onChange={e => {
                        const value = e.target.value
                        if (value.length <= 25) {
                          setNewCourseName?.(value)
                        }
                      }}
                      placeholder="Course name"
                      maxLength={25}
                      autoFocus
                      className="h-12 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newCourseName?.trim()) {
                          e.preventDefault()
                          setCreateStep('category')
                        }
                      }}
                    />
                    <div className="flex justify-end">
                      <span
                        className={`text-xs font-medium ${
                          (newCourseName?.length || 0) >= 25
                            ? 'text-red-500'
                            : (newCourseName?.length || 0) >= 20
                              ? 'text-orange-500'
                              : 'text-gray-500'
                        }`}
                      >
                        {newCourseName?.length || 0}/25
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <CourseCategoryPicker
                  value={newCourseCategories ?? []}
                  onChange={v => setNewCourseCategories?.(v)}
                  storageUserId={createStorageUserId}
                />
              )}
            </div>

            <DialogFooter className="shrink-0 gap-3 border-white/20 px-6 pb-4">
              {createStep === 'name' ? (
                <>
                  <Button variant="modal-secondary-dark" onClick={closeCreateDialog}>
                    Cancel
                  </Button>
                  <Button
                    variant="modal-primary-dark"
                    onClick={() => setCreateStep('category')}
                    disabled={!newCourseName?.trim()}
                  >
                    Next
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="modal-secondary-dark" onClick={() => setCreateStep('name')}>
                    Back
                  </Button>
                  <Button
                    variant="modal-primary-dark"
                    onClick={onCreateNewCourse}
                    disabled={!newCourseName?.trim() || (newCourseCategories?.length ?? 0) === 0}
                  >
                    Create
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Category Dialog */}
      <Dialog open={isEditCourseOpen} onOpenChange={setIsEditCourseOpen}>
        <DialogContent
          className="max-h-[90vh] w-full max-w-5xl overflow-hidden border border-slate-200 bg-[rgba(31,41,51,0.60)] shadow-2xl backdrop-blur-xl"
          aria-describedby={undefined}
        >
          <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-slate-900/5 via-slate-900/10 to-slate-900/20" />
          <div className="relative z-10 flex flex-col overflow-hidden">
            <DialogHeader className="shrink-0 border-b-0 pb-4 pt-4 text-center">
              <DialogTitle className="mx-auto text-center text-white">Edit Category</DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 pb-4">
              <CourseCategoryPicker
                value={editCategories}
                onChange={setEditCategories}
                storageUserId={editStorageUserId}
              />
            </div>

            <DialogFooter className="shrink-0 gap-3 border-white/20 px-6 pb-4">
              <Button variant="modal-secondary-dark" onClick={() => setIsEditCourseOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="modal-primary-dark"
                onClick={saveEditCourse}
                disabled={editCategories.length === 0}
              >
                Save
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Required Dialog — shown when scheduling without a category */}
      <Dialog open={isCategoryRequiredOpen} onOpenChange={setIsCategoryRequiredOpen}>
        <DialogContent
          className="max-w-md border border-slate-200 shadow-2xl"
          aria-describedby={undefined}
        >
          <DialogHeader className="text-center">
            <DialogTitle className="mx-auto text-center text-white">Category Required</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4 text-center text-sm text-slate-600">
            <p>Please select a category for your course.</p>
          </div>
          <DialogFooter className="gap-3">
            <Button variant="modal-secondary-dark" onClick={closeCategoryRequired}>
              Cancel
            </Button>
            <Button variant="modal-primary-dark" onClick={handleEditCourseFromCategoryRequired}>
              Edit Course
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

      {/* Reschedule Dialog — 3-step wizard: Course Details → Category → Schedule */}
      <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
        <DialogContent className="h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw] overflow-hidden border border-white/10 bg-[rgba(31,41,51,0.60)] shadow-2xl backdrop-blur-xl sm:h-[90vh] sm:max-h-[800px] sm:w-[90vw] sm:max-w-5xl">
          <div className="flex h-full flex-col p-7 sm:p-8">
            <DialogHeader className="p-0">
              <DialogTitle className="text-white">Reschedule as Independent Course</DialogTitle>
              <DialogDescription className="text-white/70">
                Create a new independent course with a different schedule. Original schedule slots
                are greyed out.
              </DialogDescription>
            </DialogHeader>

            {/* Wizard Tabs */}
            <Tabs
              value={wizardTab}
              onValueChange={v => setWizardTab(v as 'details' | 'category' | 'schedule')}
              className="mt-6 flex min-h-0 flex-1 flex-col"
            >
              <TabsList className="relative grid h-auto w-full grid-cols-3 items-center rounded-xl bg-[#1F2933] p-1">
                <TabsTrigger
                  value="details"
                  className="relative z-10 rounded-lg py-1.5 text-white/80 transition-colors hover:text-white data-[state=active]:bg-transparent data-[state=active]:!text-[#1F2933] data-[state=active]:shadow-none"
                >
                  Course Details
                </TabsTrigger>
                <TabsTrigger
                  value="category"
                  className="relative z-10 rounded-lg py-1.5 text-white/80 transition-colors hover:text-white data-[state=active]:bg-transparent data-[state=active]:!text-[#1F2933] data-[state=active]:shadow-none"
                >
                  Category
                </TabsTrigger>
                <TabsTrigger
                  value="schedule"
                  className="relative z-10 rounded-lg py-1.5 text-white/80 transition-colors hover:text-white data-[state=active]:bg-transparent data-[state=active]:!text-[#1F2933] data-[state=active]:shadow-none"
                >
                  Schedule
                </TabsTrigger>
              </TabsList>

              {/* Tab: Course Details */}
              <TabsContent value="details" className="mt-4 flex flex-1 flex-col overflow-hidden">
                <div className="scrollbar-hide flex flex-1 flex-col overflow-y-auto pr-2">
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
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium text-white">Free</Label>
                        <div className="mt-1 flex h-10 items-center justify-between rounded-xl border border-slate-200 bg-white px-4">
                          <span className="text-sm font-medium text-slate-600">
                            {rescheduleIsFree ? 'Yes' : 'No'}
                          </span>
                          <Switch
                            checked={rescheduleIsFree}
                            onCheckedChange={setRescheduleIsFree}
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-white">Price</Label>
                        <div className="mt-1 flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-slate-600" />
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
                            {['USD', 'SGD', 'EUR', 'GBP', 'KRW', 'JPY', 'HKD', 'CNY', 'INR'].map(
                              c => (
                                <SelectItem key={c} value={c} className="">
                                  {c}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-white">Language</Label>
                        <div className="mt-1 flex items-center gap-2">
                          <Languages className="h-4 w-4 text-slate-600" />
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
                </div>

                <div className="mt-4 flex justify-end gap-3">
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
                    onClick={() => {
                      if (!rescheduleName.trim()) {
                        toast.error('Please enter a course name')
                        return
                      }
                      setWizardTab('category')
                    }}
                    className="h-11 rounded-[12px] bg-white px-6 text-[#0B3A9B] hover:bg-white/90"
                  >
                    Next →
                  </Button>
                </div>
              </TabsContent>

              {/* Tab: Category */}
              <TabsContent value="category" className="mt-4 flex flex-1 flex-col overflow-hidden">
                <div className="scrollbar-hide flex flex-1 flex-col overflow-y-auto pr-2">
                  <div className="max-h-[55vh] overflow-y-auto rounded-lg bg-white p-4 text-slate-900">
                    <CourseCategoryPicker
                      value={rescheduleCategories}
                      onChange={setRescheduleCategories}
                      storageUserId={undefined}
                    />
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setWizardTab('details')}
                    className="h-11 rounded-[12px] border-white/30 bg-white/10 px-6 text-white hover:bg-white/20"
                  >
                    ← Back
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (rescheduleCategories.length === 0) {
                        toast.error('Please select at least one category')
                        return
                      }
                      setWizardTab('schedule')
                    }}
                    className="h-11 rounded-[12px] bg-white px-6 text-[#0B3A9B] hover:bg-white/90"
                  >
                    Next →
                  </Button>
                </div>
              </TabsContent>

              {/* Tab: Schedule */}
              <TabsContent value="schedule" className="mt-4 flex flex-1 flex-col overflow-hidden">
                <div className="scrollbar-hide flex flex-1 flex-col overflow-hidden pr-2">
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
                    showTabs={false}
                  />
                </div>

                <div className="mt-4 flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setWizardTab('category')}
                    className="h-11 rounded-[12px] border-white/30 bg-white/10 px-6 text-white hover:bg-white/20"
                  >
                    ← Back
                  </Button>
                  <Button
                    type="button"
                    onClick={handleRescheduleSave}
                    disabled={rescheduleSaving || !rescheduleName.trim()}
                    className="h-11 rounded-[12px] bg-white px-6 text-[#0B3A9B] hover:bg-white/90"
                  >
                    {rescheduleSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {rescheduleSaving ? 'Publishing...' : 'Publish'}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
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
