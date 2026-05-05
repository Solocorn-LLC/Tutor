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
    <div className="relative overflow-hidden rounded-[18px] border border-[rgba(0,0,0,0.05)] bg-[#FFFFFF] p-8 shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
      <div className="relative z-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="text-primary h-5 w-5" />
              <span className="text-sm font-medium text-slate-500">
                {greeting}, {session?.user?.name?.split(' ')[0] || 'Student'}
              </span>
            </div>
            <h1 className="mb-2 text-4xl font-bold text-slate-800">Welcome Back!</h1>
            <p className="text-slate-500">
              {formatDate(currentTime)} •{' '}
              {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Calendar className="h-4 w-4" />
            {sessionsLoading ? (
              <span>Loading sessions…</span>
            ) : nextSession ? (
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
            ) : (
              'No upcoming sessions'
            )}
          </div>
        </div>

        <div className="mb-8 grid grid-cols-7 gap-2 rounded-[14px] border border-[rgba(0,0,0,0.04)] bg-[#FFFFFF] p-4 shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date(currentTime)
            d.setDate(currentTime.getDate() + i)
            const dayEvents = eventsByDay.get(d.toDateString()) ?? []
            const hasEvents = dayEvents.length > 0

            return (
              <div
                key={i}
                onClick={() => setSelectedDay({ date: d, events: dayEvents })}
                className="group flex cursor-pointer flex-col items-center justify-center rounded-xl p-2 transition-colors hover:bg-slate-50"
              >
                <span className="mb-1 text-xs font-medium text-slate-500">
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span
                  className={cn(
                    'mt-1 flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold',
                    i === 0
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-700 group-hover:bg-indigo-50'
                  )}
                >
                  {d.getDate()}
                </span>
                <div className="mt-2 flex min-h-[18px] flex-col items-center gap-0.5">
                  {dayEvents.slice(0, 1).map(evt => (
                    <span key={evt.id} className="text-[10px] font-medium text-indigo-600">
                      {evt.timeLabel}
                    </span>
                  ))}
                  {dayEvents.length > 1 && (
                    <span className="text-[8px] text-slate-500">+{dayEvents.length - 1} more</span>
                  )}
                  {!hasEvents && (
                    <div className="flex h-1.5 gap-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-200" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
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
