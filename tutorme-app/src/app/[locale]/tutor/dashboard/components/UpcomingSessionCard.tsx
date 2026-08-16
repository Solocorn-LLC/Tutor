'use client'

import { format } from 'date-fns'
import { Calendar, Clock, Users, MonitorPlay, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CountryFlag } from '@/components/country-flag'
import { ClampedTitle } from '@/components/common/clamped-title'
import { SessionCountdown } from './SessionCountdown'
import type { UpcomingClass } from './UpcomingClassesCard'
import type { EnrolledCourse } from '../page'

interface UpcomingSessionCardProps {
  session: UpcomingClass
  course: EnrolledCourse
  onOpenClassroom: (course: EnrolledCourse, sessionId: string) => void
  onOpenSchedule?: (course: EnrolledCourse) => void
}

const DAYS: Record<string, string> = {
  sunday: 'Sun',
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
}

function formatSchedulePattern(schedule?: EnrolledCourse['schedule']): string | null {
  if (!schedule || schedule.length === 0) return null
  const slots = schedule.map(slot => {
    const day = DAYS[slot.dayOfWeek.toLowerCase()] || slot.dayOfWeek
    return `${day} ${slot.startTime}`
  })
  return slots.join(', ')
}

function statusBadgeClass(status: string) {
  const s = status.toLowerCase()
  if (s === 'active' || s === 'live') {
    return 'border-emerald-200 bg-emerald-100 text-emerald-700'
  }
  if (s === 'preparing' || s === 'paused') {
    return 'border-amber-200 bg-amber-100 text-amber-700'
  }
  if (s === 'ended' || s === 'cancelled') {
    return 'border-slate-200 bg-slate-100 text-slate-600'
  }
  return 'border-blue-200 bg-blue-100 text-blue-700'
}

export function UpcomingSessionCard({
  session,
  course,
  onOpenClassroom,
  onOpenSchedule,
}: UpcomingSessionCardProps) {
  const isLive = ['active', 'live'].includes(session.status.toLowerCase())

  const description = session.description?.trim() || 'No description'

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-600 bg-slate-700 p-4 text-white shadow-sm transition-all duration-200 hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-white/20 bg-white/10 text-[10px] uppercase tracking-wide text-white"
          >
            Course Session
          </Badge>
          <span className="truncate text-sm font-semibold text-white">{course.name}</span>
          <Badge
            variant="outline"
            className={cn('text-[10px] uppercase tracking-wide', statusBadgeClass(session.status))}
          >
            {session.status}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/80">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {session.scheduledAt
              ? format(new Date(session.scheduledAt), 'EEEE, MMM d, h:mm a')
              : 'TBD'}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {session.duration ? `${session.duration} min` : '—'}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {session.enrolledStudents ?? 0} / {session.maxStudents ?? 50}
          </span>
          {course.nationality && course.nationality !== 'Global' && (
            <CountryFlag countryName={course.nationality} size="xs" showLabel />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-white/80">
          <span className="rounded-full bg-white/10 px-2 py-0.5">
            {course.variantCategory || course.categories?.[0] || 'General'}
          </span>
          {formatSchedulePattern(course.schedule) ? (
            <span className="flex items-center gap-1">
              <CalendarClock className="h-3 w-3" />
              {formatSchedulePattern(course.schedule)}
            </span>
          ) : null}
          {session.scheduledAt && <SessionCountdown scheduledAt={session.scheduledAt} />}
        </div>
      </div>

      <div className="mx-4 hidden h-[44px] min-w-0 flex-1 flex-col justify-center rounded-md border border-slate-200 bg-white px-3 sm:flex">
        <ClampedTitle text={description} className="text-xs text-slate-600">
          {description}
        </ClampedTitle>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {onOpenSchedule && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenSchedule(course)}
            className="border-slate-300 bg-white text-slate-700 transition-all duration-200 hover:border-white hover:bg-slate-800 hover:text-white"
          >
            <CalendarClock className="mr-1 h-3 w-3" />
            Schedule
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onOpenClassroom(course, session.id)}
          className="border border-emerald-500 bg-emerald-500 text-white transition-all duration-200 hover:bg-white hover:text-emerald-500"
        >
          <MonitorPlay className="mr-1 h-3 w-3" />
          {isLive ? 'Rejoin live' : 'Classroom'}
        </Button>
      </div>
    </div>
  )
}
