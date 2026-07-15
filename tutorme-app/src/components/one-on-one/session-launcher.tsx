'use client'

/**
 * Global Session Launcher.
 *
 * Polls for the current user's most imminent confirmed 1-on-1 and, when one is
 * live or starting soon, floats an always-visible "Join" banner anywhere in the
 * app — with a live countdown that auto-enables Join at the 20-min entry window.
 * Solves the "I can't find where to join" problem: the way in comes to you.
 *
 * Hidden while a call overlay is already open (you're in the room), and
 * dismissible per session for the current tab.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Video, X, CreditCard } from 'lucide-react'
import { useVideoOverlayStore } from '@/stores/video-overlay-store'
import { formatCountdown } from '@/lib/one-on-one/format'
import { resumeGroupSeatPayment } from '@/lib/group-session/resume-payment'

interface LiveSession {
  sessionId: string
  scheduledAt: string
  /** Display label, e.g. "1-on-1 with Alice" or a group session's title. */
  title: string
  viewerIsTutor: boolean
  joinable: boolean
  live: boolean
  /** Booked but unpaid — show "Pay to join" instead of Join. */
  needsPayment?: boolean
  /** 1-on-1 pending payment: navigate to the payment page for this request. */
  payRequestId?: string | null
  /** Group pending payment: resume checkout for this reserved seat. */
  payParticipantId?: string | null
}

const EARLY_ENTRY_MS = 20 * 60 * 1000
const POLL_MS = 45_000

export function SessionLauncher() {
  const { status } = useSession()
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const overlayOpen = useVideoOverlayStore(s => s.open)
  const [live, setLive] = useState<LiveSession | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [now, setNow] = useState(() => 0) // 0 until mounted (avoids SSR Date use)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/one-on-one/live-now', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setLive(data?.session ?? null)
    } catch {
      /* transient — keep whatever we had */
    }
  }, [])

  // Poll only while authenticated.
  useEffect(() => {
    if (status !== 'authenticated') {
      setLive(null)
      return
    }
    poll()
    pollRef.current = setInterval(poll, POLL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [status, poll])

  // 1s ticker for the countdown (only runs when there's a session to show).
  useEffect(() => {
    if (!live) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [live])

  if (status !== 'authenticated' || overlayOpen || !live || !now) return null
  if (dismissed.has(live.sessionId)) return null

  const start = new Date(live.scheduledAt).getTime()
  const needsPayment = !!live.needsPayment
  const joinable = !needsPayment && (live.live || now >= start - EARLY_ENTRY_MS)
  const isLive = !needsPayment && (live.live || now >= start)
  const opensAt = start - EARLY_ENTRY_MS

  const join = () => router.push(`/call/${live.sessionId}`)
  const pay = () => {
    if (live.payRequestId) {
      router.push(`/${locale}/payment?requestId=${live.payRequestId}`)
    } else if (live.payParticipantId) {
      resumeGroupSeatPayment(live.payParticipantId)
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[9998] flex justify-center px-4 sm:inset-x-auto sm:right-4 sm:justify-end">
      <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/95 p-3 pl-4 text-white shadow-[0_16px_48px_-8px_rgba(0,0,0,0.5)] ring-1 ring-white/10 backdrop-blur">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/20">
          {isLive ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/40" />
          ) : null}
          <Video className="relative h-4 w-4 text-blue-300" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{live.title}</p>
          <p className="truncate text-xs text-white/60">
            {needsPayment ? (
              <span className="font-medium text-amber-300">
                Payment needed · starts in {formatCountdown(start, now)}
              </span>
            ) : isLive ? (
              <span className="font-medium text-emerald-400">● Live now</span>
            ) : joinable ? (
              <span className="font-medium text-blue-300">Ready to join</span>
            ) : (
              <>Starts in {formatCountdown(start, now)}</>
            )}
          </p>
        </div>

        {needsPayment ? (
          <button
            type="button"
            onClick={pay}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
          >
            <CreditCard className="h-4 w-4" />
            Pay to join
          </button>
        ) : joinable ? (
          <button
            type="button"
            onClick={join}
            className="shrink-0 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            Join
          </button>
        ) : (
          <span className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-white/70">
            Opens in {formatCountdown(opensAt, now)}
          </span>
        )}

        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(prev => new Set(prev).add(live.sessionId))}
          className="shrink-0 rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white/80"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
