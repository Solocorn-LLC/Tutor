'use client'

import { format } from 'date-fns'
import { Calendar, Clock, Users, MonitorPlay, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

export function UpcomingSessionCard({
  session,
  course,
  onOpenClassroom,
  onOpenSchedule,
}: UpcomingSessionCardProps) {
  const isLive = ['active', 'live'].includes(session.status.toLowerCase())
  const isCurrentlyInSession = isLive && !session.tutorLeftAt

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
          <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] text-white/90">
            {course.variantCategory || course.categories?.[0] || 'General'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/80">
          <span className="flex items-center gap-1 leading-none">
            <Calendar className="h-3 w-3 -translate-y-px" />
            {session.scheduledAt
              ? format(new Date(session.scheduledAt), 'EEEE, MMM d, h:mm a')
              : 'TBD'}
          </span>
          <span className="flex items-center gap-1 leading-none">
            <Clock className="h-3 w-3 -translate-y-px" />
            {session.duration ? `${session.duration} min` : '—'}
          </span>
          <span className="flex items-center gap-1 leading-none">
            <Users className="h-3 w-3 -translate-y-px" />
            {session.enrolledStudents ?? 0} / {session.maxStudents ?? 50}
          </span>
          {formatSchedulePattern(course.schedule) ? (
            <span className="flex items-center gap-1 leading-none">
              <CalendarClock className="h-3 w-3 -translate-y-px" />
              {formatSchedulePattern(course.schedule)}
            </span>
          ) : null}
          {session.scheduledAt && <SessionCountdown scheduledAt={session.scheduledAt} />}
          {course.nationality && course.nationality !== 'Global' && (
            <CountryFlag countryName={course.nationality} size="xs" showLabel />
          )}
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
            <CalendarClock className="mr-1 h-3 w-3 -translate-y-px" />
            Schedule
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onOpenClassroom(course, session.id)}
          title={
            isCurrentlyInSession
              ? 'You are currently in this session'
              : isLive
                ? 'You left this session; it is still running for students'
                : 'Open classroom'
          }
          className="min-w-[110px] justify-center whitespace-nowrap border border-emerald-500 bg-emerald-500 text-white transition-all duration-200 hover:bg-white hover:text-emerald-500"
        >
          <MonitorPlay className="mr-1 h-3 w-3 -translate-y-px" />
          {isCurrentlyInSession ? 'Join now' : isLive ? 'Rejoin' : 'Classroom'}
        </Button>
      </div>
    </div>
  )
}
