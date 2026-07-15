'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Users, Loader2, CalendarDays, ArrowUpRight, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { bookGroupSeat } from '@/lib/group-session/book-seat'

interface BrowseSession {
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
  tutorName?: string | null
  tutorUsername?: string | null
  courseName?: string | null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export default function StudentGroupSessionsPage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const [sessions, setSessions] = useState<BrowseSession[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/group-sessions/browse', { credentials: 'include' })
      const data = res.ok ? await res.json() : { sessions: [] }
      setSessions(Array.isArray(data.sessions) ? data.sessions : [])
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const book = async (gs: BrowseSession) => {
    setBusyId(gs.groupSessionId)
    const result = await bookGroupSeat(gs.groupSessionId)
    if (result !== 'redirecting') {
      load()
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 px-3 pb-6 pt-4 lg:px-4">
      {/* Hero */}
      <section className="rounded-[20px] bg-gradient-to-br from-[#F97316] to-[#EA580C] p-5 shadow-[0_12px_40px_-4px_rgba(0,0,0,0.22)] ring-1 ring-white/20">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <Users className="h-5 w-5 text-white" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-white">Group Sessions</h1>
            <p className="mt-0.5 text-sm text-white/70">
              Open sessions hosted by tutors — grab a seat before they fill up.
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-500">
          <CalendarDays className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          No open group sessions right now. Check back soon.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map(gs => {
            const full = gs.seatsLeft <= 0
            return (
              <li
                key={gs.groupSessionId}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900">{gs.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {gs.tutorUsername ? (
                      <Link
                        href={`/${locale}/u/${encodeURIComponent(gs.tutorUsername)}`}
                        className="inline-flex items-center gap-0.5 font-medium text-blue-600 hover:underline"
                      >
                        {gs.tutorName || `@${gs.tutorUsername}`}
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="font-medium capitalize text-slate-600">
                        {gs.tutorName || 'Tutor'}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(gs.requestedDate)} · {gs.startTime}–{gs.endTime} ({gs.timezone})
                    </span>
                    <span className="font-medium text-slate-900">
                      {gs.pricePerSeat > 0 ? `${gs.pricePerSeat} ${gs.currency}/seat` : 'Free'}
                    </span>
                    <span className={full ? 'text-slate-400' : 'text-emerald-700'}>
                      {full
                        ? 'Full'
                        : gs.capacity === 1
                          ? '1-on-1 · 1 seat'
                          : `${gs.seatsLeft} of ${gs.capacity} seats left`}
                    </span>
                    {gs.courseName ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        <BookOpen className="h-3 w-3" />
                        {gs.courseName}
                      </span>
                    ) : null}
                  </div>
                  {gs.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{gs.description}</p>
                  ) : null}
                </div>
                <Button
                  variant="solocorn-book"
                  className="shrink-0"
                  disabled={full || busyId === gs.groupSessionId}
                  onClick={() => book(gs)}
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
      )}
    </div>
  )
}
