'use client'

/**
 * Dedicated two-way video room for a 1-on-1 session — used by BOTH the student
 * and the tutor (the course classrooms are role-specific and can't host a
 * course-less 1-on-1).
 *
 * Flow: check session status → if it isn't open yet, show a pre-join LOBBY with a
 * live countdown that brings you in automatically the moment the room opens (or
 * the tutor starts early); once open, mint a join token via
 * /api/class/rooms/[id]/join and render DailyVideoFrame in two-way mode.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Loader2, ArrowLeft, Video, CalendarClock } from 'lucide-react'
import { SessionClassroom } from '@/components/one-on-one/session-classroom'
import { formatCountdown } from '@/lib/one-on-one/format'

type Phase = 'checking' | 'lobby' | 'joining' | 'inRoom' | 'ended' | 'error'

interface LobbyInfo {
  title: string
  withName: string
  scheduledAt: string | null
  opensAt: string | null
  viewerIsTutor: boolean
}

interface VideoInfo {
  roomUrl: string | null
  token: string | null
  isTutor?: boolean
  twoWay?: boolean
  error?: string
  courseId?: string | null
  courseName?: string | null
}

const LOBBY_POLL_MS = 20_000

export default function OneOnOneCallPage() {
  const { data: session } = useSession()
  const params = useParams()
  const router = useRouter()
  const sessionId = (params?.sessionId as string) || ''

  const [phase, setPhase] = useState<Phase>('checking')
  const [lobby, setLobby] = useState<LobbyInfo | null>(null)
  const [video, setVideo] = useState<VideoInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [now, setNow] = useState(0)
  const joinStarted = useRef(false)

  /** Mint a token and enter the room (the original join flow). */
  const runJoin = useCallback(async () => {
    if (joinStarted.current) return
    joinStarted.current = true
    setPhase('joining')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    try {
      const csrfRes = await fetch('/api/csrf', {
        credentials: 'include',
        signal: controller.signal,
      })
      const csrfToken = (await csrfRes.json().catch(() => ({})))?.token ?? null
      const res = await fetch(`/api/class/rooms/${sessionId}/join`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        signal: controller.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMsg(data?.error || 'Could not join the session.')
        setPhase('error')
        return
      }
      const tutorId = data?.session?.tutorId
      const isTutor =
        tutorId && session?.user?.id ? tutorId === session.user.id : session?.user?.role === 'TUTOR'
      if (!data?.roomUrl) {
        setErrorMsg(data?.videoError || 'No video room is available for this session yet.')
        setPhase('error')
        return
      }
      setVideo({
        roomUrl: data.roomUrl,
        token: data.token ?? null,
        isTutor,
        twoWay: data?.twoWay ?? true,
        error: data?.videoError || undefined,
        courseId: data?.session?.courseId ?? null,
        courseName: data?.session?.course?.name ?? null,
      })
      setPhase('inRoom')
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'AbortError'
      setErrorMsg(
        timedOut
          ? 'Joining is taking too long. Please check your connection and try again.'
          : 'Could not join the session.'
      )
      setPhase('error')
    } finally {
      clearTimeout(timeoutId)
    }
  }, [sessionId, session?.user?.id, session?.user?.role])

  /** Check status; open the room if joinable, otherwise show the lobby. */
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/one-on-one/session-status?sessionId=${encodeURIComponent(sessionId)}`,
        { credentials: 'include' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // No status (e.g. an odd/legacy session) — fall back to attempting the join.
        void runJoin()
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
      if (data.joinable) void runJoin()
      else setPhase('lobby')
    } catch {
      void runJoin()
    }
  }, [sessionId, runJoin])

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
      if (t >= opensAtMs) void runJoin()
    }, 1000)
    const poll = setInterval(checkStatus, LOBBY_POLL_MS)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [phase, lobby?.opensAt, checkStatus, runJoin])

  // --- Render ---

  if (phase === 'checking' || phase === 'joining') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-white/70" />
        {phase === 'joining' ? <p className="text-sm text-white/50">Joining…</p> : null}
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
          The 1-on-1 is over. You can leave a review from your dashboard.
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

  if (phase === 'error' || !video?.roomUrl) {
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

  return (
    <SessionClassroom
      sessionId={sessionId}
      roomUrl={video.roomUrl}
      token={video.token}
      isTutor={video.isTutor}
      twoWay={video.twoWay}
      courseId={video.courseId ?? null}
      courseName={video.courseName ?? null}
      onRefreshToken={runJoin}
    />
  )
}
