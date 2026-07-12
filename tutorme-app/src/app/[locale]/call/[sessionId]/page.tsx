'use client'

/**
 * Dedicated two-way video room for a 1-on-1 session — used by BOTH the student
 * and the tutor (the course classrooms are role-specific and can't host a
 * course-less 1-on-1). Mints a join token via /api/class/rooms/[id]/join (which
 * grants the student a broadcast-capable token for capacity-2 sessions) and
 * renders DailyVideoFrame in two-way mode so each person sees the other's video.
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Loader2, ArrowLeft } from 'lucide-react'
import { DailyVideoFrame } from '@/components/class/daily-video-frame'

interface JoinState {
  loading: boolean
  roomUrl?: string | null
  token?: string | null
  isTutor?: boolean
  twoWay?: boolean
  error?: string
}

export default function OneOnOneCallPage() {
  const { data: session } = useSession()
  const params = useParams()
  const router = useRouter()
  const sessionId = (params?.sessionId as string) || ''
  const [state, setState] = useState<JoinState>({ loading: true })

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    ;(async () => {
      try {
        const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
        const csrfToken = (await csrfRes.json().catch(() => ({})))?.token ?? null
        const res = await fetch(`/api/class/rooms/${sessionId}/join`, {
          method: 'POST',
          credentials: 'include',
          headers: { ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setState({ loading: false, error: data?.error || 'Could not join the session.' })
          return
        }
        const tutorId = data?.session?.tutorId
        const isTutor =
          tutorId && session?.user?.id
            ? tutorId === session.user.id
            : session?.user?.role === 'TUTOR'
        setState({
          loading: false,
          roomUrl: data?.roomUrl ?? null,
          token: data?.token ?? null,
          isTutor,
          // Server flags 1-on-1 (capacity 2) as two-way; default true on this route.
          twoWay: data?.twoWay ?? true,
          error: data?.videoError || undefined,
        })
      } catch {
        if (!cancelled) setState({ loading: false, error: 'Could not join the session.' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, session?.user?.id, session?.user?.role])

  if (state.loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-white/70" />
      </div>
    )
  }

  if (!state.roomUrl) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-white">
        <p className="text-lg font-semibold">Couldn’t start the session</p>
        <p className="max-w-md text-sm text-white/70">
          {state.error || 'No video room is available for this session yet.'}
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
    <div className="h-screen w-full bg-black">
      <DailyVideoFrame
        roomUrl={state.roomUrl}
        token={state.token}
        isTutor={state.isTutor}
        twoWay={state.twoWay}
        className="h-full w-full rounded-none border-0"
      />
    </div>
  )
}
