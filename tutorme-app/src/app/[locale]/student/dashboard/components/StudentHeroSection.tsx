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
import { BookOpen, Calendar, Sparkles } from 'lucide-react'

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

export function StudentHeroSection() {
  const { data: session } = useSession()
  const [greeting, setGreeting] = useState('Good morning')
  const [currentTime, setCurrentTime] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<{ date: Date; events: DayEvent[] } | null>(null)
  const [sessions, setSessions] = useState<CalendarEventItem[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 18) setGreeting('Good afternoon')
    else setGreeting('Good evening')

    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

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
        const list: CalendarEventItem[] = Array.isArray(data?.events)
          ? data.events.map((e: any) => ({
              id: e.id || e.eventId || e.bookingId,
              title: e.title || 'Session',
              start: e.start || e.startTime,
              end: e.end || e.endTime,
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

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })

  return (
    <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-gradient-to-br from-[#F97316] to-[#EA580C] p-5 shadow-[0_14px_45px_rgba(0,0,0,0.12)] ring-1 ring-white/20">
      <div className="relative z-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-0.5 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-white/70" />
              <span className="text-sm font-medium text-white/70">
                {greeting}, {session?.user?.name?.split(' ')[0] || 'Student'}
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white">Welcome Back!</h1>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-7 gap-1 rounded-[14px] border border-white/10 bg-white/10 p-3">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date(currentTime)
            d.setDate(currentTime.getDate() + i)
            const dayEvents = eventsByDay.get(d.toDateString()) ?? []
            const hasEvents = dayEvents.length > 0

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
                    i === 0
                      ? 'bg-white/30 text-white'
                      : 'text-white group-hover:bg-white/10'
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
          <div className="flex-1" />
          <span className="text-xs text-white/60">
            {formatDate(currentTime)} •{' '}
            {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {sessionsLoading ? (
            <span className="text-xs text-white/60">Loading sessions…</span>
          ) : nextSession ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-white/80">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                Next: {nextSession.title} •{' '}
                {new Date(nextSession.start).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                {new Date(nextSession.start).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          ) : (
            <span className="text-xs text-white/60">No upcoming sessions</span>
          )}
        </div>

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
