'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, startOfDay } from 'date-fns'
import { Calendar, Clock, Users, Video, MapPin, BookOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ClampedTitle } from '@/components/common/clamped-title'
import { cn } from '@/lib/utils'
import type { ClassItem } from './DashboardCalendar'

interface StudentSessionsPanelProps {
  classes: ClassItem[]
  loading?: boolean
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function StudentSessionsPanel({ classes, loading }: StudentSessionsPanelProps) {
  const router = useRouter()

  const groups = useMemo(() => {
    const map = new Map<number, ClassItem[]>()
    for (const cls of classes) {
      const key = startOfDay(new Date(cls.scheduledAt)).getTime()
      const group = map.get(key) ?? []
      group.push(cls)
      map.set(key, group)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([key, items]) => ({ date: new Date(key), items }))
  }, [classes])

  return (
    <Card className="flex h-full flex-col overflow-hidden border border-slate-200 bg-white/95 shadow-[0_4px_14px_rgba(0,0,0,0.08)] backdrop-blur-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Calendar className="h-5 w-5 text-slate-600" />
          Upcoming Sessions
        </CardTitle>
      </CardHeader>
      <CardContent className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground text-sm">Loading your sessions…</p>
          </div>
        ) : classes.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-gray-200 bg-gray-50/60 py-10 text-center">
            <BookOpen className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="text-muted-foreground font-medium">There are no upcoming sessions.</p>
            <p className="text-muted-foreground/70 mt-1 text-xs">
              Sessions from your enrolled courses will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(group => (
              <div key={group.date.toISOString()} className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  {format(group.date, 'EEEE, MMMM d, yyyy')}
                </h3>
                <div className="space-y-3">
                  {group.items.map(cls => {
                    const isLive = cls.status === 'live'
                    const description = cls.courseDescription?.trim() || 'No description available.'
                    return (
                      <div
                        key={cls.id}
                        className="flex flex-col gap-3 rounded-[14px] border border-[rgba(0,0,0,0.04)] bg-[#FFFFFF] p-3 shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                      >
                        {cls.tutorAvatarUrl ? (
                          <img
                            src={cls.tutorAvatarUrl}
                            alt={cls.tutorName}
                            className="h-10 w-10 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-500">
                            {cls.tutorName.charAt(0).toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="truncate font-medium text-gray-900">
                              {cls.courseName || cls.title}
                            </h4>
                            <Badge
                              variant="secondary"
                              className={cn(
                                'text-[10px]',
                                isLive
                                  ? 'animate-pulse gap-1 bg-emerald-100 text-emerald-700'
                                  : 'bg-blue-100 text-blue-700'
                              )}
                            >
                              {isLive && (
                                <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-emerald-500" />
                              )}
                              {isLive ? 'Live' : 'Scheduled'}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground text-xs">
                            {cls.courseName ? cls.title : cls.subject}
                          </p>

                          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatShortDate(cls.scheduledAt)}
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
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {cls.students}/{cls.maxStudents} students
                            </span>
                            <span>Tutor: {cls.tutorName}</span>
                          </div>
                        </div>

                        <div className="mx-4 hidden h-[44px] min-w-0 flex-1 flex-col justify-center rounded-md border border-slate-200 bg-white px-3 sm:flex">
                          <ClampedTitle text={description} className="text-xs text-slate-600">
                            {description}
                          </ClampedTitle>
                        </div>

                        {cls.sessionId ? (
                          <Button
                            size="sm"
                            className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-500"
                            onClick={() => router.push(`/call/${cls.sessionId}`)}
                          >
                            {isLive ? 'Join' : 'Enter'}
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="shrink-0" asChild>
                            <Link href={`/student/courses/${cls.id}`}>Details</Link>
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
