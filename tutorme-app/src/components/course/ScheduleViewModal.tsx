'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CalendarClock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ScheduleSlotEditor } from '@/app/[locale]/tutor/courses/[id]/components/ScheduleSlotEditor'
import { DAYS, type ScheduleItem } from '@/app/[locale]/tutor/courses/[id]/constants'

interface ScheduleSlot {
  dayOfWeek: string
  startTime: string
  durationMinutes: number
}

// Concise weekly-pattern summary instead of listing every slot.
function summarizeSlots(slots: ScheduleSlot[]): { line: string; perWeek: number } {
  if (slots.length === 0) return { line: 'Times arranged with the tutor', perWeek: 0 }
  const days = Array.from(new Set(slots.map(s => s.dayOfWeek.slice(0, 3)))).join(', ')
  const times = Array.from(new Set(slots.map(s => s.startTime)))
  const timePart = times.length === 1 ? times[0] : `${times.length} times/wk`
  const dur = slots[0]?.durationMinutes
  return {
    line: [days, timePart, dur ? `${dur} min` : null].filter(Boolean).join(' · '),
    perWeek: slots.length,
  }
}

interface CourseSchedule {
  scheduleId: string
  scheduleIndex: number
  name: string
  slots: ScheduleSlot[]
  weeksToSchedule: number
  maxStudents: number | null
  enrolledCount: number
  spotsLeft: number | null
  isFull: boolean
}

interface ScheduleViewModalProps {
  /** When set, the modal is open and loads schedules for this course. */
  courseId: string | null
  courseName?: string
  onClose: () => void
  /** The schedule the student is currently enrolled in (highlighted as current). */
  selectedScheduleId?: string | null
  /** When provided, each non-current schedule gets a "Switch to this" button. */
  onSwitch?: (scheduleId: string) => Promise<void> | void
  /** Tutor context: show a "New schedule" form that creates a schedule for this
   *  course (POST /api/tutor/courses/[courseId]/schedules) and refreshes the list. */
  canCreate?: boolean
}

