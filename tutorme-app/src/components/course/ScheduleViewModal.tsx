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
}

export function ScheduleViewModal({ courseId, courseName, onClose }: ScheduleViewModalProps) {
  const [schedules, setSchedules] = useState<CourseSchedule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
              {schedules.map(s => (
                <div key={s.scheduleId} className="flex flex-col rounded-lg border bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-gray-900">{s.name}</h4>
                  {s.maxStudents != null && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.isFull ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {s.isFull ? 'Full' : `${s.spotsLeft} spot${s.spotsLeft === 1 ? '' : 's'} left`}
                    </span>
                  )}
                </div>
                {s.slots.length > 0 ? (
                  <ul className="space-y-1.5">
                    {s.slots.map((slot, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-gray-800">{slot.dayOfWeek}</span>
                        <span className="text-gray-600">
                          {slot.startTime} · {slot.durationMinutes} min
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">Times to be arranged with the tutor.</p>
                )}
                {s.weeksToSchedule ? (
                  <p className="mt-2 text-xs text-gray-400">Runs for {s.weeksToSchedule} weeks</p>
                ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter align="end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
