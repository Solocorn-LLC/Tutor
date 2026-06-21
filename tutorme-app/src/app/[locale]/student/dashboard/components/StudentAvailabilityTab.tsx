'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Check, CalendarClock, Info } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const DAYS = [
  { idx: 1, short: 'Mon', long: 'Monday' },
  { idx: 2, short: 'Tue', long: 'Tuesday' },
  { idx: 3, short: 'Wed', long: 'Wednesday' },
  { idx: 4, short: 'Thu', long: 'Thursday' },
  { idx: 5, short: 'Fri', long: 'Friday' },
  { idx: 6, short: 'Sat', long: 'Saturday' },
  { idx: 0, short: 'Sun', long: 'Sunday' },
]

// Waking hours shown as togglable slots (24h grid would be unwieldy).
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 6:00 .. 22:00

const pad = (n: number) => String(n).padStart(2, '0')
const slotKey = (day: number, hour: number) => `${day}-${pad(hour)}:00`
const hourLabel = (h: number) => {
  const period = h < 12 ? 'AM' : 'PM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display} ${period}`
}

interface SessionItem {
  id: string
  title: string
  startTime: string
  courseName?: string | null
}

/**
 * Student "My Availability" — an editable weekly grid of free slots, plus the
 * student's upcoming course sessions for context (so availability is set around
 * existing commitments). Persists to /api/student/calendar/availability.
 */
export function StudentAvailabilityTab() {
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [available, setAvailable] = useState<Set<string>>(new Set())
  const [selectedDay, setSelectedDay] = useState<number>(() => {
    const d = new Date().getDay()
    return d
  })
  const [sessions, setSessions] = useState<SessionItem[]>([])

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', [])

  // Load saved availability
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/student/calendar/availability', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const set = new Set<string>()
        for (const a of data?.availability ?? []) {
          if (a.isAvailable) set.add(`${a.dayOfWeek}-${a.startTime}`)
        }
        setAvailable(set)
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load your availability')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Load upcoming sessions (commitments) for context
  useEffect(() => {
    let cancelled = false
    const start = new Date()
    const end = new Date()
    end.setDate(end.getDate() + 30)
    fetch(
      `/api/student/calendar/events?start=${encodeURIComponent(
        start.toISOString()
      )}&end=${encodeURIComponent(end.toISOString())}`,
      { credentials: 'include' }
    )
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const evs = Array.isArray(data?.events) ? data.events : []
        setSessions(
          evs
            .map((e: Record<string, unknown>) => ({
              id: String(e.id ?? e.eventId ?? Math.random()),
              title: String(e.title ?? 'Session'),
              // The events endpoint names the time field `start` (ISO string).
              startTime: String(e.start ?? e.startTime ?? e.scheduledAt ?? ''),
              courseName: (e.courseName as string) ?? null,
            }))
            .filter((e: SessionItem) => e.startTime)
            .sort(
              (a: SessionItem, b: SessionItem) =>
                new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
            )
            .slice(0, 8)
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const toggleSlot = useCallback(
    async (day: number, hour: number) => {
      const key = slotKey(day, hour)
      const startTime = `${pad(hour)}:00`
      const endTime = `${pad(hour + 1)}:00`
      const currentlyAvailable = available.has(key)
      const next = !currentlyAvailable

      // Optimistic
      setAvailable(prev => {
        const s = new Set(prev)
        if (next) s.add(key)
        else s.delete(key)
        return s
      })
      setSavingKey(key)
      try {
        const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
        const csrfData = await csrfRes.json().catch(() => ({}))
        const csrfToken = csrfData?.token ?? null
        const res = await fetch('/api/student/calendar/availability', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            dayOfWeek: day,
            startTime,
            endTime,
            timezone,
            isAvailable: next,
          }),
        })
        if (!res.ok) throw new Error('save failed')
      } catch {
        // Revert
        setAvailable(prev => {
          const s = new Set(prev)
          if (currentlyAvailable) s.add(key)
          else s.delete(key)
          return s
        })
        toast.error('Could not save that change')
      } finally {
        setSavingKey(null)
      }
    },
    [available, timezone]
  )

  const dayLong = DAYS.find(d => d.idx === selectedDay)?.long ?? ''
  const availableCount = available.size

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#1F2933]">My Availability</h3>
          <p className="text-xs text-gray-500">
            Tap the hours you’re free. Tutors use this when scheduling 1-on-1s.
          </p>
        </div>
        <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-700">
          {availableCount} slot{availableCount === 1 ? '' : 's'} marked free
        </span>
      </div>

      {/* Day selector */}
      <div className="flex flex-wrap gap-1">
        {DAYS.map(d => (
          <button
            key={d.idx}
            type="button"
            onClick={() => setSelectedDay(d.idx)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              selectedDay === d.idx
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {d.short}
          </button>
        ))}
      </div>

      {/* Hour grid for the selected day */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      ) : (
        <div>
          <p className="mb-2 text-xs font-medium text-gray-500">{dayLong}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {HOURS.map(h => {
              const key = slotKey(selectedDay, h)
              const isFree = available.has(key)
              const isSaving = savingKey === key
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isSaving}
                  onClick={() => void toggleSlot(selectedDay, h)}
                  className={cn(
                    'flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors disabled:opacity-60',
                    isFree
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                  )}
                >
                  {isSaving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : isFree ? (
                    <Check className="h-3 w-3" />
                  ) : null}
                  {hourLabel(h)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Upcoming commitments (course sessions) */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-700">
          <CalendarClock className="h-4 w-4 text-orange-500" />
          Your upcoming sessions
        </div>
        {sessions.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-gray-400">
            <Info className="h-3.5 w-3.5" />
            No upcoming sessions from your enrolled courses.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {sessions.map(s => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium text-gray-700">
                  {s.title}
                  {s.courseName ? <span className="text-gray-400"> · {s.courseName}</span> : null}
                </span>
                <span className="shrink-0 text-gray-500">
                  {new Date(s.startTime).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
