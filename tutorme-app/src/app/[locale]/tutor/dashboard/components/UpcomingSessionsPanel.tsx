'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import { Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { UpcomingClass } from './UpcomingClassesCard'
import { UpcomingSessionCard } from './UpcomingSessionCard'
import { UpcomingOneOnOneCard } from './UpcomingOneOnOneCard'

// Import types from the parent page so we stay in sync with its data model.
import type { EnrolledCourse, OneOnOneRequest } from '../page'

type SessionItem =
  | {
      kind: 'session'
      id: string
      scheduledAt: Date
      session: UpcomingClass
      course: EnrolledCourse
    }
  | {
      kind: 'one-on-one'
      id: string
      scheduledAt: Date
      request: OneOnOneRequest
    }

interface UpcomingSessionsPanelProps {
  classes: UpcomingClass[]
  courses: EnrolledCourse[]
  oneOnOneRequests: OneOnOneRequest[]
  joiningRequestId?: string | null
  onJoinOneOnOne: (requestId: string) => void
  onOpenClassroom: (course: EnrolledCourse, sessionId: string) => void
  onOpenSchedule?: (course: EnrolledCourse) => void
}

function getOneOnOneScheduledAt(request: OneOnOneRequest): Date {
  const base = new Date(request.requestedDate)
  const [h, m] = request.startTime.split(':').map(Number)
  if (Number.isFinite(h) && Number.isFinite(m)) {
    base.setHours(h, m, 0, 0)
  }
  return base
}

export function UpcomingSessionsPanel({
  classes,
  courses,
  oneOnOneRequests,
  joiningRequestId,
  onJoinOneOnOne,
  onOpenClassroom,
  onOpenSchedule,
}: UpcomingSessionsPanelProps) {
  const items = useMemo<SessionItem[]>(() => {
    const now = Date.now()
    const sessionGrace = 5 * 60 * 1000
    const bookingGrace = 24 * 60 * 60 * 1000

    const list: SessionItem[] = []

    for (const session of classes) {
      const scheduledAt = session.scheduledAt ? new Date(session.scheduledAt).getTime() : null
      if (scheduledAt == null) continue
      const status = session.status.toLowerCase()
      const isActionable =
        status === 'scheduled' ||
        status === 'active' ||
        status === 'live' ||
        status === 'paused' ||
        status === 'preparing'
      if (!isActionable || scheduledAt < now - sessionGrace) continue

      const course = courses.find(c => c.id === session.courseId)
      if (!course) continue

      list.push({
        kind: 'session',
        id: session.id,
        scheduledAt: new Date(scheduledAt),
        session,
        course,
      })
    }

    for (const request of oneOnOneRequests) {
      const status = request.status.toUpperCase()
      if (status !== 'PAID' && status !== 'ACCEPTED') continue
      const scheduledAt = getOneOnOneScheduledAt(request).getTime()
      if (scheduledAt < now - bookingGrace) continue

      list.push({
        kind: 'one-on-one',
        id: request.requestId,
        scheduledAt: new Date(scheduledAt),
        request,
      })
    }

    list.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
    return list
  }, [classes, courses, oneOnOneRequests])

  const todayLabel = format(new Date(), 'EEEE, MMMM d, yyyy')

  return (
    <Card className="flex h-full flex-col overflow-hidden border-white/10 bg-[#36454F]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-white">
          <Calendar className="h-5 w-5" />
          Upcoming Sessions
        </CardTitle>
        <span className="text-sm text-white/60">{todayLabel}</span>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-muted-foreground border-border/30 rounded-lg border border-dashed p-6 text-center text-sm text-white/70">
            No upcoming sessions or 1-on-1 bookings.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item =>
              item.kind === 'session' ? (
                <UpcomingSessionCard
                  key={item.id}
                  session={item.session}
                  course={item.course}
                  onOpenClassroom={onOpenClassroom}
                  onOpenSchedule={onOpenSchedule}
                />
              ) : (
                <UpcomingOneOnOneCard
                  key={item.id}
                  request={item.request}
                  joiningRequestId={joiningRequestId}
                  onJoinOneOnOne={onJoinOneOnOne}
                />
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
