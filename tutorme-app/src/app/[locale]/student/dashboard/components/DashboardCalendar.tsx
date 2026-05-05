'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { InteractiveCalendar } from '@/app/[locale]/tutor/dashboard/components/InteractiveCalendar'
import { Badge } from '@/components/ui/badge'
import { CalendarDays, Clock, BookOpen, MapPin, Video, Users, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CalendarEvent {
  id: string
  bookingId: string
  title: string
  subject: string
  start: string
  end: string
  duration: number
  type: 'class'
  tutorName: string | null
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
  const [activeTab, setActiveTab] = useState('classes')
  const [month, setMonth] = useState<Date>(() => new Date())
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents ?? [])
  const [loading, setLoading] = useState(!initialEvents?.length)
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
  }, [monthStart, monthEnd, onRefresh])

  // Derive classes list from calendar events for the Sessions tab
  // Sorted reverse-chronologically: newest first, oldest at bottom
  const classes = useMemo<ClassItem[]>(() => {
    const mapped = events.map(ev => {
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
      }
    })
    // Reverse chronological: newest first
    mapped.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
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
      return {
        id: ev.id,
        title: ev.title,
        date: new Date(ev.start),
        duration: ev.duration,
        type: 'class' as const,
        status,
        subject: ev.subject,
        isOnline: true,
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

  return (
    <div className="w-full overflow-hidden rounded-[18px] border border-[rgba(0,0,0,0.05)] bg-[#FFFFFF] shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="p-6 pb-3">
          <TabsList variant="pills" fullWidth className="grid w-full grid-cols-2 gap-2 bg-transparent p-0">
            <TabsTrigger
              value="classes"
              fullWidth
              className="h-11 gap-2 rounded-full border px-4 font-semibold shadow-[0_6px_18px_rgba(15,23,42,0.08)] transition-all duration-200 data-[state=inactive]:border-[rgba(31,41,51,0.08)] data-[state=inactive]:bg-white data-[state=inactive]:text-[#1F2933] data-[state=inactive]:hover:border-[rgba(31,41,51,0.16)] data-[state=inactive]:hover:bg-slate-50 data-[state=inactive]:hover:shadow-[0_8px_20px_rgba(15,23,42,0.10)] data-[state=active]:border-[rgba(255,255,255,0.10)] data-[state=active]:bg-[linear-gradient(135deg,rgba(63,61,57,0.92),rgba(31,41,51,0.96))] data-[state=active]:text-white data-[state=active]:shadow-[0_8px_18px_rgba(15,23,42,0.16)]"
            >
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Sessions</span>
              <span className="sm:hidden">Sessions</span>
            </TabsTrigger>
            <TabsTrigger
              value="calendar"
              fullWidth
              className="h-11 gap-2 rounded-full border px-4 font-semibold shadow-[0_6px_18px_rgba(15,23,42,0.08)] transition-all duration-200 data-[state=inactive]:border-[rgba(31,41,51,0.08)] data-[state=inactive]:bg-white data-[state=inactive]:text-[#1F2933] data-[state=inactive]:hover:border-[rgba(31,41,51,0.16)] data-[state=inactive]:hover:bg-slate-50 data-[state=inactive]:hover:shadow-[0_8px_20px_rgba(15,23,42,0.10)] data-[state=active]:border-[rgba(255,255,255,0.10)] data-[state=active]:bg-[linear-gradient(135deg,rgba(63,61,57,0.92),rgba(31,41,51,0.96))] data-[state=active]:text-white data-[state=active]:shadow-[0_8px_18px_rgba(15,23,42,0.16)]"
            >
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline">Calendar</span>
              <span className="sm:hidden">Calendar</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="p-6 pt-0">
          {/* My Calendar Tab */}
          <TabsContent value="calendar" className="mt-0 space-y-4">
            <InteractiveCalendar events={interactiveEvents} loading={loading} mode="student" />
          </TabsContent>

          {/* My Classes Tab */}
          <TabsContent value="classes" className="mt-0">
            {loading ? (
              <div className="py-8 text-center">
                <p className="text-muted-foreground text-sm">Loading your classes...</p>
              </div>
            ) : classes.length === 0 ? (
              <div className="rounded-[14px] border border-[rgba(0,0,0,0.04)] bg-[#FFFFFF] py-12 text-center shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
                <BookOpen className="text-muted-foreground/60 mx-auto mb-3 h-12 w-12" />
                <p className="text-muted-foreground">You haven&apos;t booked any classes yet.</p>
                <Button className="mt-4" asChild>
                  <Link href="/student/courses">Browse Classes</Link>
                </Button>
              </div>
            ) : (
              <div className="max-h-[400px] space-y-3 overflow-y-auto pr-2">
                {classes.map(cls => (
                  <div
                    key={cls.id}
                    className="rounded-[14px] border border-[rgba(0,0,0,0.04)] bg-[#FFFFFF] p-4 shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-colors hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-foreground font-medium">
                            {cls.courseName || cls.title}
                          </h4>
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-[10px]',
                              cls.status === 'live'
                                ? 'bg-emerald-100 text-emerald-700'
                                : cls.status === 'completed'
                                  ? 'bg-slate-100 text-slate-600'
                                  : 'bg-blue-100 text-blue-700'
                            )}
                          >
                            {cls.status === 'live'
                              ? 'Live'
                              : cls.status === 'completed'
                                ? 'Completed'
                                : 'Scheduled'}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-sm">
                          {cls.courseName ? cls.title : cls.subject}
                        </p>

                        <div className="text-muted-foreground mt-2 flex items-center gap-4 text-xs">
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
                        </div>

                        <div className="text-muted-foreground mt-2 flex items-center gap-4 text-xs">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {cls.students}/{cls.maxStudents} students
                          </span>
                          <span>Tutor: {cls.tutorName}</span>
                        </div>
                      </div>

                      {cls.sessionId ? (
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-500"
                          onClick={() =>
                            router.push(`/student/feedback?sessionId=${cls.sessionId}`)
                          }
                        >
                          {cls.status === 'live' ? 'Join' : 'Enter'}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/student/courses/${cls.id}`}>Details</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
