'use client'

/**
 * Per-course classroom lobby. Entered before/around a session's time. Shows the
 * next session with a live countdown, past sessions to review, and:
 *  - in-lobby toast alerts at 20/10/5/1 minutes before the next session
 *  - web-push opt-in so reminders reach the user when they're not here
 *  - auto-handoff into the session: a STUDENT is auto-sent in once the session
 *    goes live (tutor present); a TUTOR auto-starts it when its time arrives
 *    while they're in the lobby (their presence takes the class live).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Bell, Calendar, Clock, Loader2, PlayCircle, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ensurePushSubscription, isPushSupported } from '@/lib/push/client'
import { categorizeLobbySessions } from '@/lib/classroom/lobby-sessions'

interface LobbySession {
  id: string
  title: string
  scheduledAt: string | null
  startedAt: string | null
  endedAt: string | null
  status: string
  isVirtual?: boolean
  durationMinutes?: number
  recordingUrl?: string | null
}

const ALERT_THRESHOLDS = [20, 10, 5, 1] // minutes before start

export function ClassroomLobby({
  courseId,
  role,
}: {
  courseId: string
  role: 'student' | 'tutor'
}) {
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const withLocale = useCallback((p: string) => `/${locale}${p}`, [locale])

  const [sessions, setSessions] = useState<LobbySession[]>([])
  const [courseName, setCourseName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [starting, setStarting] = useState(false)
  const [pushState, setPushState] = useState<'idle' | 'on' | 'denied' | 'unsupported'>('idle')

  const firedAlerts = useRef<Set<string>>(new Set())
  const handedOff = useRef(false)

  // --- Data: poll the role-appropriate sessions API ---
  const load = useCallback(async () => {
    const url =
      role === 'student'
        ? `/api/student/courses/${courseId}/sessions`
        : // include ended sessions so the tutor can review past ones too
          `/api/tutor/courses/${courseId}/sessions?status=scheduled,active,ended`
    try {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setSessions(Array.isArray(data.sessions) ? data.sessions : [])
      if (data.course?.name) setCourseName(data.course.name)
    } catch {
      // keep previous data on transient errors
    } finally {
      setLoading(false)
    }
  }, [courseId, role])

  useEffect(() => {
    load()
    const poll = setInterval(load, 15_000)
    return () => clearInterval(poll)
  }, [load])

  // 1-second clock for the countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Opt into web push on entry (best-effort; silent if unsupported).
  useEffect(() => {
    if (!isPushSupported()) {
      setPushState('unsupported')
      return
    }
    ensurePushSubscription().then(r => {
      setPushState(r === 'subscribed' ? 'on' : r === 'denied' ? 'denied' : 'unsupported')
    })
  }, [])

  const { nextSession, pastSessions } = useMemo(() => categorizeLobbySessions(sessions), [sessions])

  const msUntilStart =
    nextSession?.scheduledAt != null ? new Date(nextSession.scheduledAt).getTime() - now : null
  const isNextLive = nextSession?.status === 'active' || nextSession?.status === 'live'

  // --- In-lobby countdown alerts (20/10/5/1 min) ---
  useEffect(() => {
    if (!nextSession || msUntilStart == null || msUntilStart <= 0) return
    const minutesLeft = msUntilStart / 60_000
    for (const t of ALERT_THRESHOLDS) {
      const key = `${nextSession.id}:${t}`
      if (minutesLeft <= t && minutesLeft > t - 0.5 && !firedAlerts.current.has(key)) {
        firedAlerts.current.add(key)
        toast.info(`"${nextSession.title}" starts in ${t === 1 ? '1 minute' : `${t} minutes`}.`, {
          icon: <Bell className="h-4 w-4" />,
        })
      }
    }
  }, [nextSession, msUntilStart])

  const goToSession = useCallback(
    (sessionId: string) => {
      router.push(
        withLocale(
          role === 'student'
            ? `/student/feedback?sessionId=${sessionId}`
            : `/tutor/classroom?sessionId=${sessionId}`
        )
      )
    },
    [router, role, withLocale]
  )

  const startAsTutor = useCallback(
    async (sessionId: string) => {
      if (starting) return
      setStarting(true)
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
          toast.error(e?.error || 'Failed to start session')
          handedOff.current = false
          return
        }
        goToSession(sessionId)
      } catch {
        toast.error('Failed to start session')
        handedOff.current = false
      } finally {
        setStarting(false)
      }
    },
    [starting, goToSession]
  )

  // --- Auto-handoff ---
  useEffect(() => {
    if (!nextSession || handedOff.current) return
    if (role === 'student') {
      // Student: go in as soon as the tutor takes it live.
      if (isNextLive) {
        handedOff.current = true
        toast.success('Your session is live — taking you in…')
        goToSession(nextSession.id)
      }
    } else {
      // Tutor: presence takes the class live at (or after) its scheduled time.
      if (isNextLive) {
        handedOff.current = true
        goToSession(nextSession.id)
      } else if (msUntilStart != null && msUntilStart <= 0 && nextSession.status === 'scheduled') {
        handedOff.current = true
        toast.success('Starting your session…')
        startAsTutor(nextSession.id)
      }
    }
  }, [nextSession, isNextLive, msUntilStart, role, goToSession, startAsTutor])

  const countdownLabel = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000))
    const d = Math.floor(total / 86400)
    const h = Math.floor((total % 86400) / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    if (d > 0) return `${d}d ${h}h ${m}m`
    if (h > 0) return `${h}h ${m}m ${s}s`
    return `${m}m ${s}s`
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

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{courseName || 'Classroom'}</h1>
          <p className="text-sm text-slate-500">
            {role === 'tutor'
              ? 'Your session starts automatically when you stay here.'
              : "You'll be taken in automatically when the tutor starts."}
          </p>
        </div>
        {pushState !== 'on' && pushState !== 'unsupported' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              ensurePushSubscription().then(r =>
                setPushState(r === 'subscribed' ? 'on' : r === 'denied' ? 'denied' : 'unsupported')
              )
            }
          >
            <Bell className="mr-1.5 h-4 w-4" />
            {pushState === 'denied' ? 'Notifications blocked' : 'Enable reminders'}
          </Button>
        )}
      </div>

      {/* Next session */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Next session</p>
        {!nextSession ? (
          <p className="mt-3 text-sm text-slate-500">No upcoming sessions scheduled.</p>
        ) : (
          <>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{nextSession.title}</h2>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
              <Calendar className="h-4 w-4" />
              {fmt(nextSession.scheduledAt)}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              {isNextLive ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Live now
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 text-2xl font-bold tabular-nums text-slate-900">
                  <Clock className="h-5 w-5 text-slate-400" />
                  {msUntilStart != null && msUntilStart > 0
                    ? countdownLabel(msUntilStart)
                    : '0m 0s'}
                </span>
              )}
              {role === 'tutor' ? (
                <Button onClick={() => startAsTutor(nextSession.id)} disabled={starting}>
                  {starting ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Video className="mr-1.5 h-4 w-4" />
                  )}
                  {isNextLive ? 'Join now' : 'Start now'}
                </Button>
              ) : (
                isNextLive && (
                  <Button onClick={() => goToSession(nextSession.id)}>
                    <Video className="mr-1.5 h-4 w-4" /> Join now
                  </Button>
                )
              )}
            </div>
          </>
        )}
      </div>

      {/* Past sessions to review */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Past sessions — review
        </p>
        {pastSessions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No past sessions yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {pastSessions.map(s => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
              >
                <button onClick={() => goToSession(s.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium text-slate-800">{s.title}</p>
                  <p className="text-xs text-slate-500">{fmt(s.scheduledAt)}</p>
                </button>
                {s.recordingUrl ? (
                  <a
                    href={s.recordingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    <PlayCircle className="h-3.5 w-3.5" /> Recording
                  </a>
                ) : (
                  <PlayCircle className="h-4 w-4 shrink-0 text-slate-300" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
