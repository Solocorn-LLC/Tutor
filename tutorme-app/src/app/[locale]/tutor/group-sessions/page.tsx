'use client'

import { useCallback, useEffect, useState } from 'react'
import { Users, Loader2, Plus, CalendarDays, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

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

const emptyForm = {
  title: '',
  description: '',
  date: '',
  startTime: '',
  endTime: '',
  capacity: '4',
  pricePerSeat: '20',
  free: false,
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export default function TutorGroupSessionsPage() {
  const [sessions, setSessions] = useState<GroupSessionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [creating, setCreating] = useState(false)
  const [cancelId, setCancelId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/group-sessions', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
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

  const create = async () => {
    if (!form.title || !form.date || !form.startTime || !form.endTime) {
      toast.error('Fill in the title, date and time')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/group-sessions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          capacity: Number(form.capacity),
          pricePerSeat: form.free ? 0 : Number(form.pricePerSeat),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Group session created')
        setForm(emptyForm)
        load()
      } else {
        toast.error(data.error || 'Could not create the session')
      }
    } catch {
      toast.error('Something went wrong')
    } finally {
      setCreating(false)
    }
  }

  const cancel = async (id: string) => {
    setCancelId(id)
    try {
      const res = await fetch(`/api/group-sessions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(
          data.refunded ? `Cancelled — ${data.refunded} seat(s) refunded` : 'Session cancelled'
        )
        load()
      } else {
        toast.error(data.error || 'Could not cancel')
      }
    } catch {
      toast.error('Something went wrong')
    } finally {
      setCancelId(null)
    }
  }

  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none'

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center gap-2">
        <Users className="h-6 w-6 text-[#0891B2]" />
        <h1 className="text-2xl font-bold text-slate-900">Group Sessions</h1>
      </div>
      <p className="mb-6 text-sm text-slate-600">
        Host an open session with a set number of seats. Students each book and pay for their own
        seat; when every seat sells, the session shows as full.
      </p>

      {/* Create form */}
      <div className="mb-8 rounded-[18px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
          <Plus className="h-4 w-4" /> New group session
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Title
            <input
              className={field}
              value={form.title}
              maxLength={120}
              placeholder="e.g. SAT Math crash session"
              onChange={e => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Description (optional)
            <textarea
              className={field}
              value={form.description}
              maxLength={1000}
              rows={2}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Date
            <input
              type="date"
              className={field}
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-slate-700">
              Start
              <input
                type="time"
                className={field}
                value={form.startTime}
                onChange={e => setForm({ ...form, startTime: e.target.value })}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              End
              <input
                type="time"
                className={field}
                value={form.endTime}
                onChange={e => setForm({ ...form, endTime: e.target.value })}
              />
            </label>
          </div>
          <label className="text-sm font-medium text-slate-700">
            Seats
            <input
              type="number"
              min={2}
              max={50}
              className={field}
              value={form.capacity}
              onChange={e => setForm({ ...form, capacity: e.target.value })}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Price per seat
            <input
              type="number"
              min={0}
              disabled={form.free}
              className={`${field} disabled:bg-slate-100 disabled:text-slate-400`}
              value={form.free ? '0' : form.pricePerSeat}
              onChange={e => setForm({ ...form, pricePerSeat: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.free}
              onChange={e => setForm({ ...form, free: e.target.checked })}
              className="h-4 w-4"
            />
            Free session — students book a seat with no payment (great for testing or free
            workshops)
          </label>
        </div>
        <div className="mt-4">
          <Button variant="solocorn-book" onClick={create} disabled={creating}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create session
          </Button>
        </div>
      </div>

      {/* Existing sessions */}
      <h2 className="mb-3 text-base font-semibold text-slate-900">Your sessions</h2>
      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-slate-500">No group sessions yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map(gs => {
            const cancelled = gs.status === 'CANCELLED'
            return (
              <li
                key={gs.groupSessionId}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-900">{gs.title}</span>
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-xs font-medium ' +
                        (cancelled
                          ? 'bg-slate-100 text-slate-500'
                          : gs.status === 'FULL'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700')
                      }
                    >
                      {gs.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(gs.requestedDate)} · {gs.startTime}–{gs.endTime}
                    </span>
                    <span>
                      {gs.pricePerSeat > 0 ? `${gs.pricePerSeat} ${gs.currency}/seat` : 'Free'}
                    </span>
                    <span>
                      {gs.capacity - gs.seatsLeft}/{gs.capacity} booked
                    </span>
                  </div>
                </div>
                {!cancelled ? (
                  <Button
                    variant="outline"
                    className="shrink-0 text-red-600 hover:bg-red-50"
                    disabled={cancelId === gs.groupSessionId}
                    onClick={() => cancel(gs.groupSessionId)}
                  >
                    {cancelId === gs.groupSessionId ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Cancel &amp; refund
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
