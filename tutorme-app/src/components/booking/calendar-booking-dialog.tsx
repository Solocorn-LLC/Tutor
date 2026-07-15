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
import { CourseCombobox, type CourseOption } from '@/components/course/course-combobox'

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
  free?: boolean
  pricingIncomplete?: boolean
  reason?: string
  currency: string
  timezone: string
  /** Whether this tutor allows booking a recurring weekly series. */
  recurringEnabled?: boolean
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
  /** The tutor's published courses, so the student can say which one this
   *  session is about. Optional — the picker only shows when there are some. */
  courses?: CourseOption[]
}

export function CalendarBookingDialog({
  open,
  onOpenChange,
  tutor,
  username,
  locale,
  courses = [],
}: CalendarBookingDialogProps) {
  const { data: session } = useSession()
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [availability, setAvailability] = useState<AvailabilityData | null>(null)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [slotError, setSlotError] = useState(false)
  const [hasPendingRequest, setHasPendingRequest] = useState(false)
  const [activeRequest, setActiveRequest] = useState<{ id: string; status: string } | null>(null)
  const [onWaitlist, setOnWaitlist] = useState(false)
  const [waitlistBusy, setWaitlistBusy] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Recurring booking: how many weeks to repeat the selected slot
  const [recurringWeeks, setRecurringWeeks] = useState(1)
  // Optional note the student sends the tutor ("why I want this session").
  const [studentNotes, setStudentNotes] = useState('')
  // Optional course the student wants this 1-on-1 to be about.
  const [courseId, setCourseId] = useState<string | null>(null)

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

  // Waitlist status (so the button reads Join vs Leave).
  useEffect(() => {
    if (!open || !tutor.id) return
    fetch(`/api/one-on-one/waitlist?tutorId=${encodeURIComponent(tutor.id)}`, {
      credentials: 'include',
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setOnWaitlist(!!d?.onWaitlist))
      .catch(() => {})
  }, [open, tutor.id])

  const toggleWaitlist = async () => {
    setWaitlistBusy(true)
    try {
      const res = onWaitlist
        ? await fetch(`/api/one-on-one/waitlist?tutorId=${encodeURIComponent(tutor.id)}`, {
            method: 'DELETE',
            credentials: 'include',
          })
        : await fetch('/api/one-on-one/waitlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ tutorId: tutor.id }),
          })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setOnWaitlist(!!d.onWaitlist)
        toast.success(
          d.onWaitlist ? "You're on the waitlist — we'll notify you." : 'Left the waitlist.'
        )
      } else {
        toast.error(d.error || 'Could not update the waitlist')
      }
    } catch {
      toast.error('Could not update the waitlist')
    } finally {
      setWaitlistBusy(false)
    }
  }

  const handleCancelRequest = async () => {
    if (!activeRequest?.id) return
    if (
      !window.confirm(
        'Cancel this 1-on-1 booking? If you already paid, a refund (minus the 15% fee) is issued automatically.'
      )
    ) {
      return
    }
    setCancelling(true)
    try {
      const res = await fetch('/api/one-on-one/cancel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestId: activeRequest.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(
          data.refunded
            ? `Booking cancelled — ${data.refundAmount} refunded (15% fee applied).`
            : 'Booking cancelled.'
        )
        setHasPendingRequest(false)
        setActiveRequest(null)
        onOpenChange(false)
      } else {
        toast.error(data.error || 'Could not cancel the booking')
      }
    } catch {
      toast.error('Could not cancel the booking')
    } finally {
      setCancelling(false)
    }
  }

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
        const msg = error.error || 'Failed to load availability'
        setAvailabilityError(msg)
        toast.error(msg)
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to load availability'
      setAvailabilityError(msg)
      toast.error(msg)
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

  // Check if slot is in the past (in the tutor's timezone)
  const isSlotInPast = useCallback(
    (dateKey: string, timeStr: string) => {
      const now = new Date()
      const tutorTz = availability?.timezone ?? 'UTC'

      // Parse the dateKey (YYYY-MM-DD) and timeStr (HH:MM) as wall-clock time in tutor's timezone
      const [year, month, day] = dateKey.split('-').map(Number)
      const [hour, minute] = timeStr.split(':').map(Number)

      // Build the UTC instant for this wall-clock time in the tutor's timezone
      // using the same logic as zonedWallClockToUtc
      const guess = new Date(Date.UTC(year, month - 1, day, hour, minute))
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tutorTz,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
      const parts: Record<string, string> = {}
      for (const p of dtf.formatToParts(guess)) {
        if (p.type !== 'literal') parts[p.type] = p.value
      }
      const pYear = Number(parts.year)
      const pMonth = Number(parts.month)
      const pDay = Number(parts.day)
      const pHour = parts.hour === '24' ? 0 : Number(parts.hour)
      const pMinute = Number(parts.minute)
      const pSecond = Number(parts.second)
      const asIfUtc = Date.UTC(pYear, pMonth - 1, pDay, pHour, pMinute, pSecond)
      const offsetMs = asIfUtc - guess.getTime()
      let slotUtc = new Date(guess.getTime() - offsetMs)
      // Re-check offset at result for DST
      const m2: Record<string, string> = {}
      for (const p of dtf.formatToParts(slotUtc)) {
        if (p.type !== 'literal') m2[p.type] = p.value
      }
      const asIfUtc2 = Date.UTC(
        Number(m2.year),
        Number(m2.month) - 1,
        Number(m2.day),
        m2.hour === '24' ? 0 : Number(m2.hour),
        Number(m2.minute),
        Number(m2.second)
      )
      const offsetMs2 = asIfUtc2 - slotUtc.getTime()
      if (offsetMs2 !== offsetMs) {
        slotUtc = new Date(guess.getTime() - offsetMs2)
      }

      return isBefore(slotUtc, now)
    },
    [availability?.timezone]
  )

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
    setSlotError(false)
  }

  const handleSubmit = async () => {
    if (!selectedSlot) {
      // Highlight the picker in red inline instead of only warning.
      setSlotError(true)
      return
    }
    if (!session?.user) {
      toast.error('Please sign in to book a session')
      return
    }

    setSubmitting(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      // Generate recurring slots: same day-of-week and time, N weeks apart
      const proposedSlots = []
      const baseDate = parseISO(selectedSlot.date)
      for (let w = 0; w < recurringWeeks; w += 1) {
        const d = new Date(baseDate)
        d.setDate(d.getDate() + w * 7)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        proposedSlots.push({
          date: `${y}-${m}-${day}`,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
        })
      }

      const res = await fetch('/api/one-on-one/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          tutorId: tutor.id,
          proposedSlots,
          duration: 60,
          ...(studentNotes.trim() ? { studentNotes: studentNotes.trim() } : {}),
          ...(courseId ? { courseId } : {}),
        }),
      })

      const data = await res.json()

      if (res.ok) {
        toast.success('Booking request sent! The tutor will review and confirm.')
        setStudentNotes('')
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

  // If the tutor doesn't allow a recurring series, keep the booking to one week.
  useEffect(() => {
    if (availability?.recurringEnabled === false && recurringWeeks !== 1) {
      setRecurringWeeks(1)
    }
  }, [availability?.recurringEnabled, recurringWeeks])

  // Generate all recurring dates for display
  const recurringDates = useMemo(() => {
    if (!selectedSlot) return []
    const dates = []
    const baseDate = parseISO(selectedSlot.date)
    for (let w = 0; w < recurringWeeks; w += 1) {
      const d = new Date(baseDate)
      d.setDate(d.getDate() + w * 7)
      dates.push(d)
    }
    return dates
  }, [selectedSlot, recurringWeeks])

  // Summary data
  const summaryData = useMemo(() => {
    if (!selectedSlot) return null
    return {
      dates: recurringDates,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      durationMinutes: 60,
      dayOfWeek: DAYS[selectedSlot.dayOfWeek === 0 ? 6 : selectedSlot.dayOfWeek - 1],
      timezone: availability?.timezone ?? 'UTC',
      sessionCount: recurringWeeks,
      totalHours: recurringWeeks,
    }
  }, [selectedSlot, availability, recurringDates, recurringWeeks])

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
              onClick={handleCancelRequest}
              disabled={cancelling}
              className="h-10 border-red-300 text-red-600 hover:bg-red-50"
            >
              {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Cancel booking
            </Button>
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
          <DialogDescription className={slotError ? 'font-medium text-red-600' : undefined}>
            {slotError
              ? 'Please select a time slot below to continue.'
              : 'Select an available time slot for your one-hour session.'}
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
                    {availability?.free
                      ? 'Free session — no payment needed'
                      : `${availability?.currency} ${availability?.hourlyRate} per session (1 hour)`}
                  </span>
                </DialogPanel>
              </div>

              {loading && !availability ? (
                <div className="flex flex-1 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : (
                <>
                  {/* Legend + recurring weeks container */}
                  <div className="shrink-0 rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
                    {/* Recurring-weeks picker — only when the tutor allows a series. */}
                    {availability?.recurringEnabled !== false && (
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-semibold text-[#1F2933]">
                          Book recurring sessions for
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={recurringWeeks}
                          onChange={e => {
                            const val = parseInt(e.target.value, 10)
                            const v = Math.max(1, Math.min(20, Number.isNaN(val) ? 1 : val))
                            setRecurringWeeks(v)
                          }}
                          className="border-input h-9 w-12 rounded-lg border bg-white px-1 text-center text-sm text-[#1F2933] [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <span className="text-sm font-semibold text-[#1F2933]">weeks.</span>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
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
                  <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
                    {/* Error banner */}
                    {availabilityError && availabilityError !== 'Pricing not set' && (
                      <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-center text-xs text-red-600">
                        {availabilityError}
                      </div>
                    )}
                    {/* Loading overlay for week navigation */}
                    {loading && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                      </div>
                    )}

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
                            {recurringWeeks > 1 && (
                              <span className="ml-1 font-medium text-blue-600">
                                (+{recurringWeeks - 1} more weekly{recurringWeeks > 2 ? 's' : ''})
                              </span>
                            )}
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
                        <span className="text-sm font-semibold">{summaryData.sessionCount}</span>
                      </div>
                      <div className="flex min-h-12 items-center justify-between gap-3 rounded-[12px] border border-[rgba(226,232,240,0.9)] bg-white px-[18px] py-3 text-[#1F2933]">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Total Duration
                        </span>
                        <span className="text-sm font-semibold">{summaryData.totalHours}.0 h</span>
                      </div>
                    </div>

                    {/* Session details */}
                    <div className="mt-4 space-y-2">
                      <div className="text-sm font-semibold text-white">Session Details</div>
                      {summaryData.dates.map((date, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-4 rounded-[12px] border border-[rgba(226,232,240,0.9)] bg-white px-[18px] py-[14px] text-[#1F2933]"
                        >
                          <div className="flex min-w-0 items-center gap-4">
                            <div className="w-[92px] shrink-0 font-semibold">
                              {summaryData.dayOfWeek}
                            </div>
                            <div className="min-w-0 text-sm text-slate-700">
                              <span className="font-medium">{format(date, 'MMM d')}</span>
                              <span className="mx-2 text-slate-400">•</span>
                              <span className="font-medium">
                                {formatTimeRange(
                                  summaryData.startTime,
                                  summaryData.durationMinutes
                                )}
                              </span>
                              <span className="mx-2 text-slate-400">•</span>
                              <span className="text-slate-600">{summaryData.durationMinutes}m</span>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                            Session {idx + 1}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Price */}
                    <div className="mt-4 rounded-[12px] border border-[rgba(226,232,240,0.9)] bg-white px-[18px] py-3 text-[#1F2933]">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Price
                        </span>
                        <span className="text-sm font-semibold">
                          {availability?.free
                            ? 'Free'
                            : `${availability?.currency} ${(availability?.hourlyRate ?? 0) * summaryData.sessionCount}`}
                        </span>
                      </div>
                    </div>

                    {/* Optional course this session is about */}
                    {courses.length > 0 ? (
                      <div className="mt-4">
                        <label className="mb-1.5 block text-sm font-semibold text-white">
                          Course <span className="font-normal text-white/50">(optional)</span>
                        </label>
                        <CourseCombobox
                          options={courses}
                          value={courseId}
                          onChange={setCourseId}
                          placeholder="Which course is this about?"
                        />
                        <p className="mt-1 text-[11px] text-white/50">
                          Lets your tutor line up the right lessons and tasks for your session.
                        </p>
                      </div>
                    ) : null}

                    {/* Optional note to the tutor */}
                    <div className="mt-4">
                      <label
                        htmlFor="booking-student-notes"
                        className="mb-1.5 block text-sm font-semibold text-white"
                      >
                        Note to tutor <span className="font-normal text-white/50">(optional)</span>
                      </label>
                      <textarea
                        id="booking-student-notes"
                        value={studentNotes}
                        onChange={e => setStudentNotes(e.target.value.slice(0, 1000))}
                        rows={3}
                        maxLength={1000}
                        placeholder="What would you like help with? e.g. preparing for Friday's calculus test."
                        className="w-full resize-none rounded-[12px] border border-[rgba(226,232,240,0.9)] bg-white px-[18px] py-3 text-sm text-[#1F2933] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                      <div className="mt-1 text-right text-[11px] font-medium text-white/50">
                        {studentNotes.length}/1000
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
            onClick={toggleWaitlist}
            disabled={waitlistBusy}
            className="h-10"
            title="Get notified when this tutor has a new opening"
          >
            {waitlistBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : onWaitlist ? (
              'Leave waitlist'
            ) : (
              'Join waitlist'
            )}
          </Button>
          <Button
            variant="modal-secondary-dark"
            onClick={() => onOpenChange(false)}
            className="h-10"
          >
            Cancel
          </Button>
          <Button
            variant="modal-primary-dark"
            // Two-step: from Schedule, advance to the Summary tab first (where the
            // course picker + note live) so students don't submit before choosing a
            // course. Only the Summary step actually sends the request.
            onClick={() => {
              if (activeTab === 'schedule') {
                setActiveTab('summary')
                return
              }
              handleSubmit()
            }}
            disabled={!selectedSlot || submitting || loading}
            className="h-10"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : activeTab === 'schedule' ? (
              'Next: review & course'
            ) : (
              'Confirm Booking Request'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
