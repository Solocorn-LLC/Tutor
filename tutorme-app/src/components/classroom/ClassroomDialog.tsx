'use client'

/**
 * Classroom popup dialog — replaces the Classroom lobby page for tutors.
 * Shows the next upcoming session with countdown, and a list of all
 * sessions (upcoming + past) that navigates to the actual classroom when
 * a session is clicked.
 *
 * Design basis: the Sessions dialog (DialogContent styling, session cards,
 * status badges, etc.) from the tutor dashboard.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Calendar,
  Clock,
  Loader2,
  PlayCircle,
  Video,
  Users,
  AlertCircle,
  Presentation,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CountryFlag } from '@/components/country-flag'
import { categorizeLobbySessions } from '@/lib/classroom/lobby-sessions'

export interface ClassroomDialogSession {
  id: string
  title: string
  scheduledAt: string | null
  startedAt: string | null
  endedAt: string | null
  status: string
  isVirtual?: boolean
  durationMinutes?: number
  recordingUrl?: string | null
  enrolledStudents?: number
  maxStudents?: number
  scheduleId?: string | null
  scheduleName?: string | null
  description?: string | null
}

export interface ClassroomDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  courseId: string | null
  courseName: string
  nationality?: string | null
  variantCategory?: string | null
  categories?: string[] | null
}

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'TBD'

function countdownLabel(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

export function ClassroomDialog({
  open,
  onOpenChange,
  courseId,
  courseName,
  nationality,
  variantCategory,
  categories,
}: ClassroomDialogProps) {
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const withLocale = useCallback((p: string) => `/${locale}${p}`, [locale])

  const [sessions, setSessions] = useState<ClassroomDialogSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // 1-second clock for countdown
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [open])

  // Load sessions when dialog opens
  useEffect(() => {
    if (!open || !courseId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setSessions([])

    const load = async () => {
      try {
        const res = await fetch(`/api/tutor/courses/${courseId}/sessions`, {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          if (!cancelled) setError(err.error || res.statusText || 'Failed to load sessions')
          return
        }
        const data = await res.json()
        if (!cancelled) setSessions(data.sessions || [])
      } catch {
        if (!cancelled) setError('Network error. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const poll = setInterval(load, 15_000)
    return () => {
      cancelled = true
      clearInterval(poll)
    }
  }, [open, courseId])

  const { nextSession, pastSessions } = useMemo(() => categorizeLobbySessions(sessions), [sessions])

  const msUntilStart =
    nextSession?.scheduledAt != null ? new Date(nextSession.scheduledAt).getTime() - now : null
  const isNextLive = nextSession?.status === 'active' || nextSession?.status === 'live'

  const goToSession = useCallback(
    (sessionId: string) => {
      router.push(withLocale(`/tutor/classroom?sessionId=${sessionId}`))
    },
    [router, withLocale]
  )

  const startAsTutor = useCallback(
    async (sessionId: string) => {
      try {
        const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
        const csrf = (await csrfRes.json().catch(() => ({})))?.token ?? null
        const res = await fetch(`/api/tutor/classes/${sessionId}`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
          },
        })
        if (!res.ok) {
          const e = await res.json().catch(() => ({}))
          // eslint-disable-next-line no-console
          console.error('Failed to start session:', e)
          return
        }
        goToSession(sessionId)
      } catch {
        // eslint-disable-next-line no-console
        console.error('Failed to start session')
      }
    },
    [goToSession]
  )

  const titleDisplay =
    nationality && nationality !== 'Global' ? (
      <span className="inline-flex items-center gap-1">
        {courseName} — {variantCategory || categories?.[0] || 'General'} —{' '}
        <CountryFlag countryName={nationality} size="xs" showLabel />
      </span>
    ) : (
      courseName
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border border-slate-200 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Presentation className="text-primary h-5 w-5" />
            Classroom
          </DialogTitle>
          <DialogDescription className="text-white/80">
            <>
              Next session and history for <strong>{titleDisplay}</strong>
            </>
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 text-white">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="text-primary h-8 w-8 animate-spin" />
            </div>
          ) : error ? (
            <div className="border-destructive/20 rounded-lg border border-dashed p-6 text-center text-sm">
              <AlertCircle className="text-destructive/50 mx-auto mb-2 h-8 w-8" />
              <p className="text-destructive font-medium">Failed to load sessions</p>
              <p className="text-muted-foreground mt-1 text-xs">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 transition-all duration-200"
                onClick={() => {
                  setError(null)
                  setLoading(true)
                  // re-trigger useEffect by toggling a dummy state or just re-fetch inline
                  if (courseId) {
                    fetch(`/api/tutor/courses/${courseId}/sessions`, {
                      credentials: 'include',
                      cache: 'no-store',
                    })
                      .then(async res => {
                        if (!res.ok) throw new Error()
                        const data = await res.json()
                        setSessions(data.sessions || [])
                        setError(null)
                      })
                      .catch(() => setError('Network error. Please try again.'))
                      .finally(() => setLoading(false))
                  }
                }}
              >
                Retry
              </Button>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-muted-foreground border-border/30 rounded-lg border border-dashed p-6 text-center text-sm">
              <Calendar className="text-muted-foreground/50 mx-auto mb-2 h-8 w-8" />
              <p>No sessions found for this course.</p>
              <p className="mt-1 text-xs">
                Sessions are created from the time slots in the course schedule.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Next session card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Next session
                </p>
                {!nextSession ? (
                  <p className="mt-3 text-sm text-slate-500">No upcoming sessions scheduled.</p>
                ) : (
                  <>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">
                      {nextSession.title}
                    </h2>
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                      <Calendar className="h-4 w-4" />
                      {fmt(nextSession.scheduledAt)}
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      {isNextLive ? (
                        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />{' '}
                          Live now
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-2xl font-bold tabular-nums text-slate-900">
                          <Clock className="h-5 w-5 text-slate-400" />
                          {msUntilStart != null && msUntilStart > 0
                            ? countdownLabel(msUntilStart)
                            : '0m 0s'}
                        </span>
                      )}
                      <Button
                        onClick={() => {
                          if (isNextLive) {
                            goToSession(nextSession.id)
                          } else {
                            startAsTutor(nextSession.id)
                          }
                        }}
                        className="transition-all duration-200"
                      >
                        <Video className="mr-1.5 h-4 w-4" />
                        {isNextLive ? 'Join now' : 'Start now'}
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {/* All sessions list */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  All sessions
                </p>
                <div className="scrollbar-hide mt-3 max-h-[360px] space-y-3 overflow-y-auto pr-2">
                  {sessions.map(session => {
                    const isVirtual = session.isVirtual === true
                    const isActive = session.status === 'active'
                    const isEnded = session.status === 'ended'
                    const isScheduled = session.status === 'scheduled'
                    const isPast =
                      session.scheduledAt &&
                      new Date(session.scheduledAt).getTime() < Date.now() - 5 * 60 * 1000

                    // For virtual sessions, compute dynamic status
                    let displayStatus = session.status
                    if (isVirtual && session.scheduledAt) {
                      const diff = new Date(session.scheduledAt).getTime() - Date.now()
                      if (diff <= 0) displayStatus = 'opening_soon'
                      else if (diff <= 60 * 60 * 1000) displayStatus = 'opening_soon'
                      else displayStatus = 'upcoming'
                    }

                    const badgeClass =
                      isActive || displayStatus === 'active'
                        ? 'bg-success/15 text-success border-success/25'
                        : isEnded
                          ? 'bg-muted text-muted-foreground border-border/30'
                          : displayStatus === 'opening_soon'
                            ? 'bg-warning/15 text-warning border-warning/25'
                            : 'bg-info/15 text-info border-info/25'

                    const canClick = !isVirtual && (isActive || isEnded || (isScheduled && !isPast))

                    return (
                      <div
                        key={session.id}
                        className={cn(
                          'border-border/30 bg-card flex items-center justify-between rounded-lg border p-3 transition-all duration-200',
                          canClick
                            ? 'hover:border-border/50 cursor-pointer hover:bg-white'
                            : 'opacity-80'
                        )}
                        onClick={() => {
                          if (canClick) goToSession(session.id)
                        }}
                        title={
                          isVirtual
                            ? 'This scheduled slot opens automatically'
                            : canClick
                              ? 'Click to enter the classroom'
                              : undefined
                        }
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium text-gray-900">{session.title}</p>
                            <Badge
                              variant="outline"
                              className={cn('text-[10px] uppercase tracking-wide', badgeClass)}
                            >
                              {displayStatus}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] uppercase tracking-wide',
                                isVirtual || session.scheduleId
                                  ? 'bg-info/10 text-info border-info/25'
                                  : 'bg-warning/10 text-warning border-warning/25'
                              )}
                            >
                              {isVirtual || session.scheduleId ? 'From schedule' : 'One-time'}
                            </Badge>
                            {session.scheduleName && (
                              <Badge
                                variant="outline"
                                className="border-primary/25 bg-primary/10 text-primary text-[10px] uppercase tracking-wide"
                              >
                                {session.scheduleName}
                              </Badge>
                            )}
                          </div>
                          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            {session.scheduledAt && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(session.scheduledAt).toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                            )}
                            {session.scheduledAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(session.scheduledAt).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </span>
                            )}
                            {!isVirtual && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {session.enrolledStudents ?? 0} / {session.maxStudents ?? 50}
                              </span>
                            )}
                            {isVirtual && session.durationMinutes && (
                              <span>{session.durationMinutes} min</span>
                            )}
                          </div>
                        </div>
                        <div className="ml-2 shrink-0">
                          {session.recordingUrl ? (
                            <a
                              href={session.recordingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                              onClick={e => e.stopPropagation()}
                            >
                              <PlayCircle className="h-3.5 w-3.5" /> Recording
                            </a>
                          ) : isEnded ? (
                            <PlayCircle className="h-4 w-4 text-slate-300" />
                          ) : isActive ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-50 text-[10px] uppercase tracking-wide text-emerald-700"
                            >
                              Live
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <Separator className="my-4" />

        <div className="flex justify-end">
          <Button variant="modal-secondary-dark" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
