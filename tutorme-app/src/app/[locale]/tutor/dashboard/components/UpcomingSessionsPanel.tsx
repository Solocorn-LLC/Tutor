'use client'

import { useMemo } from 'react'
import { format, startOfDay } from 'date-fns'
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

  const groups = useMemo(() => {
    const map = new Map<number, SessionItem[]>()
    for (const item of items) {
      const key = startOfDay(item.scheduledAt).getTime()
      const group = map.get(key) ?? []
      group.push(item)
      map.set(key, group)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([key, group]) => ({ date: new Date(key), items: group }))
  }, [items])

  return (
    <Card className="flex h-full flex-col overflow-hidden border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Calendar className="h-5 w-5 text-slate-600" />
          Upcoming Sessions
        </CardTitle>
      </CardHeader>
      <CardContent className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-muted-foreground border-border/30 rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
            No upcoming sessions or 1-on-1 bookings.
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(group => (
              <div key={group.date.toISOString()} className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  {format(group.date, 'EEEE, MMMM d, yyyy')}
                </h3>
                <div className="space-y-3">
                  {group.items.map(item =>
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
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
