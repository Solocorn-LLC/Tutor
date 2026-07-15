'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Ban } from 'lucide-react'
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

// Waking hours shown as togglable slots (a full 24h grid would be unwieldy).
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 6:00 .. 22:00

const pad = (n: number) => String(n).padStart(2, '0')
const slotKey = (day: number, hour: number) => `${day}-${pad(hour)}:00`
const hourLabel = (h: number) => {
  const period = h < 12 ? 'AM' : 'PM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display} ${period}`
}

interface AvailabilityEditorProps {
  /** The child/student whose availability the parent is editing. */
  studentId: string
  studentName?: string
}

/**
 * Parent-facing weekly availability editor for a child.
 *
 * Model: the child can book 24/7 by DEFAULT. The parent taps hours to BLOCK
 * them; a blocked hour writes an isAvailable=false row to StudentAvailability
 * (via /api/parent/students/[studentId]/availability), which the booking backend
 * treats as off-limits. Tapping a blocked hour again re-opens it.
 */
export function AvailabilityEditor({ studentId, studentName }: AvailabilityEditorProps) {
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  // Hours the parent has BLOCKED (everything else is bookable by default).
  const [blocked, setBlocked] = useState<Set<string>>(new Set())
  const [selectedDay, setSelectedDay] = useState<number>(() => new Date().getDay())

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', [])
  const endpoint = `/api/parent/students/${studentId}/availability`

  // Load the child's saved blocks (rows explicitly marked unavailable).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(endpoint, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const set = new Set<string>()
        for (const a of data?.availability ?? []) {
          if (a.isAvailable === false) set.add(`${a.dayOfWeek}-${a.startTime}`)
        }
        setBlocked(set)
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load this student's availability")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [endpoint])

  const toggleSlot = useCallback(
    async (day: number, hour: number) => {
      const key = slotKey(day, hour)
      const startTime = `${pad(hour)}:00`
      const endTime = `${pad(hour + 1)}:00`
      const currentlyBlocked = blocked.has(key)
      const willBlock = !currentlyBlocked

      // Optimistic
      setBlocked(prev => {
        const s = new Set(prev)
        if (willBlock) s.add(key)
        else s.delete(key)
        return s
      })
      setSavingKey(key)
      try {
        const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
        const csrfData = await csrfRes.json().catch(() => ({}))
        const csrfToken = csrfData?.token ?? null
        const res = await fetch(endpoint, {
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
            // Blocking a slot marks it unavailable; re-opening marks it available.
            isAvailable: !willBlock,
          }),
        })
        if (!res.ok) throw new Error('save failed')
      } catch {
        // Revert on failure
        setBlocked(prev => {
          const s = new Set(prev)
          if (currentlyBlocked) s.add(key)
          else s.delete(key)
          return s
        })
        toast.error('Could not save that change')
      } finally {
        setSavingKey(null)
      }
    },
    [blocked, timezone, endpoint]
  )

  const dayLong = DAYS.find(d => d.idx === selectedDay)?.long ?? ''
  const blockedCount = blocked.size

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#1F2933]">
            {studentName ? `${studentName}'s Availability` : 'Availability'}
          </h3>
          <p className="text-xs text-gray-500">
            Your child can book any time by default. Tap an hour to block it — tutors won&apos;t be
            able to schedule 1-on-1s then.
          </p>
        </div>
        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
          {blockedCount} hour{blockedCount === 1 ? '' : 's'} blocked
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
              const isBlocked = blocked.has(key)
              const isSaving = savingKey === key
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isSaving}
                  onClick={() => void toggleSlot(selectedDay, h)}
                  title={isBlocked ? 'Blocked — tap to allow' : 'Allowed — tap to block'}
                  className={cn(
                    'flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors disabled:opacity-60',
                    isBlocked
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  )}
                >
                  {isSaving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : isBlocked ? (
                    <Ban className="h-3 w-3" />
                  ) : null}
                  {hourLabel(h)}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
