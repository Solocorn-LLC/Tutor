'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Video,
  BookOpen,
  GraduationCap,
} from 'lucide-react'
import { toast } from 'sonner'

interface CalendarEvent {
  id: string
  type: 'class' | 'clinic' | 'course_start'
  title: string
  description: string | null
  subject: string
  startTime: string
  endTime: string
  status: string
  maxParticipants?: number
  enrolledCount: number
  roomUrl?: string | null
  link: string
  requiresPayment?: boolean
}

export default function TutorCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

  // Get first day of month and number of days
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay()

  // Calculate calendar grid
  const days = []
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null) // Empty cells before month starts
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i)
  }

  // Fetch events when month changes
  useEffect(() => {
    fetchEvents()
  }, [year, month])

  const fetchEvents = async () => {
    setLoading(true)
    try {
      const start = new Date(year, month, 1).toISOString()
      const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

      const res = await fetch(`/api/tutor/calendar/events?start=${start}&end=${end}`, {
        credentials: 'include',
      })

      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
      } else {
        toast.error('Failed to load calendar events')
      }
    } catch {
      toast.error('Failed to load calendar events')
    } finally {
      setLoading(false)
    }
  }

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Get events for a specific day
  const getEventsForDay = (day: number) => {
    const dateStr = new Date(year, month, day).toDateString()
    return events.filter(event => {
      const eventDate = new Date(event.startTime).toDateString()
      return eventDate === dateStr
    })
  }

  // Format time for display
  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Get event icon based on type
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'class':
        return <Video className="h-3 w-3" />
      case 'clinic':
        return <Clock className="h-3 w-3" />
      case 'course_start':
        return <GraduationCap className="h-3 w-3" />
      default:
        return <BookOpen className="h-3 w-3" />
    }
  }

  // Get event color based on type
  const getEventColor = (type: string) => {
    switch (type) {
      case 'class':
        return 'bg-blue-100 text-blue-600 border-blue-200'
      case 'clinic':
        return 'bg-purple-100 text-purple-700 border-purple-200'
      case 'course_start':
        return 'bg-green-100 text-green-700 border-green-200'
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

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

  // Get upcoming events (next 7 days)
  const upcomingEvents = events.filter(e => new Date(e.startTime) >= new Date()).slice(0, 5)

  return (
    <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <CalendarDays className="h-6 w-6" />
            Calendar
          </h1>
          <p className="mt-1 text-gray-600">Manage your schedule and upcoming classes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={goToToday}>
            Today
          </Button>
          <Link href="/tutor/dashboard?create=1">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Event
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              {monthNames[month]} {year}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="mb-2 grid grid-cols-7 gap-2 text-center">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="py-2 text-sm font-semibold text-gray-500">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-2">
              {days.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} className="aspect-square" />
                }

                const dayEvents = getEventsForDay(day)
                const isToday =
                  new Date().toDateString() === new Date(year, month, day).toDateString()

                return (
                  <div
                    key={day}
                    className={`aspect-square overflow-hidden rounded-lg border p-1 ${isToday ? 'border-blue-300 bg-blue-50' : 'hover:bg-gray-50'} ${dayEvents.length > 0 ? 'cursor-pointer' : ''} `}
                  >
                    <div
                      className={`mb-1 text-sm font-medium ${isToday ? 'text-blue-600' : 'text-gray-700'} `}
                    >
                      {day}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map(event => (
                        <Link key={event.id} href={event.link}>
                          <div
                            className={`truncate rounded border px-1 py-0.5 text-xs ${getEventColor(event.type)} `}
                          >
                            {formatTime(event.startTime)} {event.title.slice(0, 15)}
                            {event.title.length > 15 ? '...' : ''}
                          </div>
                        </Link>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="px-1 text-xs text-gray-500">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Upcoming Events */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming Events</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse">
                      <div className="mb-1 h-4 w-3/4 rounded bg-gray-200" />
                      <div className="h-3 w-1/2 rounded bg-gray-200" />
                    </div>
                  ))}
                </div>
              ) : upcomingEvents.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">No upcoming events</p>
              ) : (
                <div className="space-y-3">
                  {upcomingEvents.map(event => (
                    <Link key={event.id} href={event.link}>
                      <div className="mb-2 rounded-lg border p-3 transition-colors hover:bg-gray-50">
                        <div className="mb-1 flex items-center gap-2">
                          <Badge variant="outline" className={getEventColor(event.type)}>
                            {getEventIcon(event.type)}
                          </Badge>
                          <span className="truncate text-sm font-medium">{event.title}</span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {formatTime(event.startTime)} • {event.enrolledCount} enrolled
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Legend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span className="text-sm">Class</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-purple-500" />
                  <span className="text-sm">Clinic</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="text-sm">Course Start</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">This Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <p className="text-2xl font-bold text-blue-500">
                    {events.filter(e => e.type === 'class').length}
                  </p>
                  <p className="text-xs text-gray-500">Classes</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <p className="text-2xl font-bold text-purple-600">
                    {events.filter(e => e.type === 'clinic').length}
                  </p>
                  <p className="text-xs text-gray-500">Clinics</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
