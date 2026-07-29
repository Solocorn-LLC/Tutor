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
import { Loader2, CalendarClock, Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { VariantScheduleEditor } from '@/app/[locale]/tutor/courses/[id]/components/VariantScheduleEditor'
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
  /** Tutor context: show a "New schedule" button that opens the schedule editor
   *  (the same one as the course scheduler) in place and creates the schedule
   *  (POST /api/tutor/courses/[courseId]/schedules), then refreshes the list. */
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

  // "Add / edit schedule" editor dialog (tutor only).
  const [addOpen, setAddOpen] = useState(false)
  const [draftSlots, setDraftSlots] = useState<ScheduleItem[]>([])
  const [draftWeeks, setDraftWeeks] = useState(8)
  const [saving, setSaving] = useState(false)
  /** null = creating a new schedule; set = editing this one. */
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const openAdd = () => {
    setEditingScheduleId(null)
    setDraftSlots([{ dayOfWeek: DAYS[0], startTime: '09:00', durationMinutes: 60 }])
    setDraftWeeks(8)
    setAddOpen(true)
  }

  const openEdit = (s: CourseSchedule) => {
    setEditingScheduleId(s.scheduleId)
    setDraftSlots((Array.isArray(s.slots) ? s.slots : []) as ScheduleItem[])
    setDraftWeeks(s.weeksToSchedule || 8)
    setAddOpen(true)
  }

  const csrfHeader = async (): Promise<Record<string, string>> => {
    const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
    const csrfToken = (await csrfRes.json().catch(() => ({})))?.token as string | undefined
    return csrfToken ? { 'X-CSRF-Token': csrfToken } : {}
  }

  const handleSave = async () => {
    if (!courseId || saving) return
    const slots = draftSlots.filter(s => s?.dayOfWeek && s?.startTime)
    if (slots.length === 0) {
      toast.error('Add at least one time slot.')
      return
    }
    const isEdit = !!editingScheduleId
    setSaving(true)
    try {
      const res = await fetch(`/api/tutor/courses/${courseId}/schedules`, {
        method: isEdit ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(await csrfHeader()) },
        body: JSON.stringify(
          isEdit
            ? { scheduleId: editingScheduleId, schedule: slots, weeksToSchedule: draftWeeks }
            : { schedule: slots, weeksToSchedule: draftWeeks }
        ),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save schedule')
      }
      const created = typeof data?.sessionsCreated === 'number' ? data.sessionsCreated : 0
      if (created > 0) {
        toast.success(
          `Schedule ${isEdit ? 'updated' : 'created'} — ${created} session${
            created === 1 ? '' : 's'
          } added to your calendar.`
        )
      } else if (isEdit) {
        toast.success('Schedule updated.')
      } else {
        toast.warning(
          'Schedule created, but no upcoming sessions were added — check the dates are in the future.'
        )
      }
      setAddOpen(false)
      setEditingScheduleId(null)
      await loadSchedules()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save schedule')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (s: CourseSchedule) => {
    if (!courseId || s.enrolledCount > 0 || deletingId) return
    if (
      !window.confirm(
        `Remove "${s.name}"? Its upcoming sessions will be taken off your calendar. This can't be undone.`
      )
    ) {
      return
    }
    setDeletingId(s.scheduleId)
    try {
      const res = await fetch(
        `/api/tutor/courses/${courseId}/schedules?scheduleId=${encodeURIComponent(s.scheduleId)}`,
        { method: 'DELETE', credentials: 'include', headers: await csrfHeader() }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to remove schedule')
      }
      toast.success('Schedule removed')
      await loadSchedules()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove schedule')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
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
                              s.isFull
                                ? 'bg-red-100 text-red-700'
                                : 'bg-emerald-100 text-emerald-700'
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
                      {canCreate && (
                        <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={deletingId === s.scheduleId}
                            onClick={() => openEdit(s)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:text-gray-400"
                            disabled={s.enrolledCount > 0 || deletingId === s.scheduleId}
                            title={
                              s.enrolledCount > 0
                                ? 'Students are enrolled — cannot remove this schedule'
                                : 'Remove this schedule'
                            }
                            onClick={() => handleDelete(s)}
                          >
                            {deletingId === s.scheduleId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {canCreate && (
            <div className="border-t border-gray-100 pt-3">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={openAdd}>
                <Plus className="h-4 w-4" />
                New schedule
              </Button>
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

      {/* "Add schedule" — the same rich time-grid editor as the course scheduler,
          opened in place over the Class Schedules modal so the tutor doesn't have
          to leave for the full course-details page. Persists via the schedules API. */}
      {canCreate && (
        <Dialog open={addOpen} onOpenChange={open => !saving && setAddOpen(open)}>
          <DialogContent
            className="h-[90vh] max-h-[90vh] w-[95vw] max-w-[95vw] overflow-hidden sm:max-h-[800px] sm:max-w-[820px]"
            rounded="lg"
          >
            <div className="flex h-full flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5" />{' '}
                  {editingScheduleId ? 'Edit schedule' : 'New schedule'}
                </DialogTitle>
                <DialogDescription>
                  {editingScheduleId
                    ? 'Click a time slot to add or remove a 1-hour session. Saving updates your upcoming calendar sessions.'
                    : `Click a time slot to add or remove a 1-hour session. It saves as “Schedule ${schedules.length + 1}”.`}
                </DialogDescription>
              </DialogHeader>

              <div className="scrollbar-hide mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
                <VariantScheduleEditor
                  schedule={draftSlots}
                  onScheduleChange={updater => setDraftSlots(prev => updater(prev))}
                  weeksToSchedule={draftWeeks}
                  onWeeksChange={setDraftWeeks}
                  siblingSchedules={schedules.map(s => s.slots)}
                />
              </div>

              <DialogFooter align="end" className="mt-4">
                <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  {editingScheduleId ? 'Save changes' : 'Create schedule'}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
