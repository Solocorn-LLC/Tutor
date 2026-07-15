'use client'

import { useCallback, useEffect, useState } from 'react'
import { Users, Loader2, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { bookGroupSeat } from '@/lib/group-session/book-seat'
import { formatEarnings } from '@/lib/format-currency'

interface GroupSessionItem {
  groupSessionId: string
  title: string
  description?: string | null
  requestedDate: string
  startTime: string
  endTime: string
  timezone: string
  capacity: number
  pricePerSeat: number
  currency: string
  status: string
  seatsLeft: number
}

/** Format the UTC calendar date of a group session for display. */
function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Student-facing list of a tutor's open group sessions. Renders nothing when the
 * tutor hosts none, so it can be dropped onto any tutor page unconditionally.
 */
export function GroupSessionsList({ tutorId }: { tutorId: string }) {
  const [sessions, setSessions] = useState<GroupSessionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/group-sessions?tutorId=${encodeURIComponent(tutorId)}`, {
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      setSessions(Array.isArray(data.sessions) ? data.sessions : [])
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [tutorId])

  useEffect(() => {
    if (tutorId) load()
  }, [tutorId, load])

  const bookSeat = async (gs: GroupSessionItem) => {
    setBusyId(gs.groupSessionId)
    const result = await bookGroupSeat(gs.groupSessionId)
    // On redirect the page navigates away; otherwise refresh seat counts.
    if (result !== 'redirecting') {
      load()
      setBusyId(null)
    }
  }

  if (loading || sessions.length === 0) return null

  return (
    <section className="mt-7 rounded-[18px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-slate-900">
        <Users className="h-5 w-5 text-blue-700" />
        <h2 className="text-base font-semibold">Group sessions</h2>
      </div>
      <ul className="flex flex-col gap-3">
        {sessions.map(gs => {
          const full = gs.seatsLeft <= 0 || gs.status !== 'OPEN'
          return (
            <li
              key={gs.groupSessionId}
              className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-slate-900">{gs.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDate(gs.requestedDate)} · {gs.startTime}–{gs.endTime} ({gs.timezone})
                  </span>
                  <span>
                    {gs.pricePerSeat > 0
                      ? `${formatEarnings(gs.pricePerSeat, gs.currency || 'USD')}/seat`
                      : 'Free'}
                  </span>
                  <span className={full ? 'text-slate-400' : 'text-emerald-700'}>
                    {full ? 'Full' : `${gs.seatsLeft} of ${gs.capacity} seats left`}
                  </span>
                </div>
                {gs.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{gs.description}</p>
                ) : null}
              </div>
              <Button
                variant="solocorn-book"
                className="shrink-0"
                disabled={full || busyId === gs.groupSessionId}
                onClick={() => bookSeat(gs)}
              >
                {busyId === gs.groupSessionId ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {full ? 'Full' : 'Book a seat'}
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
