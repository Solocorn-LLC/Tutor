'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { TabsContent } from '@/components/ui/tabs'
import {
  InteractiveCalendar,
  DEFAULT_TIMEZONE,
  type CalendarView,
} from '@/app/[locale]/tutor/dashboard/components/InteractiveCalendar'
import { SessionCalendarPanel } from '@/components/session-calendar-panel'
import { StudentGroupSessionsPanel } from '@/components/group-session/student-group-sessions-panel'
import { Badge } from '@/components/ui/badge'
import {
  CalendarDays,
  CalendarClock,
  Clock,
  BookOpen,
  MapPin,
  Video,
  Users,
  Loader2,
  Star,
  X,
  Check,
  CreditCard,
} from 'lucide-react'
import { toast } from 'sonner'
import { OneOnOneReviewDialog } from '@/components/booking/one-on-one-review-dialog'
import { OneOnOneRescheduleDialog } from '@/components/booking/one-on-one-reschedule-dialog'
import {
  OneOnOneRequestCard,
  groupIntoSeries,
  type OneOnOneRequestSummary,
} from '@/components/one-on-one/one-on-one-request-card'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { cn } from '@/lib/utils'

export interface CalendarEvent {
  id: string
  bookingId: string
  title: string
  subject: string
  start: string
  end: string
  duration: number
  type: 'class' | 'one-on-one' | 'group'
  tutorName: string | null
  tutorAvatarUrl?: string | null
  courseDescription?: string | null
  meetingUrl?: string | null
  status?: string
  requestId?: string | null
  /** The tutor accepted the slot but the student hasn't paid — shown on the
   *  calendar as "awaiting payment", with no (dead-end) join. */
  pendingPayment?: boolean
  /** LiveSession id (from the calendar event's externalId) — used to open the
   *  in-app two-way call room for a 1-on-1. */
  sessionId?: string | null
  isVirtual?: boolean
  costPerSession?: number | null
  tutorTimezone?: string | null
  /** A pending 1-on-1 reschedule proposal (from oneOnOneBookingRequest). When
   *  `proposedByMe` is false, the tutor proposed a new time and the student
   *  must accept/decline right on the card. */
  reschedule?: {
    proposedByMe: boolean
    date: string | null
    startTime: string | null
    endTime: string | null
    timezone: string | null
  } | null
}

interface DashboardCalendarProps {
  /** Optional initial data from dashboard fetch */
  initialEvents?: CalendarEvent[]
  onRefresh?: () => void
  /** Continue Learning contents */
  contents?: {
    id: string
    subject: string
    topic: string
    progress: number
    lastStudied?: string
  }[]
  /** Upcoming Classes data */
  upcomingClasses?: ClassItem[]
  bookingClassId?: string | null
  onBookClass?: (classId: string) => void
}

