'use client'

import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// DnD Kit imports
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Users,
  Plus,
  BookOpen,
  Video,
  Filter,
  Bell,
  Repeat,
  X,
  CheckCircle2,
  AlertTriangle,
  GripVertical,
  RefreshCw,
  ExternalLink,
  Loader2,
  Wand2,
} from 'lucide-react'

// Date manipulation
import { addDays, addWeeks, format, isSameDay, isBefore, startOfDay, startOfWeek } from 'date-fns'

interface CalendarEvent {
  id: string
  title: string
  date: Date
  duration: number
  type: 'class' | 'office_hours' | 'personal' | 'deadline'
  status: 'scheduled' | 'live' | 'completed' | 'cancelled'
  sessionId?: string
  studentCount?: number
  maxStudents?: number
  subject?: string
  location?: string
  isOnline?: boolean
  description?: string
  color?: string
  isRecurring?: boolean
  recurringPattern?: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  courseName?: string
  nationality?: string
  variantCategory?: string
}

interface AvailabilityBlock {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  isAvailable: boolean
}

interface CalendarConnection {
  id: string
  provider: 'google' | 'outlook' | 'apple'
  connected: boolean
  email?: string
  lastSynced?: Date
  syncEnabled: boolean
}

export const DEFAULT_TIMEZONE =
  (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC'

interface IntlWithSupportedValues {
  supportedValuesOf: (key: 'timeZone') => string[]
}

export const SUPPORTED_TIMEZONES =
  typeof Intl !== 'undefined' &&
  typeof (Intl as unknown as IntlWithSupportedValues).supportedValuesOf === 'function'
    ? (Intl as unknown as IntlWithSupportedValues).supportedValuesOf('timeZone')
    : [DEFAULT_TIMEZONE, 'UTC', 'Asia/Shanghai', 'America/New_York', 'Europe/London']

interface InteractiveCalendarProps {
  events?: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
  onDateClick?: (date: Date) => void
  onCreateClass?: (date: Date) => void
  onEventUpdate?: (event: CalendarEvent) => void
  loading?: boolean
  mode?: 'tutor' | 'student'
  initialView?: CalendarView
  dayClickMode?: 'create' | 'availability' | 'callback'
  /** When true, renders a stripped-down availability-only UI without calendar chrome (nav, filters, view toggles). */
  availabilityOnly?: boolean
  /** When true, renders without outer Card styling for embedding inside another container. */
  embedded?: boolean
  timezone?: string
  onTimezoneChange?: (tz: string) => void
  /** Controlled view state */
  view?: CalendarView
  onViewChange?: (view: CalendarView) => void
}

const generateDemoEvents = (): CalendarEvent[] => {
  return []
}

const TIME_SLOTS = [
  '00:00',
  '01:00',
  '02:00',
  '03:00',
  '04:00',
  '05:00',
  '06:00',
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
  '23:00',
]

const generateAvailability = (): AvailabilityBlock[] => {
  const slots: AvailabilityBlock[] = []
  for (let day = 0; day <= 6; day += 1) {
    for (let i = 0; i < TIME_SLOTS.length - 1; i += 1) {
      const startTime = TIME_SLOTS[i]
      const endTime = TIME_SLOTS[i + 1]
      slots.push({
        id: `${day}-${startTime}`,
        dayOfWeek: day,
        startTime,
        endTime,
        isAvailable: true,
      })
    }
  }
  return slots
}

export type CalendarView = 'month' | 'week' | 'day' | 'availability'

// Draggable Event Component
function DraggableEvent({
  event,
  onClick,
  hasConflict,
  style = {},
  disabled = false,
}: {
  event: CalendarEvent
  onClick: () => void
  hasConflict?: boolean
  style?: CSSProperties
  disabled?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: event.id,
    data: { event },
    disabled,
  })

  const cssTransform = CSS.Transform.toString(transform)

  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : listeners)}
      {...(disabled ? {} : attributes)}
      style={{
        ...style,
        transform: disabled ? undefined : cssTransform,
        opacity: isDragging ? 0.5 : 1,
        cursor: disabled ? 'pointer' : 'grab',
      }}
      className={cn(
        'group absolute left-1 right-1 cursor-pointer overflow-hidden rounded p-2 text-xs',
        event.color || 'bg-blue-500',
        event.status === 'cancelled' && 'opacity-50',
        hasConflict && 'ring-2 ring-red-500'
      )}
      onClick={(e: any) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-white">
            {event.courseName
              ? `${event.courseName}${event.nationality && event.nationality !== 'Global' ? ` — ${event.variantCategory || ''} — ${event.nationality}` : ''} — `
              : ''}
            {event.title}
          </p>
          <p className="text-white/80">
            {event.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        {!disabled && (
          <GripVertical className="h-3 w-3 text-white/50 opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>
      {hasConflict && <AlertTriangle className="absolute right-1 top-1 h-3 w-3 text-white" />}
    </div>
  )
}

export function InteractiveCalendar({
  events: initialEvents,
  onEventClick,
  onDateClick,
  onCreateClass,
  onEventUpdate,
  loading,
  mode = 'tutor',
  initialView = 'month',
  dayClickMode = 'callback',
  availabilityOnly = false,
  embedded = false,
  timezone: timezoneProp,
  onTimezoneChange,
  view: controlledView,
  onViewChange,
}: InteractiveCalendarProps) {
  const isStudent = mode === 'student'
  const router = useRouter()
  const params = useParams()
  const locale = (params as any)?.locale as string | undefined
  const withLocalePath = useCallback(
    (path: string) => (locale ? `/${locale}${path}` : path),
    [locale]
  )
  const [events, setEvents] = useState<CalendarEvent[]>(
    initialEvents || (isStudent ? [] : generateDemoEvents())
  )
  const [availability, setAvailability] = useState<AvailabilityBlock[]>(
    isStudent ? [] : generateAvailability()
  )
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<CalendarView>(initialView)
  // Sync controlled view prop
  useEffect(() => {
    if (controlledView !== undefined) {
      setView(controlledView)
    }
  }, [controlledView])
  const handleSetView = useCallback(
    (v: CalendarView) => {
      setView(v)
      onViewChange?.(v)
    },
    [onViewChange]
  )
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [subjectFilter, setSubjectFilter] = useState<string>('all')
  const [typeFilter] = useState<string>('all')
  const [showConflictWarning, setShowConflictWarning] = useState<CalendarEvent[]>([])
  const [notifications, setNotifications] = useState<string[]>([])
  const [availabilityDate, setAvailabilityDate] = useState<Date | null>(null)
  const [internalTimezone, setInternalTimezone] = useState(DEFAULT_TIMEZONE)
  const timezone = timezoneProp ?? internalTimezone
  const _setTimezone = onTimezoneChange ?? setInternalTimezone
  const [availabilitySaving, setAvailabilitySaving] = useState(false)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)

  // New feature states
  const [showCalendarIntegrations, setShowCalendarIntegrations] = useState(false)
  const [activeDragEvent, setActiveDragEvent] = useState<CalendarEvent | null>(null)
  const [calendarConnections, setCalendarConnections] = useState<CalendarConnection[]>([
    { id: '1', provider: 'google', connected: false, syncEnabled: true },
    { id: '2', provider: 'outlook', connected: false, syncEnabled: true },
    { id: '3', provider: 'apple', connected: false, syncEnabled: false },
  ])
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const cardContentRef = useRef<HTMLDivElement>(null)

  // Auto-scroll: Day/Week snap to 2pm (hour 14) to maximize visible panel space
  useEffect(() => {
    if (!cardContentRef.current) return
    requestAnimationFrame(() => {
      if (!cardContentRef.current) return
      if (view === 'day' || view === 'week') {
        cardContentRef.current.scrollTop = 14 * 40
      } else if (view === 'month') {
        cardContentRef.current.scrollTop = 80
      }
    })
  }, [view, currentDate])

  // Conflict resolution state
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [conflictRecommendations, setConflictRecommendations] = useState<
    Map<string, Array<{ date: string; startTime: string; endTime: string }>>
  >(new Map())
  const [recommendationsLoading, setRecommendationsLoading] = useState<Set<string>>(new Set())
  const [rescheduling, setRescheduling] = useState<string | null>(null)

  useEffect(() => {
    if (mode === 'student' && initialEvents) {
      setEvents(initialEvents)
    }
  }, [initialEvents, mode])

  useEffect(() => {
    if (mode !== 'tutor') return
    const loadCategories = async () => {
      try {
        const res = await fetch('/api/tutor/public-profile', { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        const categories = Array.isArray(data?.profile?.categories) ? data.profile.categories : []
        setCategoryOptions(categories.filter((c: unknown) => typeof c === 'string'))
      } catch {
        // ignore
      } finally {
        setCategoriesLoaded(true)
      }
    }
    loadCategories()
  }, [mode])

  // Derive category options from student events
  useEffect(() => {
    if (mode !== 'student') return
    const subjects = Array.from(
      new Set(
        (initialEvents ?? []).map(e => e.subject).filter((s): s is string => typeof s === 'string')
      )
    )
    setCategoryOptions(subjects)
    setCategoriesLoaded(true)
  }, [mode, initialEvents])

  useEffect(() => {
    if (mode !== 'tutor') return
    const loadAvailability = async () => {
      setAvailabilityLoading(true)
      try {
        const res = await fetch('/api/tutor/calendar/availability', { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        const apiAvailability = Array.isArray(data?.availability) ? data.availability : []
        if (apiAvailability.length > 0) {
          const tz = apiAvailability[0].timezone || DEFAULT_TIMEZONE
          if (!timezoneProp) {
            setInternalTimezone(tz)
          }
        }
        const base = generateAvailability()
        const normalized = base.map(block => {
          const found = apiAvailability.some(
            (slot: {
              dayOfWeek: number
              startTime: string
              endTime: string
              isAvailable: boolean
            }) =>
              slot.dayOfWeek === block.dayOfWeek &&
              slot.startTime === block.startTime &&
              slot.endTime === block.endTime &&
              slot.isAvailable === false
          )
          // Default to true, unless explicitly marked as false in the DB
          return { ...block, isAvailable: !found }
        })
        setAvailability(normalized)
      } catch {
        // ignore
      } finally {
        setAvailabilityLoading(false)
      }
    }
    loadAvailability()
  }, [mode, timezoneProp])

  // Load calendar events for the visible month (tutor mode)
  useEffect(() => {
    if (mode !== 'tutor') return
    const loadEvents = async () => {
      try {
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth()
        const start = new Date(year, month, 1).toISOString()
        const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
        const res = await fetch(
          `/api/tutor/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
          { credentials: 'include' }
        )
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        const apiEvents = Array.isArray(data?.events) ? data.events : []
        setEvents(
          apiEvents.map((e: any) => ({
            id: e.id,
            title: e.title,
            date: new Date(e.scheduledAt),
            duration: e.duration || 60,
            type: 'class',
            status: e.status === 'live' ? 'live' : e.status === 'ended' ? 'completed' : 'scheduled',
            subject: e.subject,
            location: e.location,
            isOnline: e.isVirtual,
            description: e.meetingUrl,
            sessionId: e.sessionId,
            courseName: e.courseName,
            nationality: e.nationality,
            variantCategory: e.variantCategory,
            studentCount: e.enrolledCount ?? 0,
            color:
              e.status === 'live'
                ? 'bg-emerald-500'
                : e.status === 'ended'
                  ? 'bg-slate-400'
                  : 'bg-blue-500',
          }))
        )
      } catch {
        // silent fail
      }
    }
    loadEvents()
  }, [currentDate, mode])

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: (event: any) => {
        const { active } = event
        const node = active?.rect?.current?.translated
        return node ? { x: node.left, y: node.top } : { x: 0, y: 0 }
      },
    })
  )

  // Check for conflicts
  useEffect(() => {
    const conflicts: CalendarEvent[] = []
    events.forEach((event1, i) => {
      events.forEach((event2, j) => {
        if (i >= j) return
        if (event1.date.toDateString() === event2.date.toDateString()) {
          const start1 = event1.date.getTime()
          const end1 = start1 + event1.duration * 60000
          const start2 = event2.date.getTime()
          const end2 = start2 + event2.duration * 60000

          if (start1 < end2 && end1 > start2) {
            conflicts.push(event1, event2)
          }
        }
      })
    })

    const uniqueConflicts = Array.from(new Set(conflicts))
    if (uniqueConflicts.length > 0) {
      setShowConflictWarning(uniqueConflicts)
    }
  }, [events])

  // Upcoming notifications
  useEffect(() => {
    const upcoming = events.filter(e => {
      const timeDiff = e.date.getTime() - new Date().getTime()
      return timeDiff > 0 && timeDiff < 24 * 60 * 60 * 1000 && e.status === 'scheduled'
    })

    if (upcoming.length > 0) {
      setNotifications(upcoming.map(e => `${e.title} at ${e.date.toLocaleTimeString()}`))
    }
  }, [events])

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const matchesSubject = subjectFilter === 'all' || event.subject === subjectFilter
      const matchesType = typeFilter === 'all' || event.type === typeFilter
      return matchesSubject && matchesType
    })
  }, [events, subjectFilter, typeFilter])

  const headerLabel = useMemo(() => {
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]
    if (view === 'week') {
      const weekStart = startOfWeek(currentDate)
      const weekEnd = addDays(weekStart, 6)
      return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`
    }
    if (view === 'day') {
      return format(currentDate, 'MMMM d, yyyy')
    }
    return `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`
  }, [currentDate, view])

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()

    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days: (Date | null)[] = []

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i))
    }

    return days
  }, [currentDate])

  const getEventsForDate = (date: Date) => {
    return filteredEvents
      .filter(event => {
        const eventDate = new Date(event.date)
        return eventDate.toDateString() === date.toDateString()
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  const navigatePeriod = (direction: number) => {
    if (view === 'week') {
      setCurrentDate(addWeeks(currentDate, direction))
      return
    }
    if (view === 'day') {
      setCurrentDate(addDays(currentDate, direction))
      return
    }
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const handleDateClick = (date: Date) => {
    const today = startOfDay(new Date())
    const clicked = startOfDay(date)
    if (isBefore(clicked, today)) {
      toast.error('You can only schedule sessions for today or future dates.')
      return
    }
    setSelectedDate(date)
    if (dayClickMode === 'availability' && !isStudent) {
      setAvailabilityDate(date)
      return
    }
    if (dayClickMode === 'create' && onCreateClass) {
      onCreateClass(date)
      return
    }
    if (onDateClick) {
      onDateClick(date)
      return
    }
  }

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event)
    onEventClick?.(event)
  }

  const isToday = (date: Date) => {
    return date.toDateString() === new Date().toDateString()
  }

  const availabilitySlotsForDay = useMemo(() => {
    if (!availabilityDate) return []
    const dayIndex = availabilityDate.getDay()
    return availability
      .filter(block => block.dayOfWeek === dayIndex)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  }, [availability, availabilityDate])

  const toggleAvailability = async (id: string) => {
    if (availabilitySaving || mode !== 'tutor') return
    const target = availability.find(block => block.id === id)
    if (!target) return

    const nextValue = !target.isAvailable
    setAvailability(prev =>
      prev.map(block => (block.id === id ? { ...block, isAvailable: nextValue } : block))
    )
    setAvailabilitySaving(true)

    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch('/api/tutor/calendar/availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          dayOfWeek: target.dayOfWeek,
          startTime: target.startTime,
          endTime: target.endTime,
          timezone,
          isAvailable: nextValue,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to update availability')
      }
    } catch (error) {
      setAvailability(prev =>
        prev.map(block => (block.id === id ? { ...block, isAvailable: target.isAvailable } : block))
      )
      toast.error(error instanceof Error ? error.message : 'Failed to update availability')
    } finally {
      setAvailabilitySaving(false)
    }
  }

  // DnD Handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event
      const draggedEvent = events.find(e => e.id === active.id)
      if (draggedEvent) {
        setActiveDragEvent(draggedEvent)
      }
    },
    [events]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event

      if (over && active.id !== over.id) {
        const draggedEvent = events.find(e => e.id === active.id)
        const dropData = over.data.current as { date?: Date; hour?: number } | undefined

        if (draggedEvent && dropData?.date) {
          const newDate = new Date(dropData.date)
          if (dropData.hour !== undefined) {
            newDate.setHours(dropData.hour, draggedEvent.date.getMinutes(), 0, 0)
          } else {
            newDate.setHours(draggedEvent.date.getHours(), draggedEvent.date.getMinutes(), 0, 0)
          }

          const updatedEvent = { ...draggedEvent, date: newDate }

          setEvents(prev => prev.map(e => (e.id === draggedEvent.id ? updatedEvent : e)))
          onEventUpdate?.(updatedEvent)
          toast.success(`Rescheduled: ${draggedEvent.title} to ${format(newDate, 'MMM d, h:mm a')}`)
        }
      }

      setActiveDragEvent(null)
    },
    [events, onEventUpdate]
  )

  // Calendar Integration Handlers
  const connectCalendar = (provider: 'google' | 'outlook' | 'apple') => {
    // In real implementation, this would open OAuth flow
    toast.loading(`Connecting to ${provider} calendar...`)

    // Simulate connection
    setTimeout(() => {
      setCalendarConnections(prev =>
        prev.map(conn =>
          conn.provider === provider
            ? { ...conn, connected: true, email: `tutor@${provider}.com`, lastSynced: new Date() }
            : conn
        )
      )
      toast.success(`Connected to ${provider} calendar!`)
    }, 1500)
  }

  const disconnectCalendar = (provider: string) => {
    setCalendarConnections(prev =>
      prev.map(conn =>
        conn.provider === provider
          ? { ...conn, connected: false, email: undefined, lastSynced: undefined }
          : conn
      )
    )
    toast.success(`Disconnected from ${provider}`)
  }

  const syncCalendars = () => {
    toast.loading('Syncing calendars...')
    setTimeout(() => {
      setCalendarConnections(prev =>
        prev.map(conn => (conn.connected ? { ...conn, lastSynced: new Date() } : conn))
      )
      toast.success('Calendars synced!')
    }, 2000)
  }

  if (loading) {
    return (
      <Card
        padding="none"
        className={cn(
          'h-[600px]',
          embedded
            ? 'border-0 bg-transparent shadow-none'
            : 'border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md'
        )}
      >
        <CardContent
          spacing={embedded ? 'none' : 'default'}
          className="flex h-full items-center justify-center"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </CardContent>
      </Card>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Card
        padding="none"
        className={cn(
          'flex flex-col',
          embedded
            ? 'min-h-0 flex-1 border-0 bg-transparent shadow-none'
            : 'h-[600px] border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md'
        )}
      >
        <CardHeader className={cn('shrink-0', embedded ? (mode === 'tutor' ? 'px-4 pb-4 pt-2' : 'px-4 pb-2 pt-4') : 'pb-3')}>
          {availabilityOnly ? (
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">My Availability</h2>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-sm border border-[#374151] hover:bg-[#374151] hover:text-white"
                      onClick={() => navigatePeriod(-1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h2 className="min-w-[140px] text-center text-base font-semibold">
                      {headerLabel}
                    </h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-sm border border-[#374151] hover:bg-[#374151] hover:text-white"
                      onClick={() => navigatePeriod(1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 rounded-sm border border-[#374151] text-xs hover:bg-[#374151] hover:text-white"
                    onClick={goToToday}
                  >
                    Today
                  </Button>
                  {!isStudent && (
                    <>
                      {/* Calendar Integrations */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 rounded-sm border border-[#374151] text-xs hover:bg-[#374151] hover:text-white"
                        onClick={() => setShowCalendarIntegrations(true)}
                      >
                        <RefreshCw
                          className={cn(
                            'mr-2 h-4 w-4',
                            calendarConnections.some(c => c.connected) && 'text-green-500'
                          )}
                        />
                        Sync
                      </Button>
                    </>
                  )}
                  {/* Filters */}
                  <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                    <SelectTrigger className="h-9 w-40 rounded-lg border border-slate-300 bg-slate-50 text-xs text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-400 hover:bg-slate-100 hover:shadow-md focus-visible:shadow-none">
                      <Filter className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                      <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-lg border border-slate-200 !bg-white !bg-none p-1.5 !text-slate-700 shadow-lg">
                      <SelectItem
                        value="all"
                        className="!hover:bg-slate-100 !focus:bg-slate-100 rounded-md text-xs !text-slate-700"
                      >
                        All Categories
                      </SelectItem>
                      {!categoriesLoaded && (
                        <SelectItem
                          value="__loading__"
                          disabled
                          className="rounded-md text-xs !text-slate-700"
                        >
                          Loading…
                        </SelectItem>
                      )}
                      {categoryOptions.map(name => (
                        <SelectItem
                          key={name}
                          value={name}
                          className="!hover:bg-slate-100 !focus:bg-slate-100 rounded-md text-xs !text-slate-700"
                        >
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {notifications.length > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      <Bell className="mr-1 h-3 w-3" />
                      {notifications.length}
                    </Badge>
                  )}
                </div>

                {!controlledView && (
                  <div className="flex items-center gap-2">
                    {/* View Toggle - Reordered as Day, Week, Month */}
                    <div className="grid h-9 min-w-[180px] grid-cols-3 rounded-xl bg-[#2D2B4E] p-1">
                      {(view === 'availability'
                        ? (['day', 'week', 'month'] as CalendarView[])
                        : (['day', 'week', 'month'] as CalendarView[])
                      ).map(v => (
                        <button
                          key={v}
                          onClick={() => handleSetView(v)}
                          className={cn(
                            'flex items-center justify-center rounded-lg text-sm font-medium capitalize transition-colors',
                            view === v
                              ? 'bg-white text-black shadow-sm'
                              : 'text-white/70 hover:text-white'
                          )}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Conflict Warning Banner */}
              {showConflictWarning.length > 0 && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800">
                      {showConflictWarning.length / 2} scheduling conflicts detected
                    </p>
                    <p className="text-xs text-red-600">
                      Some classes overlap in time. Drag events to reschedule or click
                      &quot;View&quot; to see conflicts.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowConflictDialog(true)}>
                    <Wand2 className="mr-1 h-3 w-3" />
                    Resolve
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowConflictWarning([])}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardHeader>

        <CardContent
          spacing={embedded ? 'none' : 'default'}
          className={cn('flex flex-1 flex-col overflow-hidden pt-0', embedded && 'px-4 pb-4')}
        >
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col',
              mode === 'tutor' && embedded ? 'pt-5' : 'pt-3',
              !availabilityOnly && 'overflow-hidden rounded-lg border border-[#374151]'
            )}
          >
            <div
              ref={cardContentRef}
              className="scrollbar-hide flex min-h-0 flex-1 flex-col overflow-auto"
            >
              {availabilityOnly ? (
                <AvailabilityView
                  availability={availability}
                  onToggle={toggleAvailability}
                  onSave={() => toast.success('Availability updated!')}
                />
              ) : (
                <>
                  {view === 'month' && (
                    <MonthView
                      days={calendarDays}
                      events={filteredEvents}
                      onDateClick={handleDateClick}
                      onEventClick={handleEventClick}
                      isToday={isToday}
                      getEventsForDate={getEventsForDate}
                      conflicts={showConflictWarning}
                    />
                  )}

                  {view === 'week' && (
                    <WeekView
                      currentDate={currentDate}
                      events={filteredEvents}
                      onEventClick={handleEventClick}
                      conflicts={showConflictWarning}
                      readOnly={isStudent}
                    />
                  )}

                  {view === 'day' && (
                    <DayView
                      currentDate={currentDate}
                      events={filteredEvents}
                      onEventClick={handleEventClick}
                      conflicts={showConflictWarning}
                      readOnly={isStudent}
                    />
                  )}

                  {!isStudent && view === 'availability' && (
                    <AvailabilityView
                      availability={availability}
                      onToggle={toggleAvailability}
                      onSave={() => {
                        toast.success('Availability updated!')
                        setView('month')
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>

        <Dialog
          open={!!availabilityDate}
          onOpenChange={open => {
            if (!open) setAvailabilityDate(null)
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Schedule availability</DialogTitle>
              <DialogDescription>
                {availabilityDate
                  ? availabilityDate.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      timeZone: timezone,
                    })
                  : 'Select a date'}
                <span className="text-muted-foreground ml-2 text-xs">Timezone: {timezone}</span>
              </DialogDescription>
            </DialogHeader>
            {availabilityLoading ? (
              <div className="bg-muted/30 text-muted-foreground rounded-lg border p-4 text-sm">
                Loading availability...
              </div>
            ) : availabilitySlotsForDay.length === 0 ? (
              <div className="bg-muted/30 text-muted-foreground rounded-lg border p-4 text-sm">
                No time slots configured.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {availabilitySlotsForDay.map(slot => (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => toggleAvailability(slot.id)}
                    className={cn(
                      'rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                      slot.isAvailable
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-emerald-300'
                    )}
                  >
                    {slot.startTime}
                  </button>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="modal-secondary-dark" onClick={() => setAvailabilityDate(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Event Detail Dialog */}
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border border-slate-200 shadow-2xl">
            {selectedEvent && (
              <>
                <DialogHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <DialogTitle className="text-xl">
                        {selectedEvent.courseName
                          ? `${selectedEvent.courseName}${selectedEvent.nationality && selectedEvent.nationality !== 'Global' ? ` — ${selectedEvent.variantCategory || ''} — ${selectedEvent.nationality}` : ''}`
                          : selectedEvent.title}
                      </DialogTitle>
                      <DialogDescription className="mt-1">
                        {selectedEvent.courseName ? `${selectedEvent.title} • ` : ''}
                        {selectedEvent.subject} • {selectedEvent.duration} minutes
                      </DialogDescription>
                    </div>
                    <div className="flex gap-2">
                      <Badge
                        className={cn(
                          selectedEvent.status === 'live'
                            ? 'bg-emerald-500'
                            : selectedEvent.status === 'completed'
                              ? 'bg-slate-400'
                              : selectedEvent.color || 'bg-blue-500'
                        )}
                      >
                        {selectedEvent.status === 'live'
                          ? 'Live'
                          : selectedEvent.status === 'completed'
                            ? 'Ended'
                            : 'Scheduled'}
                      </Badge>
                      {selectedEvent.isRecurring && (
                        <Badge variant="outline" className="gap-1">
                          <Repeat className="h-3 w-3" />
                          {selectedEvent.recurringPattern}
                        </Badge>
                      )}
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                    <Clock className="h-5 w-5 text-gray-500" />
                    <div>
                      <p className="font-medium">
                        {selectedEvent.date.toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                      <p className="text-sm text-gray-500">
                        {selectedEvent.date.toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        -
                        {new Date(
                          selectedEvent.date.getTime() + selectedEvent.duration * 60000
                        ).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  {selectedEvent.type === 'class' && (
                    <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                      <Users className="h-5 w-5 text-gray-500" />
                      <div>
                        <p className="font-medium">
                          {selectedEvent.studentCount ?? 0} / {selectedEvent.maxStudents ?? 50}{' '}
                          students
                        </p>
                        <p className="text-sm text-gray-500">
                          {Math.max(
                            0,
                            (selectedEvent.maxStudents ?? 50) - (selectedEvent.studentCount ?? 0)
                          )}{' '}
                          spots remaining
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Course Info */}
                  {selectedEvent.courseName && (
                    <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                      <BookOpen className="h-5 w-5 text-gray-500" />
                      <div>
                        <p className="font-medium">
                          {selectedEvent.courseName}
                          {selectedEvent.nationality && selectedEvent.nationality !== 'Global'
                            ? ` — ${selectedEvent.variantCategory || ''} — ${selectedEvent.nationality}`
                            : ''}
                        </p>
                        <p className="text-sm text-gray-500">Course</p>
                      </div>
                    </div>
                  )}

                  {/* Conflict Warning in Detail */}
                  {showConflictWarning.find(e => e.id === selectedEvent.id) && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-red-700">
                      <AlertTriangle className="h-5 w-5" />
                      <span>This class has a scheduling conflict!</span>
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-3">
                  <Button variant="modal-secondary-dark" onClick={() => setSelectedEvent(null)}>
                    Close
                  </Button>
                  <Button
                    variant="modal-primary-dark"
                    disabled={selectedEvent.status === 'cancelled'}
                    onClick={() => {
                      if (!selectedEvent.sessionId) {
                        toast.error('This event is not linked to a TutorMekimi session.')
                        setSelectedEvent(null)
                        return
                      }
                      router.push(
                        withLocalePath(
                          isStudent
                            ? `/student/feedback?sessionId=${selectedEvent.sessionId}`
                            : `/tutor/classroom?sessionId=${selectedEvent.sessionId}`
                        )
                      )
                      setSelectedEvent(null)
                    }}
                  >
                    <Video className="mr-2 h-4 w-4" />
                    {selectedEvent.status === 'cancelled'
                      ? 'Cancelled'
                      : selectedEvent.status === 'completed'
                        ? isStudent
                          ? 'View Feedback'
                          : 'View Session'
                        : selectedEvent.status === 'live'
                          ? 'Join Session'
                          : isStudent
                            ? 'View Session'
                            : 'Start Session'}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Date Selection Dialog */}
        <Dialog open={!!selectedDate && !selectedEvent} onOpenChange={() => setSelectedDate(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {selectedDate?.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </DialogTitle>
              <DialogDescription>
                {getEventsForDate(selectedDate || new Date()).length} events scheduled
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4">
              {getEventsForDate(selectedDate || new Date()).map((event: any) => (
                <div
                  key={event.id}
                  className="cursor-pointer rounded-lg border p-3 hover:bg-gray-50"
                  onClick={() => {
                    setSelectedDate(null)
                    handleEventClick(event)
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('h-3 w-3 rounded-full', event.color || 'bg-blue-500')} />
                    <div className="flex-1">
                      <p className="font-medium">
                        {event.courseName
                          ? `${event.courseName}${event.nationality && event.nationality !== 'Global' ? ` — ${event.variantCategory || ''} — ${event.nationality}` : ''} — `
                          : ''}
                        {event.title}
                      </p>
                      <p className="text-sm text-gray-500">
                        {event.date.toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    {showConflictWarning.find(e => e.id === event.id) && (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              ))}

              {getEventsForDate(selectedDate || new Date()).length === 0 && (
                <p className="py-4 text-center text-gray-500">No events scheduled for this day</p>
              )}
            </div>

            <DialogFooter>
              <Button variant="modal-secondary-dark" onClick={() => setSelectedDate(null)}>
                Close
              </Button>
              {!isStudent && (
                <Button
                  variant="modal-primary-dark"
                  onClick={() => {
                    onCreateClass?.(selectedDate || new Date())
                    setSelectedDate(null)
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Schedule Session
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {!isStudent && (
          <>
            {/* Calendar Integrations Modal */}
            <Dialog open={showCalendarIntegrations} onOpenChange={setShowCalendarIntegrations}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5" />
                    Calendar Integrations
                  </DialogTitle>
                  <DialogDescription>Sync your schedule with external calendars</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  {calendarConnections.map(connection => (
                    <div
                      key={connection.id}
                      className={cn(
                        'rounded-lg border p-4 transition-colors',
                        connection.connected ? 'border-green-200 bg-green-50/50' : 'border-gray-200'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'flex h-10 w-10 items-center justify-center rounded-lg',
                              connection.provider === 'google' && 'bg-blue-100 text-blue-600',
                              connection.provider === 'outlook' && 'bg-blue-600 text-white',
                              connection.provider === 'apple' && 'bg-gray-900 text-white'
                            )}
                          >
                            {connection.provider === 'google' && (
                              <CalendarIcon className="h-5 w-5" />
                            )}
                            {connection.provider === 'outlook' && (
                              <ExternalLink className="h-5 w-5" />
                            )}
                            {connection.provider === 'apple' && (
                              <CalendarIcon className="h-5 w-5" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium capitalize">{connection.provider} Calendar</p>
                            {connection.connected ? (
                              <p className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle2 className="h-3 w-3" />
                                Connected{connection.email && ` • ${connection.email}`}
                              </p>
                            ) : (
                              <p className="text-xs text-gray-500">Not connected</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {connection.connected ? (
                            <>
                              <Switch
                                checked={connection.syncEnabled}
                                onCheckedChange={checked => {
                                  setCalendarConnections(prev =>
                                    prev.map(c =>
                                      c.id === connection.id ? { ...c, syncEnabled: checked } : c
                                    )
                                  )
                                }}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => disconnectCalendar(connection.provider)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" onClick={() => connectCalendar(connection.provider)}>
                              Connect
                            </Button>
                          )}
                        </div>
                      </div>

                      {connection.connected && connection.lastSynced && (
                        <p className="mt-2 text-xs text-gray-500">
                          Last synced: {format(connection.lastSynced, 'MMM d, h:mm a')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <DialogFooter className="gap-2">
                  <Button
                    variant="modal-secondary-dark"
                    onClick={() => setShowCalendarIntegrations(false)}
                  >
                    Close
                  </Button>
                  <Button variant="modal-primary-dark" onClick={syncCalendars} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Sync All
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Conflict Resolution Dialog */}
            <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
              <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-700">
                    <AlertTriangle className="h-5 w-5" />
                    Resolve Scheduling Conflicts
                  </DialogTitle>
                  <DialogDescription>
                    {Math.round(showConflictWarning.length / 2)} overlapping session
                    {Math.round(showConflictWarning.length / 2) !== 1 ? 's' : ''} detected. Click
                    &quot;Find alternatives&quot; to see recommended new times based on your
                    availability.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  {(() => {
                    // Reconstruct conflict pairs
                    const pairs: Array<[CalendarEvent, CalendarEvent]> = []
                    const seen = new Set<string>()
                    events.forEach((event1, i) => {
                      events.forEach((event2, j) => {
                        if (i >= j) return
                        if (event1.date.toDateString() === event2.date.toDateString()) {
                          const start1 = event1.date.getTime()
                          const end1 = start1 + event1.duration * 60000
                          const start2 = event2.date.getTime()
                          const end2 = start2 + event2.duration * 60000
                          if (start1 < end2 && end1 > start2) {
                            const key = [event1.id, event2.id].sort().join('-')
                            if (!seen.has(key)) {
                              seen.add(key)
                              pairs.push([event1, event2])
                            }
                          }
                        }
                      })
                    })

                    return pairs.map(([ev1, ev2], idx) => (
                      <div key={idx} className="rounded-lg border border-red-200 bg-red-50/50 p-4">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-red-600">
                          Conflict #{idx + 1}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {[ev1, ev2].map(ev => {
                            const recs = conflictRecommendations.get(ev.id) || []
                            const loading = recommendationsLoading.has(ev.id)
                            return (
                              <div key={ev.id} className="rounded-md border bg-white p-3">
                                <p className="text-sm font-medium">{ev.title}</p>
                                <p className="text-xs text-gray-500">
                                  {ev.date.toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                  })}{' '}
                                  •{' '}
                                  {ev.date.toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}{' '}
                                  ({ev.duration} min)
                                </p>

                                {recs.length === 0 && !loading && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="mt-2 w-full text-xs"
                                    onClick={async () => {
                                      setRecommendationsLoading(prev => new Set(prev).add(ev.id))
                                      try {
                                        const qp = ev.sessionId
                                          ? `sessionId=${encodeURIComponent(ev.sessionId)}`
                                          : `eventId=${encodeURIComponent(ev.id)}`
                                        const res = await fetch(
                                          `/api/tutor/calendar/recommendations?${qp}`,
                                          { credentials: 'include' }
                                        )
                                        const data = await res.json().catch(() => ({}))
                                        if (!res.ok) {
                                          toast.error(
                                            data.error || 'Failed to load recommendations'
                                          )
                                          return
                                        }
                                        setConflictRecommendations(prev => {
                                          const next = new Map(prev)
                                          next.set(ev.id, data.recommendations || [])
                                          return next
                                        })
                                      } catch {
                                        toast.error('Failed to load recommendations')
                                      } finally {
                                        setRecommendationsLoading(prev => {
                                          const next = new Set(prev)
                                          next.delete(ev.id)
                                          return next
                                        })
                                      }
                                    }}
                                  >
                                    <Wand2 className="mr-1 h-3 w-3" />
                                    Find alternatives
                                  </Button>
                                )}

                                {loading && (
                                  <div className="mt-2 flex items-center justify-center py-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                                  </div>
                                )}

                                {recs.length === 0 &&
                                  !loading &&
                                  conflictRecommendations.has(ev.id) && (
                                    <p className="mt-2 text-xs text-gray-500">
                                      No available slots found. Try dragging the event to reschedule
                                      manually, or update your availability settings.
                                    </p>
                                  )}

                                {recs.length > 0 && (
                                  <div className="mt-2 space-y-1.5">
                                    <p className="text-xs font-medium text-gray-600">
                                      Suggested times:
                                    </p>
                                    {recs.map((rec, rIdx) => {
                                      const recDate = new Date(`${rec.date}T${rec.startTime}`)
                                      return (
                                        <Button
                                          key={rIdx}
                                          variant="ghost"
                                          size="sm"
                                          className="h-auto w-full justify-start px-2 py-1.5 text-xs hover:bg-green-50"
                                          disabled={rescheduling === ev.id}
                                          onClick={async () => {
                                            setRescheduling(ev.id)
                                            try {
                                              const res = await fetch(
                                                `/api/tutor/calendar/events/${ev.id}/reschedule`,
                                                {
                                                  method: 'PATCH',
                                                  headers: { 'Content-Type': 'application/json' },
                                                  credentials: 'include',
                                                  body: JSON.stringify({
                                                    newStartTime: `${rec.date}T${rec.startTime}:00`,
                                                  }),
                                                }
                                              )
                                              if (!res.ok) {
                                                const err = await res.json().catch(() => ({}))
                                                throw new Error(err.error || 'Reschedule failed')
                                              }
                                              toast.success(`${ev.title} rescheduled successfully`)
                                              // Refresh events
                                              const refreshed = await fetch(
                                                `/api/tutor/calendar/events?start=${encodeURIComponent(
                                                  new Date(
                                                    currentDate.getFullYear(),
                                                    currentDate.getMonth(),
                                                    1
                                                  ).toISOString()
                                                )}&end=${encodeURIComponent(
                                                  new Date(
                                                    currentDate.getFullYear(),
                                                    currentDate.getMonth() + 1,
                                                    0,
                                                    23,
                                                    59,
                                                    59
                                                  ).toISOString()
                                                )}`,
                                                { credentials: 'include' }
                                              )
                                              const data = await refreshed.json().catch(() => ({}))
                                              const apiEvents = Array.isArray(data?.events)
                                                ? data.events
                                                : []
                                              setEvents(
                                                apiEvents.map((e: any) => ({
                                                  id: e.id,
                                                  title: e.title,
                                                  date: new Date(e.scheduledAt),
                                                  duration: e.duration || 60,
                                                  type: 'class',
                                                  status:
                                                    e.status === 'live'
                                                      ? 'live'
                                                      : e.status === 'ended'
                                                        ? 'completed'
                                                        : 'scheduled',
                                                  subject: e.subject,
                                                  location: e.location,
                                                  isOnline: e.isVirtual,
                                                  description: e.meetingUrl,
                                                  sessionId: e.sessionId,
                                                  color:
                                                    e.status === 'live'
                                                      ? 'bg-emerald-500'
                                                      : e.status === 'ended'
                                                        ? 'bg-slate-400'
                                                        : 'bg-blue-500',
                                                }))
                                              )
                                              setShowConflictWarning([])
                                              setConflictRecommendations(new Map())
                                              setShowConflictDialog(false)
                                            } catch (err: any) {
                                              toast.error(err.message || 'Failed to reschedule')
                                            } finally {
                                              setRescheduling(null)
                                            }
                                          }}
                                        >
                                          {rescheduling === ev.id ? (
                                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                          ) : (
                                            <CheckCircle2 className="mr-1 h-3 w-3 text-green-600" />
                                          )}
                                          {recDate.toLocaleDateString('en-US', {
                                            weekday: 'short',
                                            month: 'short',
                                            day: 'numeric',
                                          })}{' '}
                                          {rec.startTime} – {rec.endTime}
                                        </Button>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  })()}
                </div>

                <DialogFooter>
                  <Button
                    variant="modal-secondary-dark"
                    onClick={() => setShowConflictDialog(false)}
                  >
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}

        {/* Drag Overlay */}
        <DragOverlay>
          {activeDragEvent ? (
            <div
              className={cn(
                'rounded p-2 text-xs opacity-90 shadow-lg',
                activeDragEvent.color || 'bg-blue-500'
              )}
            >
              <p className="font-medium text-white">{activeDragEvent.title}</p>
            </div>
          ) : null}
        </DragOverlay>
      </Card>
    </DndContext>
  )
}

// Sub-components

function DroppableDay({
  date,
  children,
  className,
}: {
  date: Date
  children: ReactNode
  className?: string
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${format(date, 'yyyy-MM-dd')}`,
    data: { date },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && 'bg-blue-50 ring-2 ring-inset ring-blue-400')}
    >
      {children}
    </div>
  )
}

function DroppableHour({
  date,
  hour,
  children,
  className,
}: {
  date: Date
  hour: number
  children?: ReactNode
  className?: string
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `hour-${format(date, 'yyyy-MM-dd')}-${hour}`,
    data: { date, hour },
  })

  return (
    <div ref={setNodeRef} className={cn(className, isOver && 'bg-blue-50/50')}>
      {children}
    </div>
  )
}

function MonthView({
  days,
  events: _events,
  onDateClick,
  onEventClick,
  isToday,
  getEventsForDate,
  conflicts,
}: any) {
  return (
    <div className="min-h-full overflow-hidden rounded-lg">
      <div className="grid grid-cols-7 border-b border-gray-100 bg-white/50">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="p-1.5 text-center text-xs font-medium text-gray-600">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((date: Date | null, index: number) => (
          <DroppableDay
            key={index}
            date={date || new Date()}
            className={cn(
              'min-h-[60px] border-b border-r p-1 last:border-r-0',
              !date && 'bg-gray-50/50',
              date && 'cursor-pointer hover:bg-gray-50'
            )}
          >
            {date && (
              <div onClick={() => onDateClick(date)}>
                <div
                  className={cn(
                    'mb-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium',
                    isToday(date) && 'bg-blue-600 text-white'
                  )}
                >
                  {date.getDate()}
                </div>
                <div className="space-y-0.5">
                  {getEventsForDate(date)
                    .slice(0, 2)
                    .map((event: CalendarEvent) => {
                      const hasConflict = !!conflicts.find((e: CalendarEvent) => e.id === event.id)
                      return (
                        <div
                          key={event.id}
                          className={cn(
                            'cursor-pointer truncate rounded px-1 py-0.5 text-[10px] leading-tight',
                            event.color || 'bg-blue-100',
                            event.status === 'cancelled' && 'line-through opacity-50',
                            hasConflict && 'ring-1 ring-red-400'
                          )}
                          onClick={(e: any) => {
                            e.stopPropagation()
                            onEventClick(event)
                          }}
                        >
                          <span className="truncate font-medium">
                            {event.date.getHours() > 12
                              ? event.date.getHours() - 12
                              : event.date.getHours()}
                            :{event.date.getMinutes().toString().padStart(2, '0')} {event.title}
                          </span>
                        </div>
                      )
                    })}
                  {getEventsForDate(date).length > 2 && (
                    <p className="pl-0.5 text-[10px] text-gray-500">
                      +{getEventsForDate(date).length - 2} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </DroppableDay>
        ))}
      </div>
    </div>
  )
}

function WeekView({
  currentDate,
  events: _events,
  onEventClick,
  conflicts,
  readOnly = false,
}: any) {
  const weekStart = new Date(currentDate)
  weekStart.setDate(currentDate.getDate() - currentDate.getDay())

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart)
    day.setDate(weekStart.getDate() + i)
    return day
  })

  const hours = Array.from({ length: 24 }, (_, i) => i)

  const formatHour = (hour: number) => {
    if (hour === 0) return '12 AM'
    if (hour < 12) return `${hour} AM`
    if (hour === 12) return '12 PM'
    return `${hour - 12} PM`
  }

  return (
    <div className="flex min-h-full flex-col rounded-lg bg-white/50">
      {/* Sticky days-of-week header */}
      <div className="sticky top-0 z-20 grid grid-cols-7 border-b border-gray-100 bg-white/50">
        {weekDays.map((day, index) => {
          const isToday = day.toDateString() === new Date().toDateString()
          return (
            <div key={index} className="p-1.5 text-center text-xs font-medium text-gray-600">
              <p>{day.toLocaleDateString('en-US', { weekday: 'short' })}</p>
              <p className={cn('text-sm', isToday && 'text-blue-600')}>
                {day.getDate()}
              </p>
            </div>
          )
        })}
      </div>

      {/* Scrollable body */}
      <div className="relative flex flex-1 flex-row">
        {/* Sticky time column */}
        <div className="sticky left-0 z-10 flex w-14 flex-col bg-gray-50">
          {hours.map(hour => (
            <div key={hour} className="h-10 shrink-0 border-b px-1 py-1 text-center text-xs text-gray-500">
              {formatHour(hour)}
            </div>
          ))}
          <div className="flex-1 bg-gray-50" />
        </div>
        <div className="absolute bottom-0 left-14 top-0 z-10 w-px bg-gray-300" />

        <div className="grid flex-1 grid-cols-7">
          {weekDays.map((day, index) => (
            <div key={index} className="relative flex flex-col border-r last:border-r-0">
              {hours.map(hour => (
                <DroppableHour
                  key={hour}
                  date={day}
                  hour={hour}
                  className="h-10 shrink-0 border-b"
                />
              ))}
              <div className="flex-1" />

              {_events
                .filter((event: CalendarEvent) => event.date.toDateString() === day.toDateString())
                .map((event: CalendarEvent) => {
                  const hour = event.date.getHours()
                  const minute = event.date.getMinutes()
                  const top = hour * 40 + (minute / 60) * 40
                  const height = (event.duration / 60) * 40
                  const hasConflict = !!conflicts.find((e: CalendarEvent) => e.id === event.id)

                  return (
                    <DraggableEvent
                      key={event.id}
                      event={event}
                      onClick={() => onEventClick(event)}
                      hasConflict={hasConflict}
                      disabled={readOnly}
                      style={{
                        top: `${top}px`,
                        height: `${Math.max(height, 24)}px`,
                        position: 'absolute',
                      }}
                    />
                  )
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DayView({ currentDate, events: _events, onEventClick, conflicts, readOnly = false }: any) {
  const hours = Array.from({ length: 24 }, (_, i) => i)

  const formatHour = (hour: number) => {
    if (hour === 0) return '12 AM'
    if (hour < 12) return `${hour} AM`
    if (hour === 12) return '12 PM'
    return `${hour - 12} PM`
  }

  const dayEvents = _events
    .filter((event: CalendarEvent) => event.date.toDateString() === currentDate.toDateString())
    .sort((a: CalendarEvent, b: CalendarEvent) => a.date.getTime() - b.date.getTime())

  return (
    <div className="relative flex min-h-full flex-row rounded-lg bg-white/50">
      <div className="flex w-14 flex-col bg-gray-50">
        {hours.map(hour => (
          <div
            key={hour}
            className="h-10 shrink-0 border-b px-1 py-1 text-right text-xs text-gray-600"
          >
            {formatHour(hour)}
          </div>
        ))}
        <div className="flex-1 bg-gray-50" />
      </div>
      <div className="absolute bottom-0 left-14 top-0 z-10 w-px bg-gray-300" />

      <div className="relative flex flex-1 flex-col">
        {hours.map(hour => (
          <DroppableHour
            key={hour}
            date={currentDate}
            hour={hour}
            className="h-10 shrink-0 border-b"
          />
        ))}
        <div className="flex-1" />

        {dayEvents.map((event: CalendarEvent) => {
          const hour = event.date.getHours()
          const minute = event.date.getMinutes()
          const top = hour * 40 + (minute / 60) * 40
          const height = (event.duration / 60) * 40
          const hasConflict = !!conflicts.find((e: CalendarEvent) => e.id === event.id)

          return (
            <DraggableEvent
              key={event.id}
              event={event}
              onClick={() => onEventClick(event)}
              hasConflict={hasConflict}
              disabled={readOnly}
              style={{
                top: `${top}px`,
                height: `${Math.max(height, 24)}px`,
                position: 'absolute',
                left: '4px',
                right: '4px',
              }}
            />
          )
        })}

        {isSameDay(currentDate, new Date()) && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-20 border-t-2 border-red-500"
            style={{ top: `${(new Date().getHours() + new Date().getMinutes() / 60) * 40}px` }}
          >
            <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
          </div>
        )}

        {dayEvents.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            <p className="text-sm">No events scheduled for this day</p>
          </div>
        )}
      </div>
    </div>
  )
}

function AvailabilityView({ availability, onToggle, onSave }: any) {
  const days = [
    { label: 'Mon', full: 'Monday', index: 1 },
    { label: 'Tue', full: 'Tuesday', index: 2 },
    { label: 'Wed', full: 'Wednesday', index: 3 },
    { label: 'Thu', full: 'Thursday', index: 4 },
    { label: 'Fri', full: 'Friday', index: 5 },
    { label: 'Sat', full: 'Saturday', index: 6 },
    { label: 'Sun', full: 'Sunday', index: 0 },
  ]
  const [activeDay, setActiveDay] = useState(days[0].full)

  const activeDayIndex = days.find(d => d.full === activeDay)?.index ?? 1
  const dayBlocks = availability.filter(
    (block: AvailabilityBlock) => block.dayOfWeek === activeDayIndex
  )
  const selectedCount = dayBlocks.filter((b: AvailabilityBlock) => b.isAvailable).length

  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeDay} onValueChange={setActiveDay} className="flex h-full flex-col">
        <TabsList className="grid w-full grid-cols-7">
          {days.map(day => (
            <TabsTrigger key={day.full} value={day.full} className="text-xs sm:text-sm">
              {day.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {days.map(day => (
          <TabsContent key={day.full} value={day.full} className="mt-2 flex-1">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">{day.full}</h3>
              <span className="text-muted-foreground text-xs">
                {selectedCount} of {dayBlocks.length} slots available
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {dayBlocks.map((block: AvailabilityBlock) => (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => onToggle(block.id)}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-2 py-2 text-xs transition-all',
                    block.isAvailable
                      ? 'border-green-300 bg-green-50 text-green-800 hover:bg-green-100'
                      : 'border-gray-200 bg-gray-50 text-gray-500 opacity-60 hover:opacity-100'
                  )}
                >
                  <span className="font-medium">{block.startTime}</span>
                  {block.isAvailable ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-gray-300" />
                  )}
                </button>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <div className="mt-4 flex justify-end gap-3 border-t pt-4">
        <Button variant="modal-primary" onClick={onSave}>
          Save Availability
        </Button>
      </div>
    </div>
  )
}
