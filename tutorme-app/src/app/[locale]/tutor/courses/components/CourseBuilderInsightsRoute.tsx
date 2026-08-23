/**
 * Insights-only course builder shell — `/tutor/insights`.
 * Standalone insights builder shell — edit this file independently.
 */

'use client'

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  ClipboardCheck,
  PencilRuler,
  MonitorPlay,
  Wrench,
  PhoneOff,
  Presentation,
  ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'
import {
  AnimatedControlButton,
  actionButtonBase,
} from '@/components/controls/AnimatedControlButton'
import { CourseCategoryPicker, TAB_COLORS } from './CourseCategoryPicker'
import { getCategoryBoard } from '@/lib/data/category-board'
import { CourseSelectorDialog } from '@/components/course/course-selector-dialog'
import { useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  motion,
  AnimatePresence,
  useDragControls,
  useMotionValue,
  useTransform,
} from 'framer-motion'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { CourseBuilder } from '../../dashboard/components/CourseBuilder'
import { PanelErrorBoundary } from '@/components/ui/panel-error-boundary'
import { GoLiveDialog } from '../../dashboard/components/GoLiveDialog'
import { DemoVideoManager } from '@/components/demo-video/DemoVideoManager'
import { toast } from 'sonner'
import type { CourseBuilderInsightsProps } from './course-builder-types'
import type { CourseBuilderRef } from '../../dashboard/components/builder-types'
import {
  useCourseBuilderContentModel,
  type UseCourseBuilderContentArgs,
} from './use-course-builder-content-model'
import { resolveLessonDmis, isDraftCourseId } from './save-course'
import { preSaveDecision } from '@/lib/courses/course-builder-guards'
import type { ScheduleItem } from '../[id]/constants'
import { CountryFlag } from '@/components/country-flag'

const BOARD_TO_TAB_KEY: Record<string, string> = {
  Global: 'global',
  AP: 'ap',
  'A Level': 'alevel',
  IB: 'ib',
  IGCSE: 'igcse',
  Languages: 'languages',
  Professional: 'professional',
  Universities: 'universities',
}

