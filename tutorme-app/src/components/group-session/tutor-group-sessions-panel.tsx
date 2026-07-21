'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Loader2, Plus, CalendarDays, Trash2, Video, Clock, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatEarnings } from '@/lib/format-currency'
import { CourseCombobox, type CourseOption } from '@/components/course/course-combobox'
import { SessionCalendarPanel } from '@/components/session-calendar-panel'
import { TabsContent } from '@/components/ui/tabs'
import { CollapsibleCard } from '@/components/collapsible-card'

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
  liveSessionId?: string | null
  courseName?: string | null
  coursePublished?: boolean | null
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

interface TutorGroupSessionsPanelProps {
  /** Rendered inside a dashboard tab — drop the standalone hero and the panel's
   *  own card chrome so it sits flush in the tab. */
  embedded?: boolean
}

export function TutorGroupSessionsPanel({ embedded = false }: TutorGroupSessionsPanelProps) {
  const router = useRouter()
  const [sessions, setSessions] = useState<GroupSessionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [creating, setCreating] = useState(false)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [courses, setCourses] = useState<CourseOption[]>([])
  const [coursesLoading, setCoursesLoading] = useState(true)
  const [courseId, setCourseId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('create')

  useEffect(() => {
    let active = true
    fetch('/api/tutor/courses', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!active) return
        const list = Array.isArray(d?.courses) ? d.courses : []
        setCourses(
          list.map((c: { id: string; name: string; isPublished?: boolean }) => ({
            id: c.id,
            name: c.name,
            isPublished: !!c.isPublished,
          }))
        )
      })
      .catch(() => active && setCourses([]))
      .finally(() => active && setCoursesLoading(false))
    return () => {
      active = false
    }
  }, [])

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
          courseId: courseId || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Group session created')
        setForm(emptyForm)
        setCourseId(null)
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

  const activeCount = sessions.filter(s => s.status !== 'CANCELLED').length
  const totalCount = sessions.length

  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none'

  return (
    <div
      className={cn(
        'flex flex-col',
        embedded ? 'h-full min-h-0' : 'h-full min-h-full bg-white px-3 pb-0 lg:px-4'
      )}
    >
      {/* Hero — only outside the dashboard tab (the dashboard has its own header). */}
      {!embedded && (
        <section className="relative mb-4 flex-shrink-0 rounded-[20px] border border-white/10 bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] p-5 shadow-[0_12px_40px_-4px_rgba(0,0,0,0.22)] ring-1 ring-white/20">
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <h1 className="text-xl font-bold text-white">Group Sessions</h1>
              <p className="mt-1 text-sm text-white/60">
                Host open sessions with set seats. Students book and pay per seat.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 sm:absolute sm:right-5 sm:top-1/2 sm:-translate-y-1/2 sm:justify-end">
              <div
                className={cn(
                  'flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm',
                  loading && 'animate-pulse'
                )}
              >
                <Clock className="h-4 w-4 text-white/80" />
                <span className="text-xs font-medium text-white/80">Active</span>
                <span className="text-sm font-bold text-white">{activeCount}</span>
              </div>
              <div
                className={cn(
                  'flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm',
                  loading && 'animate-pulse'
                )}
              >
                <Users className="h-4 w-4 text-white/80" />
                <span className="text-xs font-medium text-white/80">Total</span>
                <span className="text-sm font-bold text-white">{totalCount}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Create form + Sessions list */}
      <div className="flex min-h-0 flex-1 flex-col pb-0.5">
        <SessionCalendarPanel
          value={activeTab}
          onValueChange={setActiveTab}
          variant="charcoal"
          // Flush inside the dashboard tab so it isn't a card-within-a-card.
          className={embedded ? 'border-0 p-0 shadow-none ring-0' : undefined}
          tabs={[
            { value: 'create', label: 'Create Session', icon: Plus },
            { value: 'sessions', label: 'Your Sessions', icon: Users },
          ]}
        >
          <TabsContent value="create" className="flex h-full flex-col gap-4 pb-4">
            <CollapsibleCard
              title="Create Session"
              icon={<Plus className="h-5 w-5 text-slate-900" />}
              defaultOpen={true}
              fillHeight={true}
            >
              <div className="h-full overflow-y-auto">
                <div className="grid gap-4 p-6 sm:grid-cols-2">
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
                  <div className="text-sm font-medium text-slate-700 sm:col-span-2">
                    Course (optional)
                    <div className="mt-1">
                      <CourseCombobox
                        options={courses}
                        value={courseId}
                        onChange={setCourseId}
                        loading={coursesLoading}
                        placeholder="Build this session around a course…"
                      />
                    </div>
                    <p className="mt-1 text-xs font-normal text-slate-400">
                      Linking a course lets you deploy its lessons, tasks and assessments live in
                      the room. Published and draft courses are both available.
                    </p>
                  </div>
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
                      min={1}
                      max={50}
                      className={field}
                      value={form.capacity}
                      onChange={e => setForm({ ...form, capacity: e.target.value })}
                    />
                    <span className="mt-1 block text-xs font-normal text-slate-400">
                      Set 1 seat for a private 1-on-1.
                    </span>
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
                <div className="px-6 pb-6">
                  <Button variant="solocorn-book" onClick={create} disabled={creating}>
                    {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create session
                  </Button>
                </div>
              </div>
            </CollapsibleCard>
          </TabsContent>

          <TabsContent value="sessions" className="flex h-full flex-col gap-4 pb-4">
            <CollapsibleCard
              title="Your Sessions"
              icon={<Users className="h-5 w-5 text-slate-900" />}
              defaultOpen={true}
              fillHeight={true}
            >
              <div className="flex h-full flex-col p-6">
                {loading ? (
                  <div className="flex items-center gap-2 text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="py-16 text-center">
                    <CalendarDays className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                    <h3 className="text-lg font-medium text-gray-700">No group sessions yet.</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Create your first session above to get started.
                    </p>
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto">
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
                                <span className="truncate font-medium text-slate-900">
                                  {gs.title}
                                </span>
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
                                  {gs.pricePerSeat > 0
                                    ? `${formatEarnings(gs.pricePerSeat, gs.currency || 'USD')}/seat`
                                    : 'Free'}
                                </span>
                                <span>
                                  {gs.capacity - gs.seatsLeft}/{gs.capacity} booked
                                </span>
                                {gs.courseName ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                                    <BookOpen className="h-3 w-3" />
                                    {gs.courseName}
                                    {gs.coursePublished === false ? (
                                      <span className="text-blue-400">· draft</span>
                                    ) : null}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            {!cancelled ? (
                              <div className="flex shrink-0 items-center gap-2">
                                {gs.liveSessionId ? (
                                  <Button
                                    variant="solocorn-book"
                                    onClick={() => router.push(`/call/${gs.liveSessionId}`)}
                                  >
                                    <Video className="mr-2 h-4 w-4" />
                                    Join room
                                  </Button>
                                ) : null}
                                <Button
                                  variant="outline"
                                  className="text-red-600 hover:bg-red-50"
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
                              </div>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </CollapsibleCard>
          </TabsContent>
        </SessionCalendarPanel>
      </div>
    </div>
  )
}
