'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from '@/components/ui/dialog'
import { BookOpen, Calendar, CheckCircle, Sparkles, Users } from 'lucide-react'
import type { StudentDashboardStats } from './StudentDashboardContext'

interface StudentHeroSectionProps {
  title?: string
  showGreeting?: boolean
  stats?: StudentDashboardStats
  statsLoading?: boolean
  /** Bump this to force a re-fetch of internally-managed stats (e.g. after an unregister). */
  refreshSignal?: number
}

interface CalendarEventItem {
  id: string
  title: string
  start: string
  end: string
  duration: number
}

interface DayEvent {
  id: string
  title: string
  timeLabel: string
  duration: number
}

const DEFAULT_STATS: StudentDashboardStats = {
  coursesEnrolled: 0,
  coursesCompleted: 0,
  upcomingSessions: 0,
  totalBookings: 0,
}

export function StudentHeroSection({
  title = 'Welcome Back!',
  showGreeting = true,
  stats: statsProp,
  statsLoading: statsLoadingProp,
  refreshSignal,
}: StudentHeroSectionProps) {
  const { data: session } = useSession()
  const [greeting, setGreeting] = useState('Good morning')
  const [currentTime, setCurrentTime] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<{ date: Date; events: DayEvent[] } | null>(null)
  const [sessions, setSessions] = useState<CalendarEventItem[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)

  const [internalStats, setInternalStats] = useState<StudentDashboardStats>(DEFAULT_STATS)
  const [internalLoading, setInternalLoading] = useState(statsProp === undefined)

  const stats = statsProp ?? internalStats
  const statsLoading = statsLoadingProp ?? internalLoading

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 18) setGreeting('Good afternoon')
    else setGreeting('Good evening')

    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (statsProp !== undefined) return

    let cancelled = false
    setInternalLoading(true)
    fetch('/api/student/dashboard-stats', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (cancelled) return
        setInternalStats(json?.data ?? DEFAULT_STATS)
      })
      .catch(() => {
        if (cancelled) return
        setInternalStats(DEFAULT_STATS)
      })
      .finally(() => {
        if (!cancelled) setInternalLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [statsProp, refreshSignal])

  // Fetch upcoming sessions with a wide date range (today to +90 days)
  useEffect(() => {
    let cancelled = false
    const now = new Date()
    const start = now.toISOString()
    const end = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()

    fetch(
      `/api/student/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { credentials: 'include' }
    )
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const rawEvents = data?.events as Array<
          Partial<CalendarEventItem> & {
            eventId?: string
            bookingId?: string
            startTime?: string
            endTime?: string
          }
        >
        const list: CalendarEventItem[] = Array.isArray(rawEvents)
          ? rawEvents.map(e => ({
              id: e.id || e.eventId || e.bookingId || '',
              title: e.title || 'Session',
              start: e.start || e.startTime || '',
              end: e.end || e.endTime || '',
              duration: e.duration || 60,
            }))
          : []
        setSessions(list)
        setSessionsLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setSessions([])
        setSessionsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, DayEvent[]>()
    sessions.forEach(s => {
      const date = new Date(s.start)
      const key = date.toDateString()
      const startDate = new Date(s.start)
      const endDate = new Date(s.end)
      const timeLabel = `${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
      const list = map.get(key) ?? []
      list.push({ id: s.id, title: s.title, timeLabel, duration: s.duration })
      map.set(key, list)
    })
    return map
  }, [sessions])

  // Find the next upcoming session (first session with start time >= now)
  const nextSession = useMemo(() => {
    const now = Date.now()
    return sessions.find(s => new Date(s.start).getTime() >= now) || null
  }, [sessions])

  // Live countdown to next session
  const [countdown, setCountdown] = useState('')
  useEffect(() => {
    if (!nextSession) {
      setCountdown('')
      return
    }
    const target = new Date(nextSession.start).getTime()
    const tick = () => {
      const diff = target - Date.now()
      if (diff <= 0) {
        setCountdown('Starting now')
        return
      }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setCountdown(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      )
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [nextSession])

  const timeZoneAbbr = useMemo(() => {
    try {
      return (
        new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop() || ''
      )
    } catch {
      return ''
    }
  }, [])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className="relative flex flex-col overflow-hidden rounded-[18px] border border-white/10 bg-gradient-to-br from-[#F97316] to-[#EA580C] p-5 shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
      <div className="relative z-10 flex flex-1 flex-col">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            {showGreeting && (
              <div className="mb-0.5 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-white/70" />
                <span className="text-sm font-medium text-white/70">
                  {greeting}, {session?.user?.name?.split(' ')[0] || 'Student'}
                </span>
              </div>
            )}
            <h1 className="text-3xl font-bold text-white">{title}</h1>
          </div>

          <div
            className={cn(
              'flex flex-wrap items-center justify-end gap-2',
              statsLoading && 'animate-pulse'
            )}
          >
            <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm">
              <BookOpen className="h-4 w-4 text-white/80" />
              <span className="text-xs font-medium text-white/80">Courses Enrolled</span>
              <span className="text-sm font-bold text-white">{stats.coursesEnrolled}</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm">
              <CheckCircle className="h-4 w-4 text-white/80" />
              <span className="text-xs font-medium text-white/80">Courses Completed</span>
              <span className="text-sm font-bold text-white">{stats.coursesCompleted}</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm">
              <Calendar className="h-4 w-4 text-white/80" />
              <span className="text-xs font-medium text-white/80">Upcoming Sessions</span>
              <span className="text-sm font-bold text-white">{stats.upcomingSessions}</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm">
              <Users className="h-4 w-4 text-white/80" />
              <span className="text-xs font-medium text-white/80">Total Bookings</span>
              <span className="text-sm font-bold text-white">{stats.totalBookings}</span>
            </div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-7 gap-1 rounded-[14px] border border-white/10 bg-white/10 p-3">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date(currentTime)
            d.setDate(currentTime.getDate() + i)
            const dayEvents = eventsByDay.get(d.toDateString()) ?? []

            return (
              <div
                key={i}
                onClick={() => setSelectedDay({ date: d, events: dayEvents })}
                className="group flex cursor-pointer flex-col items-center justify-center rounded-xl py-2 transition-colors hover:bg-white/20"
              >
                <span className="text-[11px] font-medium text-white/70">
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span
                  className={cn(
                    'mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold',
                    i === 0 ? 'bg-white/30 text-white' : 'text-white group-hover:bg-white/10'
                  )}
                >
                  {d.getDate()}
                </span>
                <div className="mt-1 h-1 w-1 rounded-full bg-white/40" />
              </div>
            )
          })}
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center justify-start gap-2" />
          <div className="flex-none text-center">
            <span className="text-base text-white">
              {formatDate(currentTime)} • {formatTime(currentTime)} {timeZoneAbbr}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-2">
            {sessionsLoading ? (
              <span className="text-sm text-white/70">Loading sessions…</span>
            ) : countdown ? (
              <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-300">
                <AnimatedClock className="h-3.5 w-3.5" />
                <span className="tabular-nums">Next session: {countdown}</span>
              </div>
            ) : (
              <span className="text-sm text-white/70">No upcoming sessions</span>
            )}
          </div>
        </div>

        {/* Day Detail Modal */}
        <Dialog open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {selectedDay?.date.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </DialogTitle>
              <DialogDescription>
                {selectedDay && selectedDay.events.length > 0
                  ? `${selectedDay.events.length} session${selectedDay.events.length > 1 ? 's' : ''} scheduled`
                  : 'No sessions scheduled'}
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-3" spacing="default">
              {selectedDay?.events.map(event => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white p-4 text-[#1F2933]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
                    <BookOpen className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{event.title}</p>
                    <p className="text-sm text-slate-600">
                      {event.timeLabel} • {event.duration} min
                    </p>
                  </div>
                </div>
              ))}

              {(!selectedDay || selectedDay.events.length === 0) && (
                <div className="rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white px-6 py-10 text-center text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.10)]">
                  <Calendar className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                  <p className="font-medium">No sessions scheduled for this day</p>
                </div>
              )}
            </DialogBody>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

function AnimatedClock({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <line
        x1="12"
        y1="12"
        x2="12"
        y2="6"
        className="origin-[12px_12px] animate-[spin_12s_linear_infinite]"
      />
      <line
        x1="12"
        y1="12"
        x2="12"
        y2="8"
        className="origin-[12px_12px] animate-[spin_2s_linear_infinite]"
        strokeWidth="1.5"
      />
    </svg>
  )
}
