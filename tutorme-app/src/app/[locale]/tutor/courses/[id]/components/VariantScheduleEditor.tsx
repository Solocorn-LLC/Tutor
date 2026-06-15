'use client'

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ScheduleItem } from '../constants'
import { DAYS, TIME_SLOT_OPTIONS } from '../constants'
import { expandSchedule, extractTemplate } from './expand-schedule'

interface AvailabilityData {
  availability: Array<{ dayOfWeek: number; startTime: string; endTime: string }>
  exceptions: Array<{
    date: string
    isAvailable: boolean
    startTime: string | null
    endTime: string | null
    reason: string | null
  }>
  events: Array<{ date: string; startTime: string; endTime: string; title: string }>
  oneOnOnes: Array<{ date: string; startTime: string; endTime: string }>
}

interface VariantScheduleEditorProps {
  schedule: ScheduleItem[]
  onScheduleChange: (updater: (prev: ScheduleItem[]) => ScheduleItem[]) => void
  price?: number | null
  weeksToSchedule?: number
  onWeeksChange?: (weeks: number) => void
  allVariantsSchedules?: ScheduleItem[][]
  excludedSchedules?: ScheduleItem[][]
  siblingSchedules?: ScheduleItem[][]
}

const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const DAY_TO_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

function formatTime(time: string) {
  if (!time || typeof time !== 'string') return '–'
  const parts = time.split(':')
  const hour = Number(parts[0])
  const minute = Number(parts[1] ?? 0)
  if (Number.isNaN(hour)) return '–'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  const period = hour >= 12 ? 'PM' : 'AM'
  return `${displayHour}:${minute.toString().padStart(2, '0')}${period}`
}

