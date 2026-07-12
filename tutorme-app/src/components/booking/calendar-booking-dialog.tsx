'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format, parseISO, isBefore } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogPanel,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  DollarSign,
  Video,
  Loader2,
  Check,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Link from 'next/link'

// Time slot constants (same as VariantScheduleEditor)
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

const TIME_SLOT_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i
  return `${hour.toString().padStart(2, '0')}:00`
})

function formatTime(time: string) {
  if (!time || typeof time !== 'string') return '–'
  const parts = time.split(':')
  const hour = Number(parts[0])
  const minute = Number(parts[1] ?? 0)
  if (Number.isNaN(hour)) return '–'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  const period = hour >= 12 ? 'PM' : 'AM'
  return `${displayHour}:${minute.toString().padStart(2, '0')}${period}`
}

function formatTimeRange(startTime: string, durationMinutes: number) {
  if (!startTime || typeof startTime !== 'string') return '–'
  const parts = startTime.split(':')
  const startHour = Number(parts[0])
  const startMinute = Number(parts[1] ?? 0)
  if (Number.isNaN(startHour)) return '–'
  const startTotal = startHour * 60 + startMinute
  const dur = Number(durationMinutes) || 0
  const endTotal = startTotal + dur
  const endHour = Math.floor((endTotal / 60) % 24)
  const endMinute = endTotal % 60
  const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`
  return `${formatTime(startTime)}–${formatTime(endTime)}`
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface TimeSlot {
  date: string
  startTime: string
  endTime: string
  dayOfWeek: number
  timezone: string
}

interface AvailabilityData {
  available: boolean
  hourlyRate: number
  pricingIncomplete?: boolean
  reason?: string
  currency: string
  timezone: string
  slots: TimeSlot[]
}

interface CalendarBookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tutor: {
    id: string
    name: string
    timezone?: string
  }
  username: string
  locale: string
}

export function CalendarBookingDialog({
  open,
  onOpenChange,
  tutor,
  username,
  locale,
}: CalendarBookingDialogProps) {
  const { data: session } = useSession()
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [availability, setAvailability] = useState<AvailabilityData | null>(null)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [hasPendingRequest, setHasPendingRequest] = useState(false)
  const [activeRequest, setActiveRequest] = useState<{ id: string; status: string } | null>(null)

  // Calendar week navigation
  const [weekOffset, setWeekOffset] = useState(0)
  const calendarScrollRef = useRef<HTMLDivElement>(null)

  // Active tab tracking
  const [activeTab, setActiveTab] = useState('schedule')

  // Week start calculation (Monday-based)
  const weekStart = useMemo(() => {
    const d = new Date()
    const day = d.getDay()
    const mon = d.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7
    return new Date(d.getFullYear(), d.getMonth(), mon)
  }, [weekOffset])

  const weekEnd = useMemo(() => {
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    return end
  }, [weekStart])

  const weekLabel = useMemo(() => {
    const start = weekStart
    const end = weekEnd
    return `${format(start, 'EEE, MMM d')} – ${format(end, 'MMM d')}`
  }, [weekStart, weekEnd])

  const monthLabel = useMemo(() => {
    return format(weekStart, 'MMMM yyyy')
  }, [weekStart])

  const weekDates = useMemo(() => {
    return DAYS.map((_, i) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      return d
    })
  }, [weekStart])

  // Fetch availability when dialog opens or week changes
  useEffect(() => {
    if (open && tutor.id) {
      loadAvailability()
      checkExistingRequest()
    }
  }, [open, tutor.id, weekOffset])

  // Reset selected slot when week changes
  useEffect(() => {
    setSelectedSlot(null)
    setActiveTab('schedule')
  }, [weekOffset])

  const loadAvailability = async () => {
    setLoading(true)
    setAvailabilityError(null)
    try {
      const start = new Date(weekStart)
      start.setHours(0, 0, 0, 0)
      const end = new Date(weekEnd)
      end.setHours(23, 59, 59, 999)

      const res = await fetch(
        `/api/public/tutors/${encodeURIComponent(username)}/availability?start=${start.toISOString()}&end=${end.toISOString()}`
      )
      if (res.ok) {
        const data = await res.json()
        setAvailability(data)
        if (data.pricingIncomplete) {
          setAvailabilityError('Pricing not set')
        }
      } else {
        const error = await res.json().catch(() => ({}))
        setAvailabilityError(error.error || 'Failed to load availability')
      }
    } catch {
      setAvailabilityError('Failed to load availability')
    } finally {
      setLoading(false)
    }
  }

  const checkExistingRequest = async () => {
    if (!session?.user) return
    try {
      const res = await fetch(`/api/one-on-one/status?tutorId=${encodeURIComponent(tutor.id)}`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setHasPendingRequest(data.hasActiveRequest)
        setActiveRequest(
          data.request
            ? {
                id: data.request.requestId ?? data.request.id,
                status: data.request.status,
              }
            : null
        )
      }
    } catch {
      // ignore
    }
  }

  // Build a set of available slot keys for quick lookup
  const availableSlotKeys = useMemo(() => {
    if (!availability?.slots) return new Set<string>()
    return new Set(availability.slots.map(s => `${s.date}_${s.startTime}_${s.endTime}`))
  }, [availability])

  // Check if a slot is available (in the tutor's returned slots)
  const isSlotAvailable = useCallback(
    (dateKey: string, timeStr: string) => {
      const slotEnd = `${String(parseInt(timeStr.slice(0, 2)) + 1).padStart(2, '0')}:00`
      return availableSlotKeys.has(`${dateKey}_${timeStr}_${slotEnd}`)
    },
    [availableSlotKeys]
  )

  // Check if slot is in the past
  const isSlotInPast = useCallback((dateKey: string, timeStr: string) => {
    const now = new Date()
    const slotDate = parseISO(dateKey)
    const [h, m] = timeStr.split(':').map(Number)
    slotDate.setHours(h, m, 0, 0)
    return isBefore(slotDate, now)
  }, [])

  // Handle slot selection
  const toggleSlot = (dateKey: string, timeStr: string) => {
    if (!isSlotAvailable(dateKey, timeStr) || isSlotInPast(dateKey, timeStr)) return

    const endHour = parseInt(timeStr.slice(0, 2)) + 1
    const endTime = `${String(endHour).padStart(2, '0')}:00`

    const dayIndex = parseISO(dateKey).getDay()

    setSelectedSlot({
      date: dateKey,
      startTime: timeStr,
      endTime,
      dayOfWeek: dayIndex,
      timezone: availability?.timezone ?? 'UTC',
    })
  }

  const handleSubmit = async () => {
    if (!selectedSlot || !session?.user) {
      toast.error('Please select a time slot')
      return
    }

    setSubmitting(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch('/api/one-on-one/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          tutorId: tutor.id,
          proposedSlots: [
            {
              date: selectedSlot.date,
              startTime: selectedSlot.startTime,
              endTime: selectedSlot.endTime,
            },
          ],
          duration: 60,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        toast.success('Booking request sent! The tutor will review and confirm.')
        setHasPendingRequest(true)
        setActiveRequest({
          id: data.request.requestId ?? data.request.id,
          status: data.request.status,
        })
        onOpenChange(false)
      } else if (res.status === 409) {
        toast.info('You already have a pending request with this tutor')
        setHasPendingRequest(true)
        if (data.existingRequestId) {
          setActiveRequest({ id: data.existingRequestId, status: data.status })
        }
      } else {
        toast.error(data.error || 'Failed to send request')
      }
    } catch {
      toast.error('Failed to send request')
    } finally {
      setSubmitting(false)
    }
  }

  // Summary data
  const summaryData = useMemo(() => {
    if (!selectedSlot) return null
    return {
      date: selectedSlot.date,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      durationMinutes: 60,
      dayOfWeek: DAYS[selectedSlot.dayOfWeek === 0 ? 6 : selectedSlot.dayOfWeek - 1],
      timezone: availability?.timezone ?? 'UTC',
    }
  }, [selectedSlot, availability])

  // Not logged in state
  if (!session?.user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Book 1 on 1 Session</DialogTitle>
            <DialogDescription>Please log in to book a session with {tutor.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-6 pt-0">
            <DialogPanel className="py-8 text-center">
              <Button variant="modal-primary-dark" asChild className="h-10">
                <Link href={`/${locale}/login`}>Log In</Link>
              </Button>
            </DialogPanel>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Pending request state
  if (hasPendingRequest && activeRequest) {
    const isAccepted = activeRequest.status === 'ACCEPTED'
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isAccepted ? 'Booking Accepted — Payment Required' : 'Booking Request Pending'}
            </DialogTitle>
            <DialogDescription>
              {isAccepted
                ? `${tutor.name} accepted your booking. Complete payment to confirm your session.`
                : `You already have a pending booking request with ${tutor.name}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-6 pt-0">
            <DialogPanel>
              <p className="font-medium text-gray-900">Status: {activeRequest.status}</p>
              <p className="mt-2 text-sm text-gray-600">
                {isAccepted
                  ? 'Your session is reserved pending payment. Complete payment now to secure it.'
                  : 'Please wait for the tutor to respond. You will receive a notification once they accept or reject your request.'}
              </p>
            </DialogPanel>
          </div>
          <DialogFooter className="gap-3">
            {isAccepted && activeRequest.id && (
              <Button
                variant="modal-primary-dark"
                className="h-10"
                onClick={() => router.push(`/${locale}/payment?requestId=${activeRequest.id}`)}
              >
                Complete Payment
              </Button>
            )}
            <Button
              variant="modal-secondary-dark"
              onClick={() => onOpenChange(false)}
              className="h-10"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Book 1 on 1 Session with {tutor.name}
          </DialogTitle>
          <DialogDescription>
            Select an available time slot for your one-hour session.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <TabsList className="mx-6 mb-2 grid w-auto shrink-0 grid-cols-2">
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="summary" disabled={!selectedSlot}>
              Summary
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="schedule"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden px-6 pb-4">
              {/* Price info */}
              <div className="shrink-0">
                <DialogPanel className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                  <span className="font-medium text-gray-900">
                    {availability?.currency} {availability?.hourlyRate} per session (1 hour)
                  </span>
                </DialogPanel>
              </div>

              {loading ? (
                <div className="flex flex-1 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : availabilityError ? (
                <div className="flex flex-1 items-center justify-center">
                  <DialogPanel className="py-6 text-center">
                    {availabilityError === 'Pricing not set' ? (
                      <div className="space-y-2">
                        <p className="font-medium text-gray-900">
                          This tutor is available for one-on-one sessions but has not set a price
                          yet.
                        </p>
                        <p className="text-sm text-gray-600">
                          Please check back later or contact the tutor directly.
                        </p>
                      </div>
                    ) : (
                      <p className="text-gray-600">
                        {availability?.reason === 'disabled'
                          ? 'This tutor is not currently offering one-on-one sessions.'
                          : availabilityError}
                      </p>
                    )}
                  </DialogPanel>
                </div>
              ) : (
                <>
                  {/* Legend container */}
                  <div className="shrink-0 rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
                    <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-3 w-3 rounded-sm border border-blue-600 bg-blue-600" />
                        Selected
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-3 w-3 rounded-sm border border-slate-200 bg-white" />
                        Available
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-3 w-3 rounded-sm bg-red-500/10" />
                        Unavailable
                      </span>
                    </div>
                  </div>

                  {/* Calendar container */}
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
                    {/* Calendar header with navigation */}
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-[14px] border-b border-[rgba(209,213,219,0.85)] bg-[#1D4ED8] px-4 py-2 text-white">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-white hover:bg-white/10 hover:text-white"
                          onClick={() => setWeekOffset(o => o - 1)}
                          aria-label="Previous week"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="min-w-[180px] text-center text-xs font-semibold text-white">
                          {weekLabel}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-white hover:bg-white/10 hover:text-white"
                          onClick={() => setWeekOffset(o => o + 1)}
                          aria-label="Next week"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold text-white/70">{monthLabel}</span>
                        <span className="mx-1 text-[10px] font-semibold text-white/60">Month:</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-white hover:bg-white/10 hover:text-white"
                          onClick={() => setWeekOffset(o => o - 4)}
                          aria-label="Previous month"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-white hover:bg-white/10 hover:text-white"
                          onClick={() => setWeekOffset(o => o + 4)}
                          aria-label="Next month"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Day headers */}
                    <div className="grid shrink-0 grid-cols-[150px_repeat(7,_1fr)] border-b border-[rgba(209,213,219,0.85)] bg-white">
                      <div className="flex h-12 items-center justify-center border-r border-[rgba(209,213,219,0.85)] px-2 text-center text-xs font-semibold text-slate-700">
                        Time
                      </div>
                      {DAYS.map((day, i) => {
                        const d = weekDates[i]
                        return (
                          <div
                            key={`${day}-${d.getTime()}`}
                            className="flex h-12 items-center justify-center border-r border-[rgba(209,213,219,0.85)] px-2 text-center text-xs font-semibold text-slate-700"
                          >
                            <div className="leading-tight">
                              <div>{day.slice(0, 3)}</div>
                              <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                                {d.getDate()}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Calendar grid — scrollable body */}
                    <div
                      ref={calendarScrollRef}
                      className="scrollbar-hide min-h-0 flex-1 overflow-y-auto overscroll-contain"
                    >
                      <div className="grid grid-cols-[150px_repeat(7,_1fr)]">
                        {TIME_SLOT_OPTIONS.map(timeStr => {
                          const hour = parseInt(timeStr.slice(0, 2), 10)
                          const endHour = hour + 1
                          const startLabel = `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`
                          const endLabel = `${endHour % 12 || 12} ${endHour >= 12 ? 'PM' : 'AM'}`
                          const displayTime = `${startLabel} – ${endLabel}`

                          return (
                            <div key={timeStr} className="contents">
                              {/* Time label cell */}
                              <div className="flex h-12 items-center justify-center border-b border-r border-[rgba(209,213,219,0.85)] px-2 text-center text-[11px] font-semibold text-slate-600">
                                {displayTime}
                              </div>
                              {/* Day cells */}
                              {DAYS.map((day, dayIndex) => {
                                const dateKey = formatDateKey(weekDates[dayIndex])
                                const available = isSlotAvailable(dateKey, timeStr)
                                const inPast = isSlotInPast(dateKey, timeStr)
                                const isSelected =
                                  selectedSlot?.date === dateKey &&
                                  selectedSlot?.startTime === timeStr

                                const isUnavailable = !available || inPast

                                const cellClass = isSelected
                                  ? 'bg-[#1D4ED8] font-semibold text-white'
                                  : isUnavailable
                                    ? 'bg-red-500/10 text-slate-500 cursor-not-allowed'
                                    : 'bg-white text-slate-700 hover:bg-slate-50 cursor-pointer'

                                return (
                                  <div
                                    key={`${day}-${timeStr}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                      if (!isUnavailable) toggleSlot(dateKey, timeStr)
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        if (!isUnavailable) toggleSlot(dateKey, timeStr)
                                      }
                                    }}
                                    className={cn(
                                      'flex h-12 w-full items-center justify-center border-b border-r border-[rgba(209,213,219,0.85)] px-2 text-center transition-colors',
                                      cellClass
                                    )}
                                    aria-pressed={isSelected}
                                    aria-label={`${day} ${displayTime}${isSelected ? ', selected' : ''}`}
                                  >
                                    {isSelected && <Check className="h-4 w-4" />}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Selected slot info */}
                  {selectedSlot && (
                    <div className="shrink-0">
                      <DialogPanel className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">Selected:</p>
                          <p className="text-sm text-gray-600">
                            {format(parseISO(selectedSlot.date), 'EEEE, MMMM d, yyyy')} at{' '}
                            {formatTime(selectedSlot.startTime)} –{' '}
                            {formatTime(selectedSlot.endTime)}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedSlot(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </DialogPanel>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent
            value="summary"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-auto px-6 pb-4">
              {summaryData && (
                <div className="space-y-4">
                  <div className="rounded-[18px] border border-white/10 bg-[rgba(39,43,50,0.72)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.28)] backdrop-blur-[18px]">
                    <div className="flex items-start justify-between gap-4 border-b border-white/15 pb-4">
                      <div>
                        <div className="flex items-center gap-2 text-base font-semibold text-white">
                          <Calendar className="h-5 w-5 text-white/80" />
                          Booking Summary
                        </div>
                        <div className="mt-1 text-xs font-medium text-white/70">
                          Times in {summaryData.timezone}
                        </div>
                      </div>
                    </div>

                    {/* Stats cards */}
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="flex min-h-12 items-center justify-between gap-3 rounded-[12px] border border-[rgba(226,232,240,0.9)] bg-white px-[18px] py-3 text-[#1F2933]">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Sessions
                        </span>
                        <span className="text-sm font-semibold">1</span>
                      </div>
                      <div className="flex min-h-12 items-center justify-between gap-3 rounded-[12px] border border-[rgba(226,232,240,0.9)] bg-white px-[18px] py-3 text-[#1F2933]">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Total Duration
                        </span>
                        <span className="text-sm font-semibold">1.0 h</span>
                      </div>
                    </div>

                    {/* Session details */}
                    <div className="mt-4 space-y-2">
                      <div className="text-sm font-semibold text-white">Session Details</div>
                      <div className="flex items-center justify-between gap-4 rounded-[12px] border border-[rgba(226,232,240,0.9)] bg-white px-[18px] py-[14px] text-[#1F2933]">
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="w-[92px] shrink-0 font-semibold">
                            {summaryData.dayOfWeek}
                          </div>
                          <div className="min-w-0 text-sm text-slate-700">
                            <span className="font-medium">
                              {format(parseISO(summaryData.date), 'MMM d')}
                            </span>
                            <span className="mx-2 text-slate-400">•</span>
                            <span className="font-medium">
                              {formatTimeRange(summaryData.startTime, summaryData.durationMinutes)}
                            </span>
                            <span className="mx-2 text-slate-400">•</span>
                            <span className="text-slate-600">{summaryData.durationMinutes}m</span>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                          1 session
                        </span>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="mt-4 rounded-[12px] border border-[rgba(226,232,240,0.9)] bg-white px-[18px] py-3 text-[#1F2933]">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Price
                        </span>
                        <span className="text-sm font-semibold">
                          {availability?.currency} {availability?.hourlyRate}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0 gap-3 px-6 pb-6">
          <Button
            variant="modal-secondary-dark"
            onClick={() => onOpenChange(false)}
            className="h-10"
          >
            Cancel
          </Button>
          <Button
            variant="modal-primary-dark"
            onClick={handleSubmit}
            disabled={!selectedSlot || submitting || loading}
            className="h-10"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              'Confirm Booking Request'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
