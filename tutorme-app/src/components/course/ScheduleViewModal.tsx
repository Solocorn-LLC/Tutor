'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, CalendarClock } from 'lucide-react'

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
}

export function ScheduleViewModal({
  courseId,
  courseName,
  onClose,
  selectedScheduleId,
  onSwitch,
}: ScheduleViewModalProps) {
  const [schedules, setSchedules] = useState<CourseSchedule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [switchingId, setSwitchingId] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/courses/${courseId}/schedules`, { credentials: 'include' })
      .then(async res => {
        if (!res.ok) throw new Error('failed')
        const data = await res.json()
        if (!cancelled) setSchedules(Array.isArray(data?.schedules) ? data.schedules : [])
      })
      .catch(() => {
        if (!cancelled) setError('Could not load schedules')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [courseId])

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
