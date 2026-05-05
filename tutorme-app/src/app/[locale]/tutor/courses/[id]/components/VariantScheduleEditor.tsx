'use client'

import { useMemo, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import type { ScheduleItem } from '../constants'
import { DAYS, TIME_SLOT_OPTIONS } from '../constants'

interface VariantScheduleEditorProps {
  schedule: ScheduleItem[]
  onScheduleChange: (updater: (prev: ScheduleItem[]) => ScheduleItem[]) => void
  price?: number | null
  weeksToSchedule?: number
  onWeeksChange?: (weeks: number) => void
}

const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

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
  weeksToSchedule = 8,
  onWeeksChange,
}: VariantScheduleEditorProps) {
  const [scheduleWeekOffset, setScheduleWeekOffset] = useState(0)
  const [scheduleRepeatWeekly, setScheduleRepeatWeekly] = useState(false)
  const [numberOfWeeks, setNumberOfWeeks] = useState(weeksToSchedule || 8)
  const [totalSessionsDesired, setTotalSessionsDesired] = useState<number | ''>('')

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

  const effectiveWeeks =
    scheduleRepeatWeekly &&
    Array.isArray(schedule) &&
    schedule.filter(Boolean).length > 0 &&
    totalSessionsDesired !== '' &&
    Number(totalSessionsDesired) > 0
      ? Math.max(1, Math.ceil(Number(totalSessionsDesired) / schedule.filter(Boolean).length))
      : Math.max(1, numberOfWeeks || 8)

  // Safely fallback number of weeks if undefined
  const safeNumberOfWeeks = numberOfWeeks || 8
  useEffect(() => {
    if (effectiveWeeks !== weeksToSchedule) {
      onWeeksChange?.(effectiveWeeks)
    }
  }, [effectiveWeeks, weeksToSchedule, onWeeksChange])

  const scheduleSummary = useMemo(() => {
    if (!Array.isArray(schedule) || schedule.length === 0) return []
    const validSchedule = schedule.filter(Boolean)
    if (scheduleRepeatWeekly) {
      const MAX_WEEKS = 52
      const weeks = Math.min(
        MAX_WEEKS,
        totalSessionsDesired !== '' && Number(totalSessionsDesired) > 0 && validSchedule.length > 0
          ? Math.max(1, Math.ceil(Number(totalSessionsDesired) / validSchedule.length))
          : Math.max(1, safeNumberOfWeeks)
      )
      const expanded: ScheduleItem[] = []
      for (let w = 0; w < weeks; w++) {
        validSchedule.forEach(slot => expanded.push({ ...slot }))
      }
      return expanded
    }
    return [...validSchedule]
  }, [schedule, scheduleRepeatWeekly, safeNumberOfWeeks, totalSessionsDesired])

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
    onScheduleChange(prevRaw => {
      const prev = Array.isArray(prevRaw) ? prevRaw.filter(Boolean) : []
      const idx = prev.findIndex(s => {
        if (!s || s.dayOfWeek !== day) return false
        if (!scheduleRepeatWeekly) {
          if (s.date ? s.date !== dateKey : scheduleWeekOffset !== 0) return false
        }
        const [sh, sm] = (s.startTime || '00:00').split(':').map(Number)
        const startM = sh * 60 + sm
        const endM = startM + (s.durationMinutes || 60)
        const [th, tm] = timeStr.split(':').map(Number)
        const slotM = th * 60 + tm
        return slotM >= startM && slotM < endM
      })
      if (idx >= 0) {
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)]
      }
      return [
        ...prev,
        {
          dayOfWeek: day,
          startTime: timeStr,
          durationMinutes: 60,
          ...(scheduleRepeatWeekly ? {} : { date: dateKey }),
        },
      ]
    })
  }

  return (
    <div className="space-y-6">
      {/* Cost vs Revenue - visible when price and schedule are set */}
      {priceNumber > 0 && Array.isArray(schedule) && schedule.filter(Boolean).length > 0 && (
        <div className="grid grid-cols-2 gap-3 rounded-[14px] border border-white/10 bg-white/10 p-4 text-sm text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)]">
          <div>
            <div className="text-xs font-medium text-white/70">Cost for course</div>
            <div className="font-medium">USD {scheduleCost.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-white/70">Revenue (after 30% commission)</div>
            <div className="font-medium">USD {totalRevenue.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Weekly repeat option */}
      <div className="flex flex-wrap items-center gap-4 rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white px-5 py-4 text-[#1F2933] shadow-[0_10px_24px_rgba(15,23,42,0.16)] transition-shadow duration-200 hover:shadow-[0_14px_32px_rgba(15,23,42,0.22)]">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={scheduleRepeatWeekly}
            onChange={e => setScheduleRepeatWeekly(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span className="text-sm font-semibold">Apply same schedule every week</span>
        </label>
        {scheduleRepeatWeekly && Array.isArray(schedule) && schedule.filter(Boolean).length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Number of weeks</Label>
              <Input
                type="number"
                min={1}
                max={52}
                value={totalSessionsDesired !== '' ? effectiveWeeks : safeNumberOfWeeks}
                onChange={e => {
                  const val = parseInt(e.target.value, 10)
                  const v = Math.max(1, Number.isNaN(val) ? 8 : val)
                  setNumberOfWeeks(v)
                  if (totalSessionsDesired !== '') setTotalSessionsDesired('')
                }}
                disabled={totalSessionsDesired !== ''}
                className="h-8 w-20 text-sm"
              />
              {totalSessionsDesired !== '' && (
                <span className="text-muted-foreground text-xs">
                  = {effectiveWeeks} weeks from {totalSessionsDesired} sessions
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Or total sessions</Label>
              <Input
                type="number"
                min={1}
                placeholder="e.g. 20"
                value={totalSessionsDesired}
                onChange={e =>
                  setTotalSessionsDesired(
                    e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 0)
                  )
                }
                className="h-8 w-24 text-sm"
              />
              <span className="text-muted-foreground text-xs">
                sessions (weeks = sessions ÷ slots per week)
              </span>
            </div>
          </>
        )}
      </div>

      {/* Calendar grid */}
      <p className="text-xs font-medium text-white/70">
        Click a time slot to add or remove a 1-hour session.
      </p>
      <div
        key={`week-${scheduleWeekStart.getTime()}`}
        className="overflow-hidden rounded-[14px] bg-white"
        style={{
          margin: '16px 0',
          boxShadow:
            '0 18px 45px rgba(0,0,0,0.14), 0 6px 18px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(209,213,219,0.85)] bg-[rgba(31,41,51,0.92)] px-4 py-3 text-white">
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
        <div className="grid grid-cols-8 border-b border-[rgba(209,213,219,0.85)] bg-white">
          <div className="flex h-12 min-w-[150px] items-center justify-center border-r border-[rgba(209,213,219,0.85)] px-2 text-center text-xs font-semibold text-slate-700">
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
        <ScrollArea className="h-[320px]">
          <div className="grid grid-cols-8">
            {TIME_SLOT_OPTIONS.map(timeStr => {
              const hour = parseInt(timeStr.slice(0, 2), 10)
              const endHour = hour + 1
              const startLabel = `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`
              const endLabel = `${endHour % 12 || 12} ${endHour >= 12 ? 'PM' : 'AM'}`
              const displayTime = `${startLabel} \u2013 ${endLabel}`
              return (
                <div key={timeStr} className="contents">
                  <div className="flex h-12 min-w-[150px] items-center justify-center border-b border-r border-[rgba(209,213,219,0.85)] px-2 text-center text-[11px] font-semibold text-slate-600">
                    {displayTime}
                  </div>
                  {DAYS.map((day, dayIndex) => {
                    const dateKey = formatDateKey(weekDates[dayIndex])
                    const validScheduleArray = Array.isArray(schedule)
                      ? schedule.filter(Boolean)
                      : []
                    const matchingSlotIndex = validScheduleArray.findIndex(s => {
                      if (!s || s.dayOfWeek !== day) return false
                      if (!scheduleRepeatWeekly) {
                        if (s.date ? s.date !== dateKey : scheduleWeekOffset !== 0) return false
                      }
                      const [sh, sm] = (s.startTime || '00:00').split(':').map(Number)
                      const startM = sh * 60 + sm
                      const endM = startM + (s.durationMinutes || 60)
                      const [th, tm] = timeStr.split(':').map(Number)
                      const slotM = th * 60 + tm
                      return slotM >= startM && slotM < endM
                    })
                    const inRange = matchingSlotIndex >= 0
                    let sessionNum = 0
                    if (inRange) {
                      const currentSlot = validScheduleArray[matchingSlotIndex]
                      const sortedSessions = [...validScheduleArray].sort((a, b) => {
                        const aDate = a.date || ''
                        const bDate = b.date || ''
                        if (aDate !== bDate) return aDate.localeCompare(bDate)
                        return (a.startTime || '').localeCompare(b.startTime || '')
                      })
                      sessionNum =
                        sortedSessions.findIndex(
                          s =>
                            s &&
                            s.dayOfWeek === currentSlot.dayOfWeek &&
                            s.startTime === currentSlot.startTime &&
                            s.date === currentSlot.date
                        ) + 1
                    }
                    return (
                      <div
                        key={`${day}-${timeStr}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleSlot(day, dateKey, timeStr)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            toggleSlot(day, dateKey, timeStr)
                          }
                        }}
                        className={`flex h-12 w-full cursor-pointer items-center justify-center border-b border-r border-[rgba(209,213,219,0.85)] px-2 text-center transition-colors ${inRange ? 'bg-[#1D4ED8] font-semibold text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                        aria-pressed={inRange}
                        aria-label={`${day} ${displayTime}${inRange ? ', selected' : ''}. Click to ${inRange ? 'remove' : 'add'} session.`}
                      >
                        {inRange ? <span className="text-[11px]">Session {sessionNum}</span> : null}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Schedule Summary */}
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
                          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
    </div>
  )
}