function formatTimeRange(startTime: string, durationMinutes: number) {
  if (!startTime || typeof startTime !== 'string') return '–'
  const parts = startTime.split(':')
  const startHour = Number(parts[0])
  const startMinute = Number(parts[1] ?? 0)
  if (Number.isNaN(startHour)) return '–'
  const startTotal = startHour * 60 + startMinute
  const dur = Number(durationMinutes) || 0
  const endTotal = startTotal + dur
  const endHour = Math.floor((endTotal / 60) % 24)
  const endMinute = endTotal % 60
  const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`
  return `${formatTime(startTime)}–${formatTime(endTime)}`
}

function timeToMinutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(endA) > timeToMinutes(startB)
}

const timezoneLabel = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time'
  } catch {
    return 'Local time'
  }
})()

export function VariantScheduleEditor({
  schedule,
  onScheduleChange,
  price,
  weeksToSchedule = 1,
  onWeeksChange,
  allVariantsSchedules,
  excludedSchedules,
  siblingSchedules,
}: VariantScheduleEditorProps) {
  const calendarScrollRef = useRef<HTMLDivElement>(null)
  const [scheduleWeekOffset, setScheduleWeekOffset] = useState(0)
  const [numberOfWeeks, setNumberOfWeeks] = useState(Math.max(1, weeksToSchedule || 1))
  const [modeTab, setModeTab] = useState('schedule')
  const [availabilityData, setAvailabilityData] = useState<AvailabilityData | null>(null)

  const scheduleWeekStart = (() => {
    const d = new Date()
    const day = d.getDay()
    const mon = d.getDate() - (day === 0 ? 6 : day - 1) + scheduleWeekOffset * 7
    const start = new Date(d.getFullYear(), d.getMonth(), mon)
    return start
  })()

  const scheduleWeekLabel = (() => {
    const end = new Date(scheduleWeekStart)
    end.setDate(end.getDate() + 6)
    return `${scheduleWeekStart.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
  })()

  const scheduleMonthLabel = scheduleWeekStart.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const weekDates = DAYS.map((_, i) => {
    const d = new Date(scheduleWeekStart)
    d.setDate(scheduleWeekStart.getDate() + i)
    return d
  })

  const formatDateKey = (date: Date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // Fetch availability data when week offset changes
  useEffect(() => {
    let active = true
    const fetchAvailability = async () => {
      try {
        const start = new Date(scheduleWeekStart)
        start.setHours(0, 0, 0, 0)
        const end = new Date(start)
        end.setDate(end.getDate() + 6 + (numberOfWeeks || 8) * 7)
        const url = new URL('/api/tutor/calendar/availability', window.location.origin)
        url.searchParams.set('mode', 'schedule')
        url.searchParams.set('start', start.toISOString())
        url.searchParams.set('end', end.toISOString())
        const res = await fetch(url.toString())
        if (!res.ok) throw new Error(`Failed to fetch availability: ${res.status}`)
        const data = await res.json()
        if (active) {
          setAvailabilityData({
            availability: data.availability || [],
            exceptions: data.exceptions || [],
            events: data.events || [],
            oneOnOnes: data.oneOnOnes || [],
          })
        }
      } catch (err: any) {
        console.error('Availability fetch error:', err)
        if (active) setAvailabilityData(null)
      } finally {
        // no-op
      }
    }
    fetchAvailability()
    return () => {
      active = false
    }
  }, [scheduleWeekOffset, numberOfWeeks])

  const getSlotStatus = useCallback(
    (day: string, dateKey: string, timeStr: string, durationMinutes = 60) => {
      if (!availabilityData) return { available: true, reason: '' }

      const dayIndex = DAY_TO_INDEX[day]
      if (dayIndex === undefined) return { available: true, reason: '' }

      const slotStartM = timeToMinutes(timeStr)
      const slotEndM = slotStartM + durationMinutes
      const slotStartStr = timeStr
      const slotEndStr = `${Math.floor(slotEndM / 60)
        .toString()
        .padStart(2, '0')}:${(slotEndM % 60).toString().padStart(2, '0')}`

      // 1. Check recurring availability
      const dayAvailability = availabilityData.availability.filter(a => a.dayOfWeek === dayIndex)
      const withinAvailability = dayAvailability.some(a =>
        timesOverlap(slotStartStr, slotEndStr, a.startTime, a.endTime)
      )
      if (dayAvailability.length > 0 && !withinAvailability) {
        return { available: false, reason: 'Outside your set availability' }
      }

      // 2. Check exceptions
      const dayExceptions = availabilityData.exceptions.filter(e => e.date === dateKey)
      for (const ex of dayExceptions) {
        if (!ex.isAvailable) {
          return { available: false, reason: ex.reason || 'Blocked by exception' }
        }
        if (ex.startTime && ex.endTime) {
          if (timesOverlap(slotStartStr, slotEndStr, ex.startTime, ex.endTime)) {
            return { available: false, reason: ex.reason || 'Blocked by exception' }
          }
        }
      }

      // 3. Check existing events
      const dayEvents = availabilityData.events.filter(e => e.date === dateKey)
      for (const ev of dayEvents) {
        if (timesOverlap(slotStartStr, slotEndStr, ev.startTime, ev.endTime)) {
          return { available: false, reason: `Conflict: ${ev.title || 'Existing booking'}` }
        }
      }

      // 4. Check one-on-ones
      const dayOneOnOnes = availabilityData.oneOnOnes.filter(o => o.date === dateKey)
      for (const o of dayOneOnOnes) {
        if (timesOverlap(slotStartStr, slotEndStr, o.startTime, o.endTime)) {
          return { available: false, reason: 'Conflict: One-on-one booking' }
        }
      }

      // 5. Check excluded schedules (e.g., original course schedule when rescheduling)
      for (const excludedSchedule of excludedSchedules ?? []) {
        for (const s of excludedSchedule) {
          if (!s || s.dayOfWeek !== day) continue
          if (s.date && s.date !== dateKey) continue
          const [sh, sm] = (s.startTime || '00:00').split(':').map(Number)
          const sStartM = sh * 60 + sm
          const sEndM = sStartM + (s.durationMinutes || 60)
          const cellStartM = timeToMinutes(timeStr)
          const cellEndM = cellStartM + durationMinutes
          if (cellStartM < sEndM && cellEndM > sStartM) {
            return { available: false, reason: 'Scheduled in original course' }
          }
        }
      }

      // 6. Check other schedules in the same variant for same day/time conflict
      for (const siblingSchedule of siblingSchedules ?? []) {
        for (const s of siblingSchedule) {
          if (!s || s.dayOfWeek !== day) continue
          if (s.date && s.date !== dateKey) continue
          const [sh, sm] = (s.startTime || '00:00').split(':').map(Number)
          const sStartM = sh * 60 + sm
          const sEndM = sStartM + (s.durationMinutes || 60)
          const cellStartM = timeToMinutes(timeStr)
          const cellEndM = cellStartM + durationMinutes
          if (cellStartM < sEndM && cellEndM > sStartM) {
            return { available: false, reason: 'Already scheduled in another schedule' }
          }
        }
      }

      // 7. Check other variants for same day/time conflict
      for (const otherSchedule of allVariantsSchedules ?? []) {
        for (const s of otherSchedule) {
          if (!s || s.dayOfWeek !== day) continue
          // If the other slot has a specific date, only conflict on that exact date
          if (s.date && s.date !== dateKey) continue
          const [sh, sm] = (s.startTime || '00:00').split(':').map(Number)
          const sStartM = sh * 60 + sm
          const sEndM = sStartM + (s.durationMinutes || 60)
          const cellStartM = timeToMinutes(timeStr)
          const cellEndM = cellStartM + durationMinutes
          if (cellStartM < sEndM && cellEndM > sStartM) {
            return { available: false, reason: 'Already scheduled in another variant' }
          }
        }
      }

      return { available: true, reason: '' }
    },
    [availabilityData, allVariantsSchedules, excludedSchedules, siblingSchedules]
  )

  const effectiveWeeks = Math.max(1, numberOfWeeks || 1)

  useEffect(() => {
    if (effectiveWeeks !== weeksToSchedule) {
      onWeeksChange?.(effectiveWeeks)
    }
  }, [effectiveWeeks, weeksToSchedule, onWeeksChange])

  // Auto-expand schedule when the number of weeks changes
  const prevWeeksRef = useRef(effectiveWeeks)
  useEffect(() => {
    if (effectiveWeeks !== prevWeeksRef.current) {
      const template = extractTemplate(schedule)
      if (template.length > 0) {
        const expanded = expandSchedule(template, effectiveWeeks, scheduleWeekStart)
        onScheduleChange(() => expanded)
      }
      prevWeeksRef.current = effectiveWeeks
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveWeeks])

  const scheduleSummary = useMemo(() => {
    if (!Array.isArray(schedule) || schedule.length === 0) return []
    const validSchedule = schedule.filter(Boolean)

    // If schedule is already expanded (has dates), return as-is
    const hasDates = validSchedule.some(s => s.date)
    if (hasDates) return [...validSchedule]

    // Expand template slots on-the-fly for summary
    const MAX_WEEKS = 52
    const weeks = Math.min(MAX_WEEKS, effectiveWeeks)
    const expanded: ScheduleItem[] = []
    for (let w = 0; w < weeks; w++) {
      validSchedule.forEach(slot => expanded.push({ ...slot }))
    }
    return expanded
  }, [schedule, effectiveWeeks])

  const priceNumber = Number(price)
  const scheduleCost = scheduleSummary.reduce((sum, slot) => {
    if (!priceNumber || Number.isNaN(priceNumber)) return sum
    const dur = slot?.durationMinutes ?? 0
    return sum + (dur / 60) * priceNumber
  }, 0)
  const totalRevenue = scheduleCost * 0.7
  const totalSessions = scheduleSummary.length
  const totalDurationMinutes = scheduleSummary.reduce(
    (sum, slot) => sum + (slot.durationMinutes ?? 0),
    0
  )
  const totalDurationHours = (totalDurationMinutes / 60).toFixed(1)

  const scheduleByDay = scheduleSummary.reduce(
    (acc, slot) => {
      const day = slot?.dayOfWeek
      if (!day) return acc
      if (!acc[day]) acc[day] = []
      acc[day].push(slot)
      return acc
    },
    {} as Record<string, ScheduleItem[]>
  )

  const toggleSlot = (day: string, dateKey: string, timeStr: string) => {
    const status = getSlotStatus(day, dateKey, timeStr, 60)
    if (!status.available) {
      if (status.reason.includes('One-on-one')) {
        toast.error('This slot conflicts with a one-on-one booking.')
      } else if (
        status.reason.includes('Existing booking') ||
        status.reason.includes('Conflict:')
      ) {
        toast.error('This slot conflicts with an existing scheduled session.')
      } else if (status.reason.includes('exception')) {
        toast.error('This slot is blocked by a calendar exception.')
      } else if (status.reason.includes('availability')) {
        toast.error('This slot is outside your set availability hours.')
      } else {
        toast.error(`This slot is unavailable. ${status.reason}`)
      }
      return
    }

    onScheduleChange(prevRaw => {
      const prev = Array.isArray(prevRaw) ? prevRaw.filter(Boolean) : []

      // Check if this day+time is already in the schedule (works for both template and expanded)
      const matchingIndex = prev.findIndex(s => {
        if (!s || s.dayOfWeek !== day) return false
        const [sh, sm] = (s.startTime || '00:00').split(':').map(Number)
        const startM = sh * 60 + sm
        const endM = startM + (s.durationMinutes || 60)
        const [th, tm] = timeStr.split(':').map(Number)
        const slotM = th * 60 + tm
        return slotM >= startM && slotM < endM
      })

      // Always work in repeat mode: toggle the template slot and regenerate all weeks
      const hasMatch = matchingIndex >= 0
      const template = extractTemplate(prev)
      const templateKey = `${day}|${timeStr}`
      const templateIdx = template.findIndex(s => s.dayOfWeek === day && s.startTime === timeStr)

      if (hasMatch || templateIdx >= 0) {
        // Remove this day+time from template and regenerate
        const newTemplate = template.filter(s => `${s.dayOfWeek}|${s.startTime}` !== templateKey)
        if (newTemplate.length === 0) return []
        return expandSchedule(newTemplate, effectiveWeeks, scheduleWeekStart)
      }

      // Add to template and regenerate
      const newTemplate = [...template, { dayOfWeek: day, startTime: timeStr, durationMinutes: 60 }]
      return expandSchedule(newTemplate, effectiveWeeks, scheduleWeekStart)
    })
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs value={modeTab} onValueChange={setModeTab} className="flex w-full flex-1 flex-col">
        <TabsList className="grid h-auto w-full grid-cols-3 items-center rounded-xl bg-[#1F2933] p-3">
          <TabsTrigger
            value="schedule"
            className="rounded-lg py-1.5 text-white/80 hover:text-white data-[state=active]:bg-white data-[state=active]:text-[#1F2933] data-[state=active]:shadow-none"
          >
            Schedule
          </TabsTrigger>
          <TabsTrigger
            value="summary"
            className="rounded-lg py-1.5 text-white/80 hover:text-white data-[state=active]:bg-white data-[state=active]:text-[#1F2933] data-[state=active]:shadow-none"
          >
            Summary
          </TabsTrigger>
          <TabsTrigger
            value="content"
            className="rounded-lg py-1.5 text-white/80 hover:text-white data-[state=active]:bg-white data-[state=active]:text-[#1F2933] data-[state=active]:shadow-none"
          >
            Content
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-6 flex flex-1 flex-col gap-6 overflow-hidden">
          {/* Cost vs Revenue - visible when price and schedule are set */}
          {priceNumber > 0 && Array.isArray(schedule) && schedule.filter(Boolean).length > 0 && (
            <div className="grid grid-cols-2 gap-3 rounded-[14px] border border-white/10 bg-white/10 p-4 text-sm text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)]">
              <div>
                <div className="text-xs font-medium text-white/70">Cost for course</div>
                <div className="font-medium">USD {scheduleCost.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-white/70">
                  Revenue (after 30% commission)
                </div>
                <div className="font-medium">USD {totalRevenue.toFixed(2)}</div>
              </div>
            </div>
          )}

          {/* Apply same schedule for N weeks */}
          <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white px-5 py-4 text-[#1F2933] shadow-[0_10px_24px_rgba(15,23,42,0.16)] transition-shadow duration-200 hover:shadow-[0_14px_32px_rgba(15,23,42,0.22)]">
            <span className="text-sm font-semibold">Apply same weekly schedule for</span>
            <input
              type="number"
              min={1}
              max={52}
              value={numberOfWeeks}
              onChange={e => {
                const val = parseInt(e.target.value, 10)
                const v = Math.max(1, Math.min(52, Number.isNaN(val) ? 1 : val))
                setNumberOfWeeks(v)
              }}
              className="h-9 w-12 rounded-lg border border-slate-200 bg-white px-1 text-center text-sm text-[#1F2933] [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-sm font-semibold">weeks.</span>
          </div>

          {/* Calendar grid */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-white/70">
              Click a time slot to add or remove a 1-hour session.
              {availabilityData && ' Unavailable slots are greyed out.'}
            </p>
            {availabilityData && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white px-3 py-2 text-[10px] font-medium text-slate-600 shadow-sm">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm bg-[#1D4ED8]" />
                  Selected
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm border border-slate-200 bg-white" />
                  Available
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm bg-red-500/10" />
                  Unavailable
                </span>
              </div>
            )}
          </div>
          <div
            key={`week-${scheduleWeekStart.getTime()}`}
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-white"
            style={{
              boxShadow:
                '0 18px 45px rgba(0,0,0,0.14), 0 6px 18px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(209,213,219,0.85)] bg-[#1D4ED8] px-4 py-3 text-white">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => setScheduleWeekOffset(o => o - 1)}
                  aria-label="Previous week"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[180px] text-center text-xs font-semibold text-white">
                  {scheduleWeekLabel}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => setScheduleWeekOffset(o => o + 1)}
                  aria-label="Next week"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <span className="text-xs font-semibold text-white/70">{scheduleMonthLabel}</span>
              <div className="flex items-center gap-1">
                <span className="mr-1 text-[10px] font-semibold text-white/60">Month:</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => setScheduleWeekOffset(o => o - 4)}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => setScheduleWeekOffset(o => o + 4)}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-[150px_repeat(7,_1fr)] border-b border-[rgba(209,213,219,0.85)] bg-white">
              <div className="flex h-12 items-center justify-center border-r border-[rgba(209,213,219,0.85)] px-2 text-center text-xs font-semibold text-slate-700">
                Time
              </div>
              {DAYS.map((day, i) => {
                const d = weekDates[i]
                return (
                  <div
                    key={`${day}-${d.getTime()}`}
                    className="flex h-12 items-center justify-center border-r border-[rgba(209,213,219,0.85)] px-2 text-center text-xs font-semibold text-slate-700"
                  >
                    <div className="leading-tight">
                      <div>{day.slice(0, 3)}</div>
                      <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                        {d.getDate()}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="relative flex min-h-0 flex-1 flex-col">
              <div
                ref={calendarScrollRef}
                className="scrollbar-hide flex-1 overflow-y-auto"
              >
                <div className="grid grid-cols-[150px_repeat(7,_1fr)]">
                  {TIME_SLOT_OPTIONS.map(timeStr => {
                    const hour = parseInt(timeStr.slice(0, 2), 10)
                    const endHour = hour + 1
                    const startLabel = `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`
                    const endLabel = `${endHour % 12 || 12} ${endHour >= 12 ? 'PM' : 'AM'}`
                    const displayTime = `${startLabel} \u2013 ${endLabel}`
                    return (
                      <div key={timeStr} className="contents">
                        <div className="flex h-12 items-center justify-center border-b border-r border-[rgba(209,213,219,0.85)] px-2 text-center text-[11px] font-semibold text-slate-600">
                          {displayTime}
                        </div>
                        {DAYS.map((day, dayIndex) => {
                          const dateKey = formatDateKey(weekDates[dayIndex])
                          const validScheduleArray = Array.isArray(schedule)
                            ? schedule.filter(Boolean)
                            : []
                          const matchingSlotIndex = validScheduleArray.findIndex(s => {
                            if (!s || s.dayOfWeek !== day) return false
                            // For dated slots (expanded schedule), match exact date
                            if (s.date && s.date !== dateKey) return false
                            // For non-dated slots (template), match any week
                            const [sh, sm] = (s.startTime || '00:00').split(':').map(Number)
                            const startM = sh * 60 + sm
                            const endM = startM + (s.durationMinutes || 60)
                            const [th, tm] = timeStr.split(':').map(Number)
                            const slotM = th * 60 + tm
                            return slotM >= startM && slotM < endM
                          })
                          const inRange = matchingSlotIndex >= 0
                          // Show week number for expanded schedules, session index for templates
                          let sessionLabel = ''
                          if (inRange) {
                            const currentSlot = validScheduleArray[matchingSlotIndex]
                            if (currentSlot.date) {
                              // Find which week this slot belongs to
                              const allForDayTime = validScheduleArray.filter(
                                s =>
                                  s.dayOfWeek === currentSlot.dayOfWeek &&
                                  s.startTime === currentSlot.startTime
                              )
                              const sorted = allForDayTime.sort((a, b) =>
                                (a.date || '').localeCompare(b.date || '')
                              )
                              const weekNum = sorted.findIndex(s => s.date === currentSlot.date) + 1
                              sessionLabel = `Week ${weekNum}`
                            } else {
                              const sortedSessions = [...validScheduleArray].sort((a, b) => {
                                const aDate = a.date || ''
                                const bDate = b.date || ''
                                if (aDate !== bDate) return aDate.localeCompare(bDate)
                                return (a.startTime || '').localeCompare(b.startTime || '')
                              })
                              const idx = sortedSessions.findIndex(
                                s =>
                                  s &&
                                  s.dayOfWeek === currentSlot.dayOfWeek &&
                                  s.startTime === currentSlot.startTime &&
                                  s.date === currentSlot.date
                              )
                              sessionLabel = `Session ${idx + 1}`
                            }
                          }

                          const slotStatus = getSlotStatus(day, dateKey, timeStr, 60)
                          const isUnavailable = !inRange && !slotStatus.available

                          const cellClass = inRange
                            ? 'bg-[#1D4ED8] font-semibold text-white'
                            : isUnavailable
                              ? 'bg-red-500/10 text-slate-500 cursor-not-allowed'
                              : 'bg-white text-slate-700 hover:bg-slate-50 cursor-pointer'

                          return (
                            <div
                              key={`${day}-${timeStr}`}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                if (!isUnavailable) toggleSlot(day, dateKey, timeStr)
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  if (!isUnavailable) toggleSlot(day, dateKey, timeStr)
                                }
                              }}
                              className={`flex h-12 w-full items-center justify-center border-b border-r border-[rgba(209,213,219,0.85)] px-2 text-center transition-colors ${cellClass}`}
                              aria-pressed={inRange}
                              aria-label={`${day} ${displayTime}${inRange ? ', selected' : ''}. Click to ${inRange ? 'remove' : 'add'} session.`}
                              title={isUnavailable ? slotStatus.reason : undefined}
                            >
                              {inRange ? <span className="text-[11px]">{sessionLabel}</span> : null}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>

            </div>
          </div>
        </TabsContent>

        <TabsContent value="summary" className="mt-4">
          {scheduleSummary.length > 0 && (
            <div className="rounded-[18px] border border-white/10 bg-[rgba(39,43,50,0.72)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.28)] backdrop-blur-[18px]">
              <div className="flex items-start justify-between gap-4 border-b border-white/15 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold text-white">
                    <CalendarIcon className="h-5 w-5 text-white/80" />
                    Schedule Summary
                  </div>
                  <div className="mt-1 text-xs font-medium text-white/70">
                    Times in {timezoneLabel}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex min-h-12 items-center justify-between gap-3 rounded-[12px] border border-[rgba(226,232,240,0.9)] bg-white px-[18px] py-3 text-[#1F2933]">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Sessions
                    </span>
                    <span className="text-sm font-semibold">{totalSessions}</span>
                  </div>
                  <div className="flex min-h-12 items-center justify-between gap-3 rounded-[12px] border border-[rgba(226,232,240,0.9)] bg-white px-[18px] py-3 text-[#1F2933]">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Total Duration
                    </span>
                    <span className="text-sm font-semibold">{totalDurationHours} h</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-semibold text-white">By day</div>
                  {dayOrder
                    .filter(day => scheduleByDay[day]?.length)
                    .map(day => {
                      const slots = scheduleByDay[day]
                        .slice()
                        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
                      const first = slots[0]
                      const extras = Math.max(0, slots.length - 1)
                      const dateLabel = first?.date
                        ? (() => {
                            try {
                              const d = new Date(first.date + 'T00:00:00')
                              if (Number.isNaN(d.getTime())) return first.date
                              return d.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })
                            } catch {
                              return first.date
                            }
                          })()
                        : ''
                      const timeLabel = first
                        ? formatTimeRange(first.startTime, first.durationMinutes)
                        : ''
                      const durationLabel = first ? `${first.durationMinutes}m` : ''

                      return (
                        <div
                          key={day}
                          className="flex items-center justify-between gap-4 rounded-[12px] border border-[rgba(226,232,240,0.9)] bg-white px-[18px] py-[14px] text-[#1F2933]"
                        >
                          <div className="flex min-w-0 items-center gap-4">
                            <div className="w-[92px] shrink-0 font-semibold">{day}</div>
                            <div className="min-w-0 text-sm text-slate-700">
                              <span className="font-medium">{dateLabel}</span>
                              <span className="mx-2 text-slate-400">•</span>
                              <span className="font-medium">{timeLabel}</span>
                              <span className="mx-2 text-slate-400">•</span>
                              <span className="text-slate-600">{durationLabel}</span>
                              <span className="mx-2 text-slate-400">•</span>
                              <span className="text-slate-600">0 students</span>
                              {extras > 0 ? (
                                <span className="ml-2 text-slate-500">• +{extras} more</span>
                              ) : null}
                            </div>
                          </div>
                          <Badge
                            variant="secondary"
                            className="shrink-0 rounded-full bg-slate-100 text-xs font-semibold text-slate-600"
                          >
                            {slots.length} session{slots.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="content" className="mt-4">
          <div className="rounded-[18px] border border-white/10 bg-[rgba(39,43,50,0.72)] p-8 text-center text-white/70">
            Content settings coming soon.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