interface ClassItem {
  id: string
  sessionId?: string | null
  title: string
  subject: string
  tutorName: string
  tutorAvatarUrl?: string | null
  scheduledAt: string
  duration: number
  type: 'online' | 'in-person'
  students: number
  maxStudents: number
  isBooked?: boolean
  requiresPayment?: boolean
  price?: number | null
  status?: 'scheduled' | 'live' | 'completed' | 'cancelled'
  meetingUrl?: string | null
  courseName?: string | null
  courseDescription?: string | null
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function DashboardCalendar({
  initialEvents,
  onRefresh,
  contents = [],
  upcomingClasses = [],
  bookingClassId,
  onBookClass,
}: DashboardCalendarProps) {
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const [activeTab, setActiveTab] = useState('classes')
  const [calendarView, setCalendarView] = useState<CalendarView>('day')
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const [month, setMonth] = useState<Date>(() => new Date())
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents ?? [])
  const [loading, setLoading] = useState(!initialEvents?.length)
  const [reviewRequestId, setReviewRequestId] = useState<string | null>(null)
  const [rescheduleRequestId, setRescheduleRequestId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [respondingReschedule, setRespondingReschedule] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  // Pending (not-yet-accepted) 1-on-1 requests — they have no CalendarEvent yet,
  // so they never come back from /calendar/events. Fetched separately so a
  // just-submitted request is visible while awaiting the tutor's response.
  const [pendingRequests, setPendingRequests] = useState<OneOnOneRequestSummary[]>([])
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null)
  const monthStart = useMemo(() => new Date(month.getFullYear(), month.getMonth(), 1), [month])
  const monthEnd = useMemo(
    () => new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59),
    [month]
  )

  // Fetch calendar events
  useEffect(() => {
    let cancelled = false
    const start = monthStart.toISOString()
    const end = monthEnd.toISOString()
    setLoading(true)
    fetch(
      `/api/student/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { credentials: 'include' }
    )
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const list: CalendarEvent[] = Array.isArray(data?.events) ? data.events : []
        setEvents(list)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setEvents([])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [monthStart, monthEnd, onRefresh, refreshTick])

  // Fetch the student's own requests and keep only the PENDING ones — the
  // accepted/paid/completed ones already surface via the calendar-events list.
  useEffect(() => {
    let cancelled = false
    fetch('/api/one-on-one/request?role=sent', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { requests: [] }))
      .then(data => {
        if (cancelled) return
        const all: OneOnOneRequestSummary[] = Array.isArray(data?.requests) ? data.requests : []
        setPendingRequests(all.filter(r => (r.status || '').toUpperCase() === 'PENDING'))
      })
      .catch(() => {
        if (!cancelled) setPendingRequests([])
      })
    return () => {
      cancelled = true
    }
  }, [refreshTick])

  const handleCancelRequestSeries = async (requestId: string) => {
    setCancellingRequestId(requestId)
    try {
      const res = await fetchWithCsrf('/api/one-on-one/cancel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestId }),
      })
      if (res.ok) {
        toast.success('Request cancelled.')
        setRefreshTick(t => t + 1)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Could not cancel the request')
      }
    } catch {
      toast.error('Could not cancel the request')
    } finally {
      setCancellingRequestId(null)
    }
  }

  const handleCancelBooking = async (requestId: string) => {
    if (
      !window.confirm(
        'Cancel this 1-on-1 booking? If you already paid, a refund (minus the 15% fee) is issued automatically.'
      )
    ) {
      return
    }
    setCancellingId(requestId)
    try {
      const res = await fetch('/api/one-on-one/cancel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(
          data.refunded
            ? `Booking cancelled — ${data.refundAmount} refunded (15% fee applied).`
            : 'Booking cancelled.'
        )
        setRefreshTick(t => t + 1)
      } else {
        toast.error(data.error || 'Could not cancel the booking')
      }
    } catch {
      toast.error('Could not cancel the booking')
    } finally {
      setCancellingId(null)
    }
  }

  // Respond to a reschedule the TUTOR proposed: accept moves the session, decline
  // keeps the current time. Mirrors the OneOnOneRescheduleDialog's PATCH.
  const handleRescheduleResponse = async (requestId: string, action: 'accept' | 'decline') => {
    setRespondingReschedule(requestId)
    try {
      const res = await fetch('/api/one-on-one/reschedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestId, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(
          action === 'accept'
            ? 'New time accepted — the session has been moved.'
            : 'Declined — the session keeps its current time.'
        )
        setRefreshTick(t => t + 1)
        onRefresh?.()
      } else {
        toast.error(data.error || 'Could not respond to the reschedule')
      }
    } catch {
      toast.error('Could not respond to the reschedule')
    } finally {
      setRespondingReschedule(null)
    }
  }

  // Derive classes list from calendar events for the Sessions tab.
  // Exclude completed/ended sessions and sort chronologically so the next session is on top.
  const classes = useMemo<ClassItem[]>(() => {
    const mapped = events
      // 1-on-1 and group sessions have their own Bookings tab, so keep them out
      // of the Sessions (course classes) list.
      .filter(ev => ev.type !== 'one-on-one' && ev.type !== 'group')
      .map(ev => {
        const evStatus = (ev as any).status as string | undefined
        const status: ClassItem['status'] =
          evStatus === 'live' || evStatus === 'active'
            ? 'live'
            : evStatus === 'ended' || evStatus === 'completed'
              ? 'completed'
              : 'scheduled'
        return {
          id: ev.id,
          title: ev.title,
          subject: ev.subject,
          tutorName: ev.tutorName || 'Tutor',
          tutorAvatarUrl: ev.tutorAvatarUrl || null,
          scheduledAt: ev.start,
          duration: ev.duration,
          type: (ev as any).isVirtual === false ? ('in-person' as const) : ('online' as const),
          students: (ev as any).enrolledCount ?? 0,
          maxStudents: (ev as any).maxAttendees ?? 50,
          isBooked: true,
          status,
          meetingUrl: (ev as any).meetingUrl || null,
          sessionId: (ev as any).sessionId || ev.id,
          courseName: (ev as any).courseName || null,
          courseDescription: ev.courseDescription || null,
        }
      })
      .filter(cls => cls.status !== 'completed')
    // Live sessions pinned to the top, then chronological (next session first).
    mapped.sort((a, b) => {
      const aLive = a.status === 'live' ? 0 : 1
      const bLive = b.status === 'live' ? 0 : 1
      if (aLive !== bLive) return aLive - bLive
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    })
    return mapped
  }, [events])

  const interactiveEvents = useMemo(() => {
    return events.map(ev => {
      const evStatus = (ev as any).status as string | undefined
      const status: 'live' | 'completed' | 'scheduled' | 'cancelled' =
        evStatus === 'live' || evStatus === 'active'
          ? 'live'
          : evStatus === 'ended' || evStatus === 'completed'
            ? 'completed'
            : 'scheduled'
      const isOneOnOne = (ev as any).type === 'one-on-one'
      const isGroup = (ev as any).type === 'group'
      return {
        id: ev.id,
        title: ev.title,
        date: new Date(ev.start),
        duration: ev.duration,
        type: 'class' as const,
        status,
        subject: ev.subject,
        isOnline: true,
        // Carry the join keys through: without sessionId the Join button
        // always reported "not linked"; requestId lets a missing 1-on-1 session
        // self-heal; isDirectSession routes 1-on-1 AND group sessions to the
        // shared /call room (the calendar-grid dialog otherwise sent group
        // sessions to /student/feedback).
        sessionId: (ev as any).sessionId ?? undefined,
        requestId: (ev as any).requestId ?? undefined,
        pendingPayment: (ev as any).pendingPayment ?? undefined,
        isDirectSession: isOneOnOne || isGroup,
        maxStudents: isOneOnOne ? 2 : ((ev as any).maxStudents ?? undefined),
        description:
          (ev as any).meetingUrl || (ev.tutorName ? `Tutor: ${ev.tutorName}` : undefined),
        color:
          status === 'live'
            ? 'bg-emerald-500'
            : status === 'completed'
              ? 'bg-slate-400'
              : 'bg-blue-500',
      }
    })
  }, [events])

  // Paid 1-on-1 sessions the student has booked (surfaced by the events API).
  const oneOnOneSessions = useMemo(
    () =>
      events
        .filter(ev => ev.type === 'one-on-one')
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [events]
  )

  // Paid group-session seats the student holds.
  const groupSessions = useMemo(
    () =>
      events
        .filter(ev => ev.type === 'group')
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [events]
  )

  return (
    <>
      <SessionCalendarPanel
        value={activeTab}
        onValueChange={setActiveTab}
        tabs={[
          { value: 'classes', label: 'Sessions' },
          { value: 'calendar', label: 'Calendar' },
          { value: 'bookings', label: 'Bookings' },
          { value: 'groupSessions', label: 'Group Sessions' },
        ]}
        showCalendarControls={activeTab === 'calendar'}
        calendarView={calendarView}
        onCalendarViewChange={setCalendarView}
        timezone={timezone}
        onTimezoneChange={setTimezone}
        variant="orange"
      >
        {/* My Calendar Tab */}
        <TabsContent value="calendar" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <InteractiveCalendar
            events={interactiveEvents}
            loading={loading}
            mode="student"
            embedded
            initialView="day"
            timezone={timezone}
            onTimezoneChange={setTimezone}
            view={calendarView}
            onViewChange={setCalendarView}
          />
        </TabsContent>

        {/* Bookings Tab */}
        <TabsContent value="bookings" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="grid h-full grid-cols-2 gap-4 overflow-hidden">
            {/* Left column - 1-on-1 + Group Sessions, stacked */}
            <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-gray-400 bg-white p-4 shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
                <h3 className="mb-1 text-base font-semibold text-[#1F2933]">1-on-1 Sessions</h3>
                <p className="mb-4 text-xs text-gray-500">Upcoming private tutoring sessions.</p>
                <div className="flex-1 overflow-y-auto pr-1">
                  {/* Pending requests — shown as soon as they're submitted, before
                      the tutor responds (they have no CalendarEvent yet). */}
                  {pendingRequests.length > 0 && (
                    <div className="mb-3 flex flex-col gap-2">
                      <p className="text-xs font-semibold text-amber-600">
                        Awaiting tutor response
                      </p>
                      {groupIntoSeries(pendingRequests).map(group => {
                        const r = group.head
                        return (
                          <OneOnOneRequestCard
                            key={r.seriesId ?? r.requestId}
                            request={r}
                            perspective="student"
                            variant="light"
                            series={group.series}
                            actions={
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:bg-destructive/10"
                                disabled={cancellingRequestId === r.requestId}
                                onClick={() => handleCancelRequestSeries(r.requestId)}
                              >
                                {cancellingRequestId === r.requestId ? 'Cancelling…' : 'Cancel'}
                              </Button>
                            }
                          />
                        )
                      })}
                    </div>
                  )}

                  {oneOnOneSessions.length === 0 && pendingRequests.length === 0 ? (
                    <div className="rounded-[12px] border border-dashed border-gray-200 bg-gray-50/60 py-10 text-center">
                      <BookOpen className="text-muted-foreground/60 mx-auto mb-3 h-10 w-10" />
                      <p className="text-muted-foreground text-sm">
                        No 1-on-1 sessions booked yet.
                      </p>
                      <p className="text-muted-foreground/70 mt-1 text-xs">
                        Your upcoming private sessions will appear here.
                      </p>
                    </div>
                  ) : oneOnOneSessions.length === 0 ? null : (
                    <ul className="space-y-2">
                      {oneOnOneSessions.map(s => {
                        const isLive = s.status === 'live' || s.status === 'active'
                        return (
                          <li
                            key={s.id}
                            className="flex flex-col gap-2.5 rounded-[12px] border border-gray-200 bg-white p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-2.5">
                                {s.tutorAvatarUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={s.tutorAvatarUrl}
                                    alt=""
                                    className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover"
                                  />
                                ) : (
                                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                                    {(s.tutorName || 'T').charAt(0).toUpperCase()}
                                  </span>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[#1F2933]">
                                    {s.title}
                                  </p>
                                  {s.tutorName ? (
                                    <p className="truncate text-xs text-gray-500">
                                      with {s.tutorName}
                                    </p>
                                  ) : null}
                                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                                    <span className="inline-flex items-center gap-1">
                                      <CalendarDays className="h-3 w-3" />
                                      {formatDate(s.start)}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {formatEventTime(s.start)} · {s.duration} min
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                      {s.isVirtual === false ? (
                                        <>
                                          <MapPin className="h-3 w-3" />
                                          In person
                                        </>
                                      ) : (
                                        <>
                                          <Video className="h-3 w-3" />
                                          Online
                                        </>
                                      )}
                                    </span>
                                    {typeof s.costPerSession === 'number' &&
                                    s.costPerSession > 0 ? (
                                      <span className="font-medium text-gray-600">
                                        ${s.costPerSession}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {s.type === 'one-on-one' &&
                                  s.requestId &&
                                  new Date(s.end).getTime() >= Date.now() && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setRescheduleRequestId(s.requestId ?? null)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                      >
                                        <CalendarDays className="h-3.5 w-3.5" />
                                        Reschedule
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleCancelBooking(s.requestId as string)}
                                        disabled={cancellingId === s.requestId}
                                        className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                                      >
                                        {cancellingId === s.requestId ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <X className="h-3.5 w-3.5" />
                                        )}
                                        Cancel
                                      </button>
                                    </>
                                  )}
                                {s.type === 'one-on-one' &&
                                s.requestId &&
                                new Date(s.end).getTime() < Date.now() ? (
                                  <button
                                    type="button"
                                    onClick={() => setReviewRequestId(s.requestId ?? null)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                                  >
                                    <Star className="h-3.5 w-3.5" />
                                    Rate
                                  </button>
                                ) : s.pendingPayment ? (
                                  s.requestId ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        router.push(`/${locale}/payment?requestId=${s.requestId}`)
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                                      title="Your tutor accepted — complete payment to confirm and unlock the room."
                                    >
                                      <CreditCard className="h-3.5 w-3.5" />
                                      Complete payment
                                    </button>
                                  ) : (
                                    <span
                                      className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700"
                                      title="Your tutor accepted — complete payment to confirm and unlock the room."
                                    >
                                      <Clock className="h-3.5 w-3.5" />
                                      Awaiting payment
                                    </span>
                                  )
                                ) : s.sessionId ? (
                                  // Two-way in-app call room (both student and tutor).
                                  <button
                                    type="button"
                                    onClick={() => router.push(`/call/${s.sessionId}`)}
                                    className={cn(
                                      'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white',
                                      isLive
                                        ? 'bg-emerald-600 hover:bg-emerald-700'
                                        : 'bg-blue-600 hover:bg-blue-700'
                                    )}
                                  >
                                    <Video className="h-3.5 w-3.5" />
                                    {isLive ? 'Join now' : 'Join'}
                                  </button>
                                ) : s.meetingUrl ? (
                                  <a
                                    href={s.meetingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                      'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white',
                                      isLive
                                        ? 'bg-emerald-600 hover:bg-emerald-700'
                                        : 'bg-blue-600 hover:bg-blue-700'
                                    )}
                                  >
                                    <Video className="h-3.5 w-3.5" />
                                    {isLive ? 'Join now' : 'Join'}
                                  </a>
                                ) : (
                                  <span className="text-xs text-gray-400">Scheduled</span>
                                )}
                              </div>
                            </div>
                            {/* Reschedule consent: tutor proposed a new time — student accepts/declines here */}
                            {s.reschedule && s.requestId ? (
                              s.reschedule.proposedByMe ? (
                                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                  <CalendarClock className="h-4 w-4 shrink-0 text-slate-400" />
                                  You proposed a new time — waiting for{' '}
                                  {s.tutorName || 'your tutor'} to respond.
                                </div>
                              ) : (
                                <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="flex items-start gap-2 text-xs text-amber-900">
                                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                    <span>
                                      <span className="font-semibold">
                                        {s.tutorName || 'Your tutor'}
                                      </span>{' '}
                                      proposed a new time:{' '}
                                      <span className="font-semibold">
                                        {s.reschedule.date ? formatDate(s.reschedule.date) : ''}
                                        {s.reschedule.startTime
                                          ? ` · ${s.reschedule.startTime}`
                                          : ''}
                                        {s.reschedule.endTime ? `–${s.reschedule.endTime}` : ''}
                                      </span>
                                      . It won&apos;t change until you agree.
                                    </span>
                                  </div>
                                  <div className="flex shrink-0 gap-2">
                                    <button
                                      type="button"
                                      disabled={respondingReschedule === s.requestId}
                                      onClick={() =>
                                        handleRescheduleResponse(s.requestId as string, 'accept')
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                    >
                                      {respondingReschedule === s.requestId ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Check className="h-3.5 w-3.5" />
                                      )}
                                      Accept
                                    </button>
                                    <button
                                      type="button"
                                      disabled={respondingReschedule === s.requestId}
                                      onClick={() =>
                                        handleRescheduleResponse(s.requestId as string, 'decline')
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                      Decline
                                    </button>
                                  </div>
                                </div>
                              )
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* Group Sessions card */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-gray-400 bg-white p-4 shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
                <h3 className="mb-1 text-base font-semibold text-[#1F2933]">Group Sessions</h3>
                <p className="mb-4 text-xs text-gray-500">Sessions you&apos;ve booked a seat in.</p>
                <div className="flex-1 overflow-y-auto pr-1">
                  {groupSessions.length === 0 ? (
                    <div className="rounded-[12px] border border-dashed border-gray-200 bg-gray-50/60 py-8 text-center">
                      <Users className="text-muted-foreground/60 mx-auto mb-3 h-9 w-9" />
                      <p className="text-muted-foreground text-sm">No group sessions booked yet.</p>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {groupSessions.map(s => {
                        const isLive = s.status === 'live' || s.status === 'active'
                        return (
                          <li
                            key={s.id}
                            className="flex items-center justify-between gap-3 rounded-[12px] border border-gray-200 bg-white p-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#1F2933]">
                                {s.title}
                                {s.tutorName ? (
                                  <span className="font-normal text-gray-400">
                                    {' '}
                                    · {s.tutorName}
                                  </span>
                                ) : null}
                              </p>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {formatDate(s.start)} · {formatEventTime(s.start)}
                              </p>
                            </div>
                            {new Date(s.end).getTime() < Date.now() ? (
                              // Session already ended — suppress the dead-end Join
                              // (the room is closed). Parity with the 1-on-1 list,
                              // which flips a past session to its Rate/ended state.
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500">
                                Ended
                              </span>
                            ) : s.pendingPayment ? (
                              <button
                                type="button"
                                onClick={() => setActiveTab('groupSessions')}
                                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                                title="Seat held — complete payment to confirm and unlock the room."
                              >
                                <CreditCard className="h-3.5 w-3.5" />
                                Complete payment
                              </button>
                            ) : s.sessionId ? (
                              <button
                                type="button"
                                onClick={() => router.push(`/call/${s.sessionId}`)}
                                className={cn(
                                  'inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white',
                                  isLive
                                    ? 'bg-emerald-600 hover:bg-emerald-700'
                                    : 'bg-blue-600 hover:bg-blue-700'
                                )}
                              >
                                <Video className="h-3.5 w-3.5" />
                                {isLive ? 'Join now' : 'Join'}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">Scheduled</span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Right column - Tutor Info */}
            <div className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-gray-400 bg-white p-4 shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
              <h3 className="mb-1 text-base font-semibold text-[#1F2933]">Tutor Info</h3>
              <p className="mb-4 text-xs text-gray-500">Details about your assigned tutor.</p>
              <div className="flex-1 overflow-y-auto pr-1">
                <div className="rounded-[12px] border border-dashed border-gray-200 bg-gray-50/60 py-10 text-center">
                  <Users className="text-muted-foreground/60 mx-auto mb-3 h-10 w-10" />
                  <p className="text-muted-foreground text-sm">No tutor selected.</p>
                  <p className="text-muted-foreground/70 mt-1 text-xs">
                    Tutor information will appear here once a session is booked.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* My Classes Tab */}
        <TabsContent value="classes" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="h-full overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center">
                <p className="text-muted-foreground text-sm">Loading your classes...</p>
              </div>
            ) : classes.length === 0 ? (
              <div className="rounded-[14px] border border-[rgba(0,0,0,0.04)] bg-[#FFFFFF] py-12 text-center shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
                <BookOpen className="text-muted-foreground/60 mx-auto mb-3 h-12 w-12" />
                <p className="text-muted-foreground">There are no upcoming sessions.</p>
              </div>
            ) : (
              <div className="space-y-3 pr-2">
                {classes.map(cls => (
                  <div
                    key={cls.id}
                    className="flex items-center gap-3 rounded-[14px] border border-[rgba(0,0,0,0.04)] bg-[#FFFFFF] p-3 shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-colors hover:bg-slate-50"
                  >
                    {cls.tutorAvatarUrl ? (
                      <img
                        src={cls.tutorAvatarUrl}
                        alt={cls.tutorName}
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-500">
                        {cls.tutorName.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate font-medium text-gray-900">
                          {cls.courseName || cls.title}
                        </h4>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px]',
                            cls.status === 'live'
                              ? 'animate-pulse gap-1 bg-emerald-100 text-emerald-700'
                              : 'bg-blue-100 text-blue-700'
                          )}
                        >
                          {cls.status === 'live' && (
                            <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-emerald-500" />
                          )}
                          {cls.status === 'live' ? 'Live' : 'Scheduled'}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {cls.courseName ? cls.title : cls.subject}
                      </p>

                      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {formatDate(cls.scheduledAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatEventTime(cls.scheduledAt)}
                        </span>
                        <span className={cn('flex items-center gap-1', 'text-primary')}>
                          {cls.type === 'online' ? (
                            <Video className="h-3 w-3" />
                          ) : (
                            <MapPin className="h-3 w-3" />
                          )}
                          {cls.type === 'online' ? 'Online' : 'In-Person'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {cls.students}/{cls.maxStudents} students
                        </span>
                        <span>Tutor: {cls.tutorName}</span>
                      </div>
                    </div>

                    <div className="line-clamp-3 hidden w-1/3 shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600 sm:block">
                      {cls.courseDescription || 'No description available.'}
                    </div>

                    {cls.sessionId ? (
                      <Button
                        size="sm"
                        className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-500"
                        onClick={() => router.push(`/student/feedback?sessionId=${cls.sessionId}`)}
                      >
                        {cls.status === 'live' ? 'Join' : 'Enter'}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="shrink-0" asChild>
                        <Link href={`/student/courses/${cls.id}`}>Details</Link>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Group Sessions Tab */}
        <TabsContent
          value="groupSessions"
          className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <StudentGroupSessionsPanel embedded />
        </TabsContent>
      </SessionCalendarPanel>
      {reviewRequestId && (
        <OneOnOneReviewDialog
          requestId={reviewRequestId}
          open
          onOpenChange={o => !o && setReviewRequestId(null)}
        />
      )}
      {rescheduleRequestId && (
        <OneOnOneRescheduleDialog
          requestId={rescheduleRequestId}
          open
          onOpenChange={o => !o && setRescheduleRequestId(null)}
          onChanged={onRefresh}
        />
      )}
    </>
  )
}
