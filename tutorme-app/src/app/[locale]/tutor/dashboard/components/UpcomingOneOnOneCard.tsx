'use client'

import { format } from 'date-fns'
import { Calendar, Clock, User, Video, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ClampedTitle } from '@/components/common/clamped-title'

type OneOnOneStudent = {
  userId?: string | null
  handle?: string | null
  email?: string | null
  image?: string | null
}

type OneOnOneBooking = {
  requestId: string
  requestedDate: string
  startTime: string
  endTime: string
  timezone: string
  status: string
  durationMinutes?: number | null
  costPerSession: number
  currency?: string | null
  student?: OneOnOneStudent | null
}

interface UpcomingOneOnOneCardProps {
  request: OneOnOneBooking
  joiningRequestId?: string | null
  onJoinOneOnOne: (requestId: string) => void
}

function getOneOnOneScheduledAt(request: OneOnOneBooking): Date {
  const base = new Date(request.requestedDate)
  const [h, m] = request.startTime.split(':').map(Number)
  if (Number.isFinite(h) && Number.isFinite(m)) {
    base.setHours(h, m, 0, 0)
  }
  return base
}

function durationLabel(request: OneOnOneBooking): string | null {
  let mins = request.durationMinutes ?? 0
  if (!mins && request.startTime && request.endTime) {
    const [sh, sm] = request.startTime.split(':').map(Number)
    const [eh, em] = request.endTime.split(':').map(Number)
    if ([sh, sm, eh, em].every(n => Number.isFinite(n))) {
      mins = eh * 60 + em - (sh * 60 + sm)
    }
  }
  return mins > 0 ? `${mins} min` : null
}

function studentDisplayName(student?: OneOnOneStudent | null): string {
  if (student?.handle) return student.handle
  if (student?.email) return student.email.split('@')[0]
  return 'Student'
}

function statusBadgeClass(status: string) {
  const s = status.toUpperCase()
  if (s === 'PAID') return 'border-emerald-200 bg-emerald-100 text-emerald-700'
  if (s === 'ACCEPTED') return 'border-blue-200 bg-blue-100 text-blue-600'
  if (s === 'PENDING') return 'border-amber-200 bg-amber-100 text-amber-700'
  return 'border-slate-200 bg-slate-100 text-slate-600'
}

export function UpcomingOneOnOneCard({
  request,
  joiningRequestId,
  onJoinOneOnOne,
}: UpcomingOneOnOneCardProps) {
  const scheduledAt = getOneOnOneScheduledAt(request)
  const isPaid = request.status.toUpperCase() === 'PAID'
  const isJoining = joiningRequestId === request.requestId

  const description = `1-on-1 with ${studentDisplayName(request.student)} · ${request.timezone}`

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-l-4 border-slate-200 border-l-blue-500 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-blue-200 bg-blue-100 text-[10px] uppercase tracking-wide text-blue-600"
          >
            Booking
          </Badge>
          <span className="truncate text-sm font-semibold text-slate-900">
            {studentDisplayName(request.student)}
          </span>
          <Badge
            variant="outline"
            className={cn('text-[10px] uppercase tracking-wide', statusBadgeClass(request.status))}
          >
            {request.status}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1 leading-none">
            <Calendar className="h-3 w-3 -translate-y-px" />
            {format(scheduledAt, 'EEEE, MMM d, h:mm a')}
          </span>
          <span className="flex items-center gap-1 leading-none">
            <Clock className="h-3 w-3 -translate-y-px" />
            {request.startTime}–{request.endTime}
          </span>
          {durationLabel(request) && (
            <span className="flex items-center gap-1 leading-none">
              <Timer className="h-3 w-3 -translate-y-px" />
              {durationLabel(request)}
            </span>
          )}
          <span className="flex items-center gap-1 leading-none">
            <User className="h-3 w-3 -translate-y-px" />
            {request.currency ?? 'USD'} {request.costPerSession}
          </span>
        </div>

        <div className="text-xs text-slate-500">{request.timezone}</div>
      </div>

      <div className="mx-4 hidden h-[44px] min-w-0 flex-1 flex-col justify-center rounded-md border border-slate-200 bg-white px-3 sm:flex">
        <ClampedTitle text={description} className="text-xs text-slate-600">
          {description}
        </ClampedTitle>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isPaid ? (
          <Button
            size="sm"
            disabled={isJoining}
            onClick={() => onJoinOneOnOne(request.requestId)}
            className="bg-blue-500 text-white transition-all duration-200 hover:bg-blue-500"
          >
            <Video className="mr-1 h-3 w-3 -translate-y-px" />
            {isJoining ? 'Opening…' : 'Join session'}
          </Button>
        ) : (
          <Badge
            variant="outline"
            className="border-slate-200 bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600"
          >
            Awaiting payment
          </Badge>
        )}
      </div>
    </div>
  )
}
