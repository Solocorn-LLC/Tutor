/**
 * Preference-based enrollment dialog for students.
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface ScheduleItem {
  dayOfWeek: string
  startTime: string
  durationMinutes: number
}

interface CourseScheduleOption {
  scheduleId: string
  scheduleIndex: number
  schedule: ScheduleItem[]
}

interface PreferenceEnrollmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  courseId: string
  courseName: string
  availabilitySlots: ScheduleItem[]
  schedules?: CourseScheduleOption[]
  onSubmitted?: () => void
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  return h * 60 + m
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const date = new Date()
  date.setHours(h, m, 0, 0)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function addMinutesToTime(startTime: string, minutesToAdd: number): string {
  const total = toMinutes(startTime) + minutesToAdd
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

function slotLabel(slot: ScheduleItem): string {
  const start = formatTime(slot.startTime)
  const end = formatTime(addMinutesToTime(slot.startTime, slot.durationMinutes))
  return `${start}–${end}`
}

function getCsrfToken(): Promise<string | null> {
  return fetch('/api/csrf', { credentials: 'include' })
    .then(res => res.json())
    .then(data => data?.token ?? null)
    .catch(() => null)
}

export function PreferenceEnrollmentDialog({
  open,
  onOpenChange,
  courseId,
  courseName,
  availabilitySlots = [],
  schedules = [],
  onSubmitted,
}: PreferenceEnrollmentDialogProps) {
  const [startDate, setStartDate] = useState('')
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasSchedules = schedules.length > 0
  const isUnavailable = !hasSchedules && availabilitySlots.length === 0

  useEffect(() => {
    if (open) {
      setStartDate(new Date().toISOString().split('T')[0])
      setSelectedScheduleId(null)
    }
  }, [open, courseId])

  const slotsByDay = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>()
    for (const day of DAY_ORDER) map.set(day, [])
    for (const slot of availabilitySlots) {
      const list = map.get(slot.dayOfWeek) ?? []
      list.push(slot)
      map.set(slot.dayOfWeek, list)
    }
    for (const [day, list] of map.entries()) {
      list.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))
      map.set(day, list)
    }
    return map
  }, [availabilitySlots])

  const handleSubmit = async () => {
    if (!startDate) {
      toast.error('Select a start date.')
      return
    }
    if (hasSchedules && !selectedScheduleId) {
      toast.error('Select a schedule.')
      return
    }

    setIsSubmitting(true)
    try {
      const csrf = await getCsrfToken()
      // Call standard enrollment API
      const res = await fetch(`/api/courses/${courseId}/enroll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'X-CSRF-Token': csrf }),
        },
        credentials: 'include',
        body: JSON.stringify({
          startDate: new Date(startDate).toISOString(),
          ...(selectedScheduleId && { scheduleId: selectedScheduleId }),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Failed to enroll.')
        return
      }

      toast.success('Successfully enrolled!')
      onOpenChange(false)
      if (onSubmitted) {
        onSubmitted()
      } else {
        window.location.href = '/student/courses?tab=mine'
      }
    } catch {
      toast.error('Failed to enroll.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Sign up for {courseName}</DialogTitle>
          <DialogDescription>
            Join this course by selecting your preferred start date.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Schedule selector (if multiple schedules exist) */}
          {hasSchedules && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                Select a Schedule
              </h4>
              <div className="mt-3 space-y-2">
                {schedules.map(sch => {
                  const schSlotsByDay = new Map<string, ScheduleItem[]>()
                  for (const day of DAY_ORDER) schSlotsByDay.set(day, [])
                  for (const slot of sch.schedule) {
                    const list = schSlotsByDay.get(slot.dayOfWeek) ?? []
                    list.push(slot)
                    schSlotsByDay.set(slot.dayOfWeek, list)
                  }
                  for (const [day, list] of schSlotsByDay.entries()) {
                    list.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))
                    schSlotsByDay.set(day, list)
                  }
                  return (
                    <label
                      key={sch.scheduleId}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                        selectedScheduleId === sch.scheduleId
                          ? 'border-indigo-300 bg-indigo-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="schedule"
                        value={sch.scheduleId}
                        checked={selectedScheduleId === sch.scheduleId}
                        onChange={() => setSelectedScheduleId(sch.scheduleId)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800">
                          Schedule {sch.scheduleIndex}
                        </p>
                        <div className="mt-1 grid gap-1 sm:grid-cols-2">
                          {DAY_ORDER.filter(day => (schSlotsByDay.get(day)?.length ?? 0) > 0).map(day => {
                            const slots = schSlotsByDay.get(day) ?? []
                            return (
                              <div key={day} className="flex flex-col gap-0.5">
                                <p className="text-[11px] font-bold uppercase text-slate-500">{day}</p>
                                {slots.map((slot, i) => (
                                  <p key={i} className="text-xs text-slate-600">
                                    {slotLabel(slot)}
                                  </p>
                                ))}
                              </div>
                            )
                          })}
                          {sch.schedule.length === 0 && (
                            <p className="text-xs italic text-gray-400">No slots configured</p>
                          )}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Legacy: show fixed schedule if no multi-schedules */}
          {!hasSchedules && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                Fixed Schedule
              </h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {DAY_ORDER.filter(day => (slotsByDay.get(day)?.length ?? 0) > 0).map(day => {
                  const slots = slotsByDay.get(day) ?? []
                  return (
                    <div key={day} className="flex flex-col gap-1">
                      <p className="text-xs font-bold uppercase text-blue-800">{day}</p>
                      {slots.map((slot, i) => (
                        <p key={i} className="text-sm text-blue-700">
                          {slotLabel(slot)}
                        </p>
                      ))}
                    </div>
                  )
                })}
                {isUnavailable && (
                  <p className="col-span-2 text-sm italic text-gray-500">
                    No schedule published yet.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <label className="text-sm font-medium text-gray-900" htmlFor="startDate">
              Select Start Date
            </label>
            <Input
              id="startDate"
              type="date"
              min={new Date().toISOString().split('T')[0]}
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="max-w-xs"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="modal-secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="modal-primary"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Enrolling...' : 'Confirm Enrollment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