export function ScheduleViewModal({
  courseId,
  courseName,
  onClose,
  selectedScheduleId,
  onSwitch,
  canCreate = false,
}: ScheduleViewModalProps) {
  const [schedules, setSchedules] = useState<CourseSchedule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [switchingId, setSwitchingId] = useState<string | null>(null)

  // "New schedule" form (tutor only).
  const [showCreate, setShowCreate] = useState(false)
  const [slots, setSlots] = useState<ScheduleItem[]>([
    { dayOfWeek: DAYS[0], startTime: '09:00', durationMinutes: 60 },
  ])
  const [weeks, setWeeks] = useState(8)
  const [maxStudents, setMaxStudents] = useState('')
  const [creating, setCreating] = useState(false)

  const loadSchedules = useCallback(async () => {
    if (!courseId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/courses/${courseId}/schedules`, { credentials: 'include' })
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setSchedules(Array.isArray(data?.schedules) ? data.schedules : [])
    } catch {
      setError('Could not load schedules')
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => {
    if (!courseId) return
    void loadSchedules()
  }, [courseId, loadSchedules])

  // Reset the create form each time the modal opens for a course.
  useEffect(() => {
    if (!courseId) return
    setShowCreate(false)
    setSlots([{ dayOfWeek: DAYS[0], startTime: '09:00', durationMinutes: 60 }])
    setWeeks(8)
    setMaxStudents('')
  }, [courseId])

  const updateSlot = (index: number, field: keyof ScheduleItem, value: string | number) => {
    setSlots(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }
  const removeSlot = (index: number) => setSlots(prev => prev.filter((_, i) => i !== index))
  const addSlot = () =>
    setSlots(prev => [...prev, { dayOfWeek: DAYS[0], startTime: '09:00', durationMinutes: 60 }])

  const handleCreate = async () => {
    if (!courseId || creating) return
    if (slots.length === 0) {
      toast.error('Add at least one weekly slot.')
      return
    }
    setCreating(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfToken = (await csrfRes.json().catch(() => ({})))?.token as string | undefined
      const res = await fetch(`/api/tutor/courses/${courseId}/schedules`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({
          schedule: slots,
          weeksToSchedule: weeks,
          maxStudents: maxStudents.trim() ? Number(maxStudents) : null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to create schedule')
      }
      toast.success('Schedule created')
      setShowCreate(false)
      setSlots([{ dayOfWeek: DAYS[0], startTime: '09:00', durationMinutes: 60 }])
      setWeeks(8)
      setMaxStudents('')
      await loadSchedules()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create schedule')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={!!courseId} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" /> Class Schedules
          </DialogTitle>
          <DialogDescription>
            {courseName ? `${courseName} — available class times` : 'Available class times'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto p-1">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-500">{error}</p>
          ) : schedules.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No fixed schedules yet — class times are arranged with the tutor.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {schedules.map(s => {
                const isCurrent = !!selectedScheduleId && s.scheduleId === selectedScheduleId
                return (
                  <div
                    key={s.scheduleId}
                    className={`flex flex-col rounded-lg border p-4 ${
                      isCurrent
                        ? 'border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-300'
                        : 'bg-gray-50'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-gray-900">{s.name}</h4>
                        {isCurrent && (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                            Current
                          </span>
                        )}
                      </div>
                      {s.maxStudents != null && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            s.isFull ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {s.isFull
                            ? 'Full'
                            : `${s.spotsLeft} spot${s.spotsLeft === 1 ? '' : 's'} left`}
                        </span>
                      )}
                    </div>
                    {(() => {
                      const { line, perWeek } = summarizeSlots(s.slots)
                      const weeks = s.weeksToSchedule || 0
                      return (
                        <div className="space-y-1">
                          <p className="text-sm text-gray-700">{line}</p>
                          {perWeek > 0 && (
                            <p className="text-xs text-gray-400">
                              {weeks > 0
                                ? `${perWeek * weeks} sessions over ${weeks} weeks`
                                : `${perWeek} session${perWeek === 1 ? '' : 's'}/week`}
                            </p>
                          )}
                        </div>
                      )
                    })()}
                    {onSwitch && !isCurrent && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={s.isFull || switchingId !== null}
                        className="mt-3"
                        onClick={async () => {
                          setSwitchingId(s.scheduleId)
                          try {
                            await onSwitch(s.scheduleId)
                          } finally {
                            setSwitchingId(null)
                          }
                        }}
                      >
                        {switchingId === s.scheduleId ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        {s.isFull ? 'Full' : 'Switch to this schedule'}
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {canCreate && (
          <div className="border-t border-gray-100 pt-3">
            {!showCreate ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreate(true)}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                New schedule
              </Button>
            ) : (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-900">New schedule</h4>
                  <span className="text-xs text-gray-400">
                    Auto-named &ldquo;Schedule {schedules.length + 1}&rdquo;
                  </span>
                </div>
                <div className="max-h-[30vh] space-y-2 overflow-y-auto">
                  {slots.map((slot, i) => (
                    <ScheduleSlotEditor
                      key={i}
                      slot={slot}
                      index={i}
                      onUpdate={updateSlot}
                      onRemove={removeSlot}
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSlot}
                  className="mt-2 gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add slot
                </Button>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Weeks</Label>
                    <Input
                      type="number"
                      min={1}
                      max={52}
                      value={weeks}
                      onChange={e => setWeeks(Math.max(1, Number(e.target.value) || 1))}
                      className="h-9 w-24"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max students (optional)</Label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="No limit"
                      value={maxStudents}
                      onChange={e => setMaxStudents(e.target.value)}
                      className="h-9 w-32"
                    />
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCreate(false)}
                      disabled={creating}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleCreate} disabled={creating}>
                      {creating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                      Create schedule
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter align="end">
          <Button
            className="border border-[#1F2933] bg-white text-[#1F2933] hover:bg-[#1F2933] hover:text-white hover:outline hover:outline-1 hover:outline-white"
            onClick={onClose}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
