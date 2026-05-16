'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Video,
  Calendar,
  Clock,
  User,
  Play,
  ExternalLink,
  AlertCircle,
  PartyPopper,
} from 'lucide-react'

interface MissedSession {
  id: string
  title: string
  subject: string
  tutorName: string
  scheduledAt: string
  endedAt: string | null
  duration: number | null
  recordingUrl: string | null
  hasRecording: boolean
  leftEarly: boolean
}

type FilterType = 'all' | 'week' | 'month'

export default function MissedClassesPage() {
  const [sessions, setSessions] = useState<MissedSession[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/student/missed-classes?filter=${filter}`)
      .then(r => r.json())
      .then(res => {
        if (res.success) setSessions(res.data.sessions)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [filter])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Video className="h-6 w-6" />
          Missed Sessions
        </h1>
        <p className="mt-1 text-gray-600">Catch up on sessions you missed with recordings</p>
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 flex gap-2">
        {(['all', 'week', 'month'] as FilterType[]).map(f => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f === 'all' ? 'All Time' : f === 'week' ? 'This Week' : 'This Month'}
          </Button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <PartyPopper className="mx-auto mb-3 h-12 w-12 text-green-400" />
            <h3 className="font-semibold text-gray-900">No missed sessions!</h3>
            <p className="mt-1 text-sm text-gray-500">
              Great job — you&apos;ve been attending all your sessions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => (
            <Card key={session.id} className="transition-shadow hover:shadow-sm">
              <CardContent className="pb-5 pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="truncate font-medium">{session.title}</h3>
                      {session.leftEarly && (
                        <Badge
                          variant="outline"
                          className="border-amber-200 text-xs text-amber-700"
                        >
                          Left early
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {session.tutorName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(session.scheduledAt)}
                      </span>
                      {session.duration && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {session.duration} min
                        </span>
                      )}
                    </div>
                    <Badge variant="secondary" className="mt-2 text-xs">
                      {session.subject}
                    </Badge>
                  </div>

                  <div className="flex-shrink-0">
                    {session.hasRecording ? (
                      <a href={session.recordingUrl!} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" className="gap-1.5">
                          <Play className="h-3.5 w-3.5" />
                          Watch Recording
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </a>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-xs text-gray-400">
                        <AlertCircle className="h-3 w-3" />
                        No recording
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
