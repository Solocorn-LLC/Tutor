'use client'

/**
 * Thin lobby + role router for a live session (1-on-1 or group).
 *
 * The classroom itself is now the shared **course-builder** classroom — this page
 * no longer hosts its own video room. Flow: check session status → if it isn't open
 * yet, show a pre-join LOBBY with a live countdown that brings you in automatically
 * the moment the room opens (or the tutor starts early); once open, redirect by role
 * to the course-builder classroom (student → /student/feedback, tutor →
 * /tutor/classroom), which mints its own join token via /api/class/rooms/[id]/join.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Loader2, ArrowLeft, Video, CalendarClock } from 'lucide-react'
import { formatCountdown } from '@/lib/one-on-one/format'

type Phase = 'checking' | 'lobby' | 'redirecting' | 'ended' | 'error'

interface LobbyInfo {
  title: string
  withName: string
  scheduledAt: string | null
  opensAt: string | null
  viewerIsTutor: boolean
}

const LOBBY_POLL_MS = 20_000

export default function OneOnOneCallPage() {
  const { data: session } = useSession()
  const params = useParams()
  const router = useRouter()
  const sessionId = (params?.sessionId as string) || ''
  const locale = (params?.locale as string) || 'en'
  const viewerRoleIsTutor = session?.user?.role === 'TUTOR'

  const [phase, setPhase] = useState<Phase>('checking')
  const [lobby, setLobby] = useState<LobbyInfo | null>(null)
  const [errorMsg] = useState<string | null>(null)
  const [now, setNow] = useState(0)
  const redirectStarted = useRef(false)

  /** Hand off to the shared course-builder classroom for the viewer's role. */
  const redirectByRole = useCallback(
    (isTutor: boolean) => {
      if (redirectStarted.current) return
      redirectStarted.current = true
      setPhase('redirecting')
      const dest = isTutor
        ? `/${locale}/tutor/classroom?sessionId=${encodeURIComponent(sessionId)}`
        : `/${locale}/student/feedback?sessionId=${encodeURIComponent(sessionId)}`
      router.replace(dest)
    },
    [locale, sessionId, router]
  )

  /** Check status; hand off to the classroom if joinable, otherwise show the lobby. */
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/one-on-one/session-status?sessionId=${encodeURIComponent(sessionId)}`,
        { credentials: 'include' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // No status (e.g. an odd/legacy session) — route by the viewer's role and let
        // the classroom gate access.
        redirectByRole(viewerRoleIsTutor)
        return
      }
      if (data.ended) {
        setPhase('ended')
        return
      }
      setLobby({
        title: data.title,
        withName: data.withName,
        scheduledAt: data.scheduledAt,
        opensAt: data.opensAt,
        viewerIsTutor: !!data.viewerIsTutor,
      })
      if (data.joinable) redirectByRole(!!data.viewerIsTutor)
      else setPhase('lobby')
    } catch {
      redirectByRole(viewerRoleIsTutor)
    }
  }, [sessionId, redirectByRole, viewerRoleIsTutor])

  // Initial status check.
  useEffect(() => {
    if (!sessionId) return
    checkStatus()
  }, [sessionId, checkStatus])

  // In the lobby: tick the countdown, auto-enter when the window opens, and poll
  // so a tutor starting early pulls the student straight in.
  useEffect(() => {
    if (phase !== 'lobby') return
    setNow(Date.now())
    const opensAtMs = lobby?.opensAt ? new Date(lobby.opensAt).getTime() : Infinity

    const tick = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= opensAtMs) redirectByRole(!!lobby?.viewerIsTutor)
    }, 1000)
    const poll = setInterval(checkStatus, LOBBY_POLL_MS)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [phase, lobby?.opensAt, lobby?.viewerIsTutor, checkStatus, redirectByRole])

  // --- Render ---

  if (phase === 'checking' || phase === 'redirecting') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-white/70" />
        {phase === 'redirecting' ? <p className="text-sm text-white/50">Joining…</p> : null}
      </div>
    )
  }

  if (phase === 'lobby' && lobby) {
    const opensAtMs = lobby.opensAt ? new Date(lobby.opensAt).getTime() : NaN
    const startMs = lobby.scheduledAt ? new Date(lobby.scheduledAt).getTime() : NaN
    const startLabel = Number.isFinite(startMs)
      ? new Date(startMs).toLocaleString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-950 px-6 text-center text-white">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/15">
            <Video className="h-6 w-6 text-blue-300" />
          </span>
          <h1 className="text-lg font-semibold">{lobby.title}</h1>
          <p className="mt-1 text-sm text-white/60">
            with <span className="capitalize">{lobby.withName}</span>
          </p>

          <div className="mt-6 rounded-2xl bg-black/30 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-white/40">
              {now && Number.isFinite(startMs) && now >= startMs ? 'Room opens in' : 'Starts in'}
            </p>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-white">
              {now && Number.isFinite(opensAtMs) ? formatCountdown(opensAtMs, now) : '—:—'}
            </p>
            {startLabel ? <p className="mt-2 text-xs text-white/50">{startLabel}</p> : null}
          </div>

          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-white/50">
            <CalendarClock className="h-3.5 w-3.5" />
            We&apos;ll bring you in automatically when it opens.
          </p>

          <button
            onClick={() => router.back()}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Go back
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'ended') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-white">
        <p className="text-lg font-semibold">This session has ended</p>
        <p className="max-w-md text-sm text-white/70">
          The session is over. You can leave a review from your dashboard.
        </p>
        <button
          onClick={() => router.back()}
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          Go back
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-white">
      <p className="text-lg font-semibold">Couldn’t start the session</p>
      <p className="max-w-md text-sm text-white/70">
        {errorMsg || 'No video room is available for this session yet.'}
      </p>
      <button
        onClick={() => router.back()}
        className="mt-2 inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium hover:bg-white/10"
      >
        <ArrowLeft className="h-4 w-4" />
        Go back
      </button>
    </div>
  )
}