function WifiSignal({
  connected,
  error,
  size = 'sm',
}: {
  connected: boolean
  error: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const color = error ? 'text-red-600' : connected ? 'text-emerald-600' : 'text-amber-500'
  const sizeClass = size === 'lg' ? 'h-6 w-6' : size === 'md' ? 'h-5 w-5' : 'h-4 w-4'

  return (
    <div className="relative flex items-center justify-center">
      <style jsx>{`
        @keyframes wifi-bar {
          0%,
          100% {
            opacity: 0.5;
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
        className={cn(sizeClass, color)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={size === 'md' || size === 'lg' ? 2.5 : 2}
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

const modeButtonBase =
  'flex h-7 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:ring-0 focus-visible:ring-offset-0'

type Props = UseCourseBuilderContentArgs & {
  insightsProps: CourseBuilderInsightsProps
  sessionCategory?: string | null
  sessionNationality?: string | null
  sessionVariantName?: string | null
  onSaveCourse?: (lessons: any[], options?: any) => void
  onSyncToLiveSession?: (silent?: boolean) => void
  onCreateCourse?: () => void
  onCreateTemplate?: (lessons: any[], options?: any) => Promise<void>
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
    folder?: string | null
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
    folder?: string | null
    schedule?: ScheduleItem[]
  }[]
  courseName?: string
  onCourseNameChange?: (name: string) => void
  saveMode?: 'live' | 'draft'
  onSaveModeChange?: (mode: 'live' | 'draft') => void
  modeLocked?: boolean
}

type ControlsMode = 'edit' | 'test' | 'classroom'

interface TutorControlsPanelProps {
  mode: ControlsMode
  onModeChange: (mode: ControlsMode) => void
  disabled?: boolean
  positionAnchorRefs?: {
    badgeRef: React.RefObject<HTMLElement | null>
    indicatorRef: React.RefObject<HTMLElement | null>
  }
  onSave: () => void
  onSchedule?: () => void
  onDelete: () => void
  onGoLive: () => void
  onRecordDemo: () => void
  onLaunchVideo: () => void
  onSync: () => void
  onCreateCourse?: () => void
  onEditCourse?: () => void
  canDelete: boolean
  canSchedule: boolean
  canGoLive: boolean
  hasSession: boolean
  isDemoSession?: boolean
  isCourseSession?: boolean
  hasUnsyncedChanges?: boolean
  onEndSession?: () => void
  onLeaveSession?: () => void
  endingSession?: boolean
  leavingSession?: boolean
  isConnected?: boolean
  connectionError?: boolean
  scheduleButtonLabel?: string
  onCreateTemplate?: () => void
  createTemplateButtonLabel?: string
}

function TutorControlsPanel({
  mode,
  onModeChange,
  disabled,
  positionAnchorRefs,
  onSave,
  onSchedule,
  onDelete,
  onGoLive,
  onRecordDemo,
  onLaunchVideo,
  onSync,
  onCreateCourse,
  onEditCourse,
  canDelete,
  canSchedule,
  canGoLive,
  hasSession,
  isDemoSession,
  isCourseSession,
  hasUnsyncedChanges,
  onEndSession,
  onLeaveSession,
  endingSession,
  leavingSession,
  isConnected,
  connectionError,
  scheduleButtonLabel,
  onCreateTemplate,
  createTemplateButtonLabel,
}: TutorControlsPanelProps) {
  const [open, setOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragControls = useDragControls()

  // Constrain dragging to a padded viewport area so the panel can never be
  // completely lost off-screen.
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLButtonElement>(null)

  // Start the panel centered between the category badge and the course-state
  // indicator so it lands in the header by default. If either anchor is missing,
  // fall back to the top-center of the viewport container so the panel is still
  // visible and near the hero area. For demo / asynchronous sessions the badge
  // anchor is absent, so we anchor the panel to the right of the state indicator.
  const panelX = useMotionValue(0)
  const panelY = useMotionValue(0)
  const panelOpacity = useMotionValue(0)
  const bodyY = useTransform(
    panelY,
    y => y + (headerRef.current?.getBoundingClientRect().height ?? 40)
  )
  const hasPositionedRef = useRef(false)

  const fallbackTopCenterPanel = useCallback(() => {
    const panel = panelRef.current
    const container = containerRef.current
    if (!panel || !container) return
    const containerRect = container.getBoundingClientRect()
    const panelRect = panel.getBoundingClientRect()
    panelX.set(containerRect.width / 2 - panelRect.width / 2)
    // Keep it just below the top edge so it stays in the hero/header region.
    panelY.set(16)
  }, [panelX, panelY])

  const positionPanel = useCallback(() => {
    if (!positionAnchorRefs) {
      fallbackTopCenterPanel()
      panelOpacity.set(1)
      hasPositionedRef.current = true
      return
    }
    const badge = positionAnchorRefs.badgeRef.current
    const indicator = positionAnchorRefs.indicatorRef.current
    const panel = panelRef.current
    const container = containerRef.current
    const header = headerRef.current
    if (!indicator || !panel || !container) {
      fallbackTopCenterPanel()
      panelOpacity.set(1)
      hasPositionedRef.current = true
      return
    }
    const indicatorRect = indicator.getBoundingClientRect()
    const panelRect = panel.getBoundingClientRect()
    const headerHeight = header?.getBoundingClientRect().height ?? panelRect.height
    const containerRect = container.getBoundingClientRect()

    let x: number
    let y: number
    if (badge && !isDemoSession) {
      const badgeRect = badge.getBoundingClientRect()
      const midX = (badgeRect.right + indicatorRect.left) / 2
      const midY = (badgeRect.top + badgeRect.bottom) / 2
      x = midX - containerRect.left - panelRect.width / 2
      y = midY - containerRect.top - headerHeight / 2
    } else {
      // Demo / async sessions: park the panel just to the right of the state
      // indicator in the top hero panel while keeping it draggable.
      const gap = 12
      x = indicatorRect.right - containerRect.left + gap
      y = indicatorRect.top - containerRect.top + indicatorRect.height / 2 - headerHeight / 2
    }

    // Clamp so the panel never starts off-screen horizontally.
    const padding = 12
    x = Math.max(padding, Math.min(x, containerRect.width - panelRect.width - padding))
    // Keep the panel header inside the top hero/header area; the body may extend
    // downward, so we clamp against the header height rather than the full panel.
    y = Math.max(padding, Math.min(y, containerRect.height - headerHeight - padding))

    panelX.set(x)
    panelY.set(y)
    panelOpacity.set(1)
    hasPositionedRef.current = true
  }, [positionAnchorRefs, isDemoSession, panelX, panelY, panelOpacity, fallbackTopCenterPanel])

  useLayoutEffect(() => {
    positionPanel()
  }, [positionPanel])

  // Re-position on resize so the panel doesn't drift off-screen after window
  // changes. Only reposition before the user has dragged it (we have no robust
  // drag tracking, so we assume the first resize after mount is still setup).
  useEffect(() => {
    const handleResize = () => {
      if (hasPositionedRef.current) {
        positionPanel()
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [positionPanel])

  // Sliding pill state for the mode selector (mirrors SlidingPillTabsList).
  const modeListRef = useRef<HTMLDivElement>(null)
  const [modePill, setModePill] = useState<{ left: number; width: number } | null>(null)

  const updateModePill = useCallback(() => {
    const list = modeListRef.current
    if (!list) return
    const triggers = Array.from(list.querySelectorAll('[role="tab"]'))
    const active = triggers.find(t => t.getAttribute('data-state') === 'active')
    if (!active) return
    const rect = active.getBoundingClientRect()
    const listRect = list.getBoundingClientRect()
    setModePill({ left: rect.left - listRect.left, width: rect.width })
  }, [])

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => updateModePill())
    return () => cancelAnimationFrame(id)
  }, [mode, open, updateModePill])

  useEffect(() => {
    const id = setTimeout(updateModePill, 100)
    return () => clearTimeout(id)
  }, [open, updateModePill])

  useEffect(() => {
    const handleResize = () => updateModePill()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [updateModePill])

  useEffect(() => {
    const list = modeListRef.current
    if (!list) return
    const ro = new ResizeObserver(() => updateModePill())
    ro.observe(list)
    return () => ro.disconnect()
  }, [open, updateModePill])

  const panelDisabled = disabled || false

  return (
    <div ref={containerRef} className="pointer-events-none fixed inset-4 z-50">
      {/* Draggable header — its height never changes, so drag constraints cannot
          nudge the panel when the controls body expands. */}
      <motion.div
        ref={panelRef}
        drag
        dragConstraints={containerRef}
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => setTimeout(() => setIsDragging(false), 50)}
        style={{ x: panelX, y: panelY, opacity: panelOpacity }}
        className={cn(
          'pointer-events-auto absolute left-0 top-0 z-10 flex h-10 w-96 cursor-default select-none items-center overflow-hidden border border-white/10 bg-[#1F2933]/60 shadow-2xl backdrop-blur-xl',
          open ? 'rounded-t-2xl border-b' : 'rounded-2xl'
        )}
      >
        {/* Header / drag handle */}
        <button
          ref={headerRef}
          type="button"
          className={cn(
            'relative flex h-10 w-full cursor-grab items-center px-3 active:cursor-grabbing',
            open ? 'rounded-t-2xl' : 'rounded-2xl'
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
      </motion.div>

      {/* Controls body — follows the header and expands without affecting the
          drag constraints of the header. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="controls-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ x: panelX, y: bodyY }}
            className="pointer-events-auto absolute left-0 top-0 w-96 origin-top overflow-hidden rounded-b-2xl border border-t-0 border-white/10 bg-[#1F2933]/60 shadow-2xl backdrop-blur-xl"
          >
            <div className="p-3 pt-0">
              {/* Mode selector */}
              <Tabs
                value={mode}
                onValueChange={v => onModeChange(v as ControlsMode)}
                className="mt-2 w-full"
              >
                <TabsList
                  ref={modeListRef}
                  data-testid="builder-mode-tabs"
                  className="relative grid h-9 w-full grid-cols-3 gap-1 rounded-lg bg-white p-1"
                >
                  <TabsTrigger
                    value="edit"
                    className={cn(
                      modeButtonBase,
                      'relative z-10 text-slate-700',
                      'data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none data-[state=active]:hover:text-white'
                    )}
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    Edit
                  </TabsTrigger>
                  <TabsTrigger
                    value="test"
                    className={cn(
                      modeButtonBase,
                      'relative z-10 text-slate-700',
                      'data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none data-[state=active]:hover:text-white'
                    )}
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Test
                  </TabsTrigger>
                  <TabsTrigger
                    value="classroom"
                    className={cn(
                      modeButtonBase,
                      'relative z-10 text-slate-700',
                      'data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none data-[state=active]:hover:text-white'
                    )}
                  >
                    <MonitorPlay className="h-3.5 w-3.5" />
                    Classroom
                  </TabsTrigger>
                  {modePill && (
                    <div
                      className={cn(
                        'absolute bottom-1 top-1 rounded-lg shadow-sm transition-all duration-300 ease-out',
                        mode === 'edit' && 'bg-[#3B82F6]',
                        mode === 'test' && 'bg-[#8B5CF6]',
                        mode === 'classroom' && 'bg-[#F4A9A0]'
                      )}
                      style={{
                        left: modePill.left,
                        width: modePill.width,
                      }}
                    />
                  )}
                </TabsList>
              </Tabs>

              {/* Action buttons */}
              <div className="mt-[17px]">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-2">
                    <AnimatedControlButton
                      icon={<Save className="h-4 w-4" />}
                      label="Save"
                      disabled={panelDisabled}
                      onClick={onSave}
                      className="bg-white text-gray-900"
                    />

                    <AnimatedControlButton
                      icon={<Trash2 className="h-4 w-4" />}
                      label="Delete"
                      disabled={panelDisabled || mode !== 'edit' || !canDelete}
                      onClick={onDelete}
                      className="bg-white text-red-600"
                    />

                    <AnimatedControlButton
                      icon={<Edit3 className="h-4 w-4" />}
                      label="Edit Category"
                      disabled={panelDisabled || mode !== 'edit' || !onEditCourse}
                      onClick={onEditCourse}
                      className="bg-white text-slate-700"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <AnimatedControlButton
                      icon={<Presentation className="h-4 w-4" />}
                      label="Create Class"
                      disabled={panelDisabled || mode !== 'edit' || !canGoLive}
                      onClick={onGoLive}
                      className="bg-white text-emerald-600"
                    />

                    <AnimatedControlButton
                      icon={<VideoIcon className="h-4 w-4" />}
                      label={isDemoSession ? 'Record Demo' : 'Video'}
                      disabled={panelDisabled || !hasSession}
                      onClick={isDemoSession ? onRecordDemo : onLaunchVideo}
                      className="bg-white text-slate-700"
                    />

                    <AnimatedControlButton
                      icon={<Plus className="h-4 w-4" />}
                      label="New Course"
                      disabled={panelDisabled || mode !== 'edit'}
                      onClick={onCreateCourse}
                      className="bg-white text-blue-500"
                    />
                  </div>
                </div>

                {/* Schedule / Create Template / End Session — full width, below the grid.
                    During a session the End Session button replaces scheduling so tutors
                    can't publish while in session. For Creating-mode drafts the action
                    becomes "Create Template", which persists the draft as an unpublished
                    DB course and keeps the tutor in the builder.

                    Course sessions cannot be ended by the tutor — they run until their
                    scheduled end time. In that case the button becomes a neutral Leave
                    action that only disconnects the tutor from the room. */}
                {hasSession && isCourseSession && onLeaveSession ? (
                  <button
                    type="button"
                    disabled={panelDisabled || leavingSession}
                    onClick={onLeaveSession}
                    className={cn(
                      actionButtonBase,
                      'mt-2 w-full justify-center bg-white text-slate-700 hover:bg-slate-100 active:bg-slate-200'
                    )}
                  >
                    {leavingSession ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <PhoneOff className="h-4 w-4" />
                    )}
                    <span className="leading-none">
                      {leavingSession ? 'Leaving…' : 'Leave classroom'}
                    </span>
                  </button>
                ) : hasSession && onEndSession ? (
                  <button
                    type="button"
                    disabled={panelDisabled || endingSession}
                    onClick={onEndSession}
                    className={cn(
                      actionButtonBase,
                      'mt-2 w-full justify-center bg-red-600 text-white hover:bg-red-700 active:bg-red-800'
                    )}
                  >
                    {endingSession ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PhoneOff className="h-4 w-4" />
                    )}
                    <span className="leading-none">
                      {endingSession ? 'Ending…' : isDemoSession ? 'Exit' : 'End Session'}
                    </span>
                  </button>
                ) : createTemplateButtonLabel ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled={panelDisabled || mode !== 'edit' || !canSchedule}
                          onClick={onCreateTemplate}
                          className={cn(
                            actionButtonBase,
                            'mt-2 w-full bg-white text-[#3B82F6] hover:bg-blue-50 active:bg-blue-100'
                          )}
                        >
                          <Calendar className="h-4 w-4" />
                          <span className="leading-none">{createTemplateButtonLabel}</span>
                        </button>
                      </TooltipTrigger>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled={panelDisabled || mode !== 'edit' || !canSchedule}
                          onClick={onSchedule}
                          className={cn(
                            actionButtonBase,
                            'mt-2 w-full bg-white text-[#3B82F6] hover:bg-blue-500 hover:text-white active:bg-blue-600'
                          )}
                        >
                          <Calendar className="h-4 w-4" />
                          <span className="leading-none">Schedule & Publish</span>
                        </button>
                      </TooltipTrigger>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
  onCreateTemplate,
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
  const [leavingSession, setLeavingSession] = useState(false)
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
  const categoryBadgeRef = useRef<HTMLSpanElement>(null)
  const courseStateIndicatorRef = useRef<HTMLDivElement>(null)
  const positionAnchorRefs = useMemo(
    () => ({
      badgeRef: categoryBadgeRef,
      indicatorRef: courseStateIndicatorRef,
    }),
    []
  )
  const showWifiSignal = isClassroomMode || activeMainTab === 'live'

  // Safety gate: never hand a delete-missing save to the backend while the initial
  // DB load is still pending. The builder's local tree does not yet reflect the
  // database, so a save in this window would soft-delete every not-yet-loaded lesson.
  const gatedOnSaveCourse = useCallback(
    async (lessons: any[], options?: any) => {
      const gate = preSaveDecision({
        isDetached: dataMode === 'detached',
        isDraftCourse: isDraftCourseId(courseId),
        loadedLessonsIsNull: model.loadedLessons === null,
        isAutoSave: !!options?.isAutoSave,
      })
      if (gate !== 'proceed') {
        if (gate === 'block-warn') {
          toast.error('Lessons haven’t finished loading yet — reload the course before saving.')
        }
        return
      }
      return onSaveCourse?.(lessons, options)
    },
    [dataMode, courseId, model.loadedLessons, onSaveCourse]
  )

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
  const [isRecordDemoOpen, setIsRecordDemoOpen] = useState(false)
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
  const [courseSelectorOpen, setCourseSelectorOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [leftPanelHidden, setLeftPanelHidden] = useState(false)
  const [controlsMode, setControlsMode] = useState<ControlsMode>(
    initialMainTab === 'live' ? 'classroom' : initialMainTab === 'test-pci' ? 'test' : 'edit'
  )

  // Persist mode is determined by the course itself, not by the toggle.
  const effectiveSaveMode = useMemo((): 'live' | 'draft' => {
    if (draftCourses?.some(c => c.id === courseId)) return 'draft'
    return 'live'
  }, [courseId, draftCourses])

  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false)

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

  // Allow switching between Live / Edit / Test even during a live session so
  // tutors can edit and test the course mid-class. Classroom mode only sets the
  // INITIAL tab to 'live' (see the effect above) — it no longer locks it.
  const handleMainTabChange = useCallback((tab: 'live' | 'builder' | 'test-pci') => {
    setActiveMainTab(tab)
    if (tab === 'builder') setControlsMode('edit')
    if (tab === 'test-pci') setControlsMode('test')
    if (tab === 'live') setControlsMode('classroom')
  }, [])

  const handleControlsModeChange = useCallback(
    (mode: ControlsMode) => {
      setControlsMode(mode)
      if (mode === 'edit') {
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
  const isDemoSession = currentSession?.sessionType === 'GO_LIVE_DEMO'
  const isCourseSession = currentSession?.sessionType === 'COURSE'
  const scheduledDateStr = currentSession?.scheduledAt
  let countdownText = '--:--'
  let isOverdue = false
  if (scheduledDateStr && activeMainTab === 'live') {
    const scheduled = new Date(scheduledDateStr).getTime()
    const nowTime = now.getTime()
    const SESSION_LENGTH_MS = 60 * 60 * 1000
    if (nowTime < scheduled) {
      // Session has not opened yet: freeze at 60:00 remaining.
      countdownText = '60:00 remaining'
    } else {
      const endTime = scheduled + SESSION_LENGTH_MS
      const diff = endTime - nowTime
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
  }

  const handleStartSessionClick = () => {
    if (insightsProps.sessionId) {
      if (insightsProps.onStartSession) {
        insightsProps.onStartSession()
      } else {
        // Fallback if not provided from the parent
        setGoLiveDialogOpen(true)
      }
    } else {
      setGoLiveDialogOpen(true)
    }
  }

  const handleLaunchVideo = () => {
    // In a demo session the button reverts to the demo recorder.
    if (isDemoSession) {
      setIsRecordDemoOpen(true)
      return
    }
    // During a live session, launch the live video connection.
    if (insightsProps.sessionId) {
      if (insightsProps.onStartSession) {
        insightsProps.onStartSession()
      } else {
        model.router.push(`/tutor/classroom?sessionId=${insightsProps.sessionId}`)
      }
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

  const handleLeaveSession = async () => {
    if (!insightsProps.sessionId || leavingSession) return
    setLeavingSession(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch(`/api/tutor/classes/${insightsProps.sessionId}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to leave session')
      }

      model.router.push('/tutor/dashboard')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to leave session')
    } finally {
      setLeavingSession(false)
    }
  }

  const handleCreateTemplate = async () => {
    if (!courseId || courseId === 'insights-draft' || !onCreateTemplate) return

    // Validate category is selected before creating the template.
    const courseCategories = [...(courses || []), ...(draftCourses || [])].find(
      (c: any) => c.id === courseId
    )?.categories
    if (!courseCategories || courseCategories.length === 0) {
      openCategoryRequired()
      return
    }

    // Read the editor's current tree, falling back to the draft's localStorage cache.
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
        // ignore malformed cache
      }
    }
    const { lessons, hasMissingDmis } = resolveLessonDmis(rawLessons)

    // Persist current editor edits before converting.
    if (editorLessons.length > 0) {
      const saveCb = (model.courseBuilderRef.current as any)?.saveAll
      if (typeof saveCb === 'function') await saveCb()
    }

    if (hasMissingDmis) {
      if (
        !window.confirm(
          'Some assessments have no DMIs. Are you sure you want to create this template?'
        )
      ) {
        return
      }
    }

    await onCreateTemplate(lessons, {
      courseName,
      courseDescription: model.course?.description,
      categories: courseCategories,
    })
  }

  // Search both lists regardless of saveMode so the selected course is always found
  const currentCourse = [...(courses || []), ...(draftCourses || [])].find(c => c.id === courseId)

  type CourseStateIndicator = 'creating' | 'unpublished' | 'published' | 'demo'
  const currentCourseState = useMemo((): CourseStateIndicator => {
    if (isDemoSession) return 'demo'
    if (!courseId) return 'creating'
    if (draftCourses?.some(c => c.id === courseId)) return 'creating'
    const dbCourse = courses?.find(c => c.id === courseId)
    if (dbCourse?.isPublished) return 'published'
    return 'unpublished'
  }, [courseId, courses, draftCourses, isDemoSession])

  const stateIndicatorMeta: Record<
    CourseStateIndicator,
    { label: string; dot: string; bg: string; text: string; border: string }
  > = {
    unpublished: {
      label: 'Template',
      dot: 'bg-green-500',
      bg: 'bg-green-50',
      text: 'text-green-700',
      border: 'border-green-200',
    },
    published: {
      label: 'Published',
      dot: 'bg-blue-500',
      bg: 'bg-blue-50',
      text: 'text-blue-600',
      border: 'border-blue-200',
    },
    creating: {
      label: 'Creating',
      dot: 'bg-amber-500',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      border: 'border-amber-200',
    },
    demo: {
      label: 'Class Demo',
      dot: 'bg-violet-500',
      bg: 'bg-violet-50',
      text: 'text-violet-700',
      border: 'border-violet-200',
    },
  }

  /** Reusable course category badge used in builder, live, and test-pci headers so
   *  the hero panel always shows the category and the controls panel has a stable
   *  anchor to position itself against. Falls back to session-level category info
   *  when the course object itself lacks categories (common for demo sessions). */
  const CourseCategoryBadge = ({
    course,
    badgeRef,
    sessionCategory,
    sessionNationality,
    sessionVariantName,
  }: {
    course: any
    badgeRef?: React.Ref<HTMLSpanElement>
    sessionCategory?: string | null
    sessionNationality?: string | null
    sessionVariantName?: string | null
  }) => {
    const hasCourseCategories = course?.categories?.length > 0
    const label = sessionVariantName
      ? sessionVariantName
      : sessionCategory && sessionNationality
        ? `${sessionCategory} — ${sessionNationality}`
        : sessionCategory || sessionNationality

    if (!hasCourseCategories && !label) return null

    const category = hasCourseCategories ? course.categories[0] : sessionCategory
    const board = getCategoryBoard(category)
    const tabKey = board ? BOARD_TO_TAB_KEY[board] : 'diy'
    const colors = TAB_COLORS[tabKey] || TAB_COLORS.diy
    return (
      <span
        ref={badgeRef}
        className={cn(
          'ml-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium',
          colors.bg,
          colors.text
        )}
      >
        {hasCourseCategories
          ? [board, course.categories.join(', '), course.nationality].filter(Boolean).join(' · ')
          : label}
      </span>
    )
  }

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
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="text-[#344054] hover:bg-slate-100 hover:text-slate-900"
              >
                <Link href="/tutor/dashboard" aria-label="Go back">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>

              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  {/* Course selector — locked to read-only when a session is active */}
                  {activeMainTab !== 'live' &&
                    activeMainTab !== 'test-pci' &&
                    insightsProps.onCourseChange && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => setCourseSelectorOpen(true)}
                          disabled={hasNoCourses}
                          className={cn(
                            'h-9 min-w-[300px] max-w-[540px] justify-center border border-slate-300 bg-transparent px-3 text-sm font-semibold text-[#1F2933] shadow-none transition-colors hover:border-blue-500 hover:bg-blue-50/50 hover:text-blue-500 focus-visible:ring-0 focus-visible:ring-offset-0',
                            hasNoCourses && 'cursor-not-allowed opacity-60'
                          )}
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
                        </Button>
                        <CourseSelectorDialog
                          open={courseSelectorOpen}
                          onOpenChange={setCourseSelectorOpen}
                          courses={courses ?? []}
                          draftCourses={draftCourses ?? []}
                          currentCourseId={courseId}
                          onSelectCourse={id => insightsProps.onCourseChange?.(id)}
                          onSelectDemoClass={id =>
                            model.router.push(`/tutor/insights?sessionId=${id}`)
                          }
                        />
                      </>
                    )}

                  {activeMainTab === 'builder' && (
                    <h1 className="pointer-events-none absolute left-0 right-0 mx-auto flex items-center justify-center gap-2 text-2xl font-bold tracking-tight text-[#1F2933]">
                      <WifiSignal
                        connected={!!insightsProps.isConnected}
                        error={!!insightsProps.sessionId && !insightsProps.isConnected}
                        size="md"
                      />
                      {currentCourse?.name && (
                        <span className="text-xl font-normal text-slate-500">
                          {currentCourse.name}
                        </span>
                      )}
                      {/* Full identity next to the name: Board (derived) · category ·
                          country (country appears once published, from the variant). */}
                      <CourseCategoryBadge course={currentCourse} badgeRef={categoryBadgeRef} />
                    </h1>
                  )}
                  {activeMainTab === 'live' && (
                    // Centered across the full header via absolute positioning;
                    // pointer-events-none so the overlay never blocks the back
                    // button / header controls underneath it.
                    <h1 className="pointer-events-none absolute left-0 right-0 mx-auto flex items-center justify-center gap-2 text-2xl font-bold tracking-tight text-[#1F2933]">
                      {scheduledDateStr && !isDemoSession && (
                        <span
                          className={cn(
                            'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-medium shadow-sm transition-colors',
                            isOverdue
                              ? 'border-red-200 bg-red-50 text-red-700'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          )}
                        >
                          <Timer className="h-4 w-4" />
                          <span>{countdownText}</span>
                        </span>
                      )}
                      {model.course?.name && (
                        <span className="text-xl font-normal text-slate-500">
                          {model.course.name}
                        </span>
                      )}
                      <CourseCategoryBadge
                        course={currentCourse}
                        badgeRef={categoryBadgeRef}
                        sessionCategory={sessionCategory}
                        sessionNationality={sessionNationality}
                        sessionVariantName={sessionVariantName}
                      />
                    </h1>
                  )}
                  {activeMainTab === 'test-pci' && (
                    <h1 className="pointer-events-none absolute left-0 right-0 mx-auto flex items-center justify-center gap-2 text-2xl font-bold tracking-tight text-[#1F2933]">
                      {(model.course?.name || currentCourse?.name) && (
                        <span className="text-xl font-normal text-slate-500">
                          {model.course?.name || currentCourse?.name}
                        </span>
                      )}
                      <CourseCategoryBadge course={currentCourse} badgeRef={categoryBadgeRef} />
                    </h1>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Course state indicator (read-only). Bright, vibrant pill that reflects
                  the derived state of the selected course or demo class. */}
              {activeMainTab !== 'test-pci' && courseId && (
                <div
                  ref={courseStateIndicatorRef}
                  className={cn(
                    'flex h-9 w-[190px] items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium shadow-sm',
                    stateIndicatorMeta[currentCourseState].bg,
                    stateIndicatorMeta[currentCourseState].text,
                    stateIndicatorMeta[currentCourseState].border
                  )}
                >
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full shadow-sm',
                      stateIndicatorMeta[currentCourseState].dot
                    )}
                  />
                  {stateIndicatorMeta[currentCourseState].label}
                </div>
              )}
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
              onSave={gatedOnSaveCourse}
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
              courseState={currentCourseState}
              onSyncToLiveSession={onSyncToLiveSession}
              onUnsyncedChangesChange={setHasUnsyncedChanges}
              focusLessonId={
                isClassroomMode ? (searchParams.get('lessonId') ?? undefined) : undefined
              }
              isDemoSession={isDemoSession}
              isTestMode={controlsMode === 'test'}
            />
          </PanelErrorBoundary>
        )}

        {!model.loading && courseId && (
          <TutorControlsPanel
            mode={controlsMode}
            onModeChange={handleControlsModeChange}
            positionAnchorRefs={positionAnchorRefs}
            onSave={async () => {
              const ref = model.courseBuilderRef.current as CourseBuilderRef | null
              if (typeof ref?.saveAll === 'function') {
                await ref.saveAll()
              } else {
                toast.error('Builder not ready to save')
              }
            }}
            onSchedule={() => {
              if (courseId && courseId !== 'insights-draft') {
                model.router.push(`/tutor/courses/${courseId}`)
              }
            }}
            onCreateTemplate={() => void handleCreateTemplate()}
            createTemplateButtonLabel={
              effectiveSaveMode === 'draft' ? 'Create Template' : undefined
            }
            onDelete={() => onDeleteCourse?.()}
            onGoLive={handleStartSessionClick}
            onLaunchVideo={handleLaunchVideo}
            onRecordDemo={() => setIsRecordDemoOpen(true)}
            onSync={() => {
              const ref = model.courseBuilderRef.current as CourseBuilderRef | null
              ref?.triggerSync?.()
            }}
            onCreateCourse={onCreateCourse}
            onEditCourse={courseId && !currentCourse?.isPublished ? openEditCourse : undefined}
            canDelete={!!(courseId && courseId !== 'insights-draft' && onDeleteCourse)}
            // Schedule & Publish is available for any selected DB course. Creating-mode
            // drafts show "Create Template" instead, which persists to the DB in place.
            canSchedule={!!(courseId && courseId !== 'insights-draft')}
            scheduleButtonLabel={
              effectiveSaveMode === 'draft' ? undefined : 'Schedule & Publish New Course'
            }
            canGoLive={
              !!(
                courseId &&
                courseId !== 'insights-draft' &&
                effectiveSaveMode !== 'draft' &&
                !insightsProps.sessionId
              )
            }
            hasSession={!!insightsProps.sessionId}
            isDemoSession={isDemoSession}
            isCourseSession={isCourseSession}
            hasUnsyncedChanges={hasUnsyncedChanges}
            onEndSession={
              insightsProps.sessionId && !isCourseSession ? handleEndSession : undefined
            }
            onLeaveSession={
              insightsProps.sessionId && isCourseSession ? handleLeaveSession : undefined
            }
            endingSession={endingSession}
            leavingSession={leavingSession}
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

      {/* Record Demo Dialog */}
      <Dialog open={isRecordDemoOpen} onOpenChange={setIsRecordDemoOpen}>
        <DialogContent
          className="max-h-[90vh] w-full max-w-5xl overflow-hidden border border-slate-200 bg-[rgba(31,41,51,0.60)] shadow-2xl backdrop-blur-xl"
          aria-describedby={undefined}
        >
          <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-slate-900/5 via-slate-900/10 to-slate-900/20" />
          <div className="relative z-10 flex flex-col overflow-hidden">
            <DialogHeader className="shrink-0 border-b-0 pb-4 pt-4 text-center">
              <DialogTitle className="mx-auto text-center text-white">Record Demo</DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 pb-4">
              {insightsProps.sessionId && (
                <DemoVideoManager sessionId={insightsProps.sessionId} defaultTab="record" />
              )}
            </div>

            <DialogFooter className="shrink-0 gap-3 border-white/20 px-6 pb-4">
              <Button variant="modal-secondary-dark" onClick={() => setIsRecordDemoOpen(false)}>
                Close
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
          <div className="space-y-2">
            <Input
              value={renameValue}
              onChange={e => {
                const value = e.target.value
                if (value.length <= 25) {
                  setRenameValue(value)
                }
              }}
              placeholder="Course name"
              maxLength={25}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  onCourseNameChange?.(renameValue)
                  setIsRenameDialogOpen(false)
                }
              }}
            />
            <div className="flex justify-end">
              <span
                className={`text-xs font-medium ${
                  (renameValue?.length || 0) >= 25
                    ? 'text-red-500'
                    : (renameValue?.length || 0) >= 20
                      ? 'text-orange-500'
                      : 'text-gray-500'
                }`}
              >
                {renameValue?.length || 0}/25
              </span>
            </div>
          </div>
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
        <DialogContent className="max-w-md border border-slate-200 shadow-2xl">
          <DialogHeader className="text-center">
            <DialogTitle className="mx-auto text-center text-white">Delete Course</DialogTitle>
            <DialogDescription className="text-white/80">
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
