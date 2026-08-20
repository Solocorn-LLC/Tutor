'use client'

import { useState, useEffect } from 'react'
import { Timer } from 'lucide-react'

interface TimerInputProps {
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
}

function parseTimeLimit(value?: string): { hours: number; minutes: number } {
  if (!value) return { hours: 0, minutes: 0 }
  const [h, m] = value.split(':').map(Number)
  return {
    hours: Number.isFinite(h) ? Math.max(0, Math.min(99, h)) : 0,
    minutes: Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0,
  }
}

function formatTimeLimit(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function TimerInput({ value, onChange, disabled }: TimerInputProps) {
  const { hours, minutes } = parseTimeLimit(value)
  const [hourValue, setHourValue] = useState(String(hours).padStart(2, '0'))
  const [minuteValue, setMinuteValue] = useState(String(minutes).padStart(2, '0'))

  useEffect(() => {
    const { hours: h, minutes: m } = parseTimeLimit(value)
    setHourValue(String(h).padStart(2, '0'))
    setMinuteValue(String(m).padStart(2, '0'))
  }, [value])

  const commit = (h: number, m: number) => {
    const clampedH = Math.max(0, Math.min(99, h))
    const clampedM = Math.max(0, Math.min(59, m))
    onChange(formatTimeLimit(clampedH, clampedM))
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm">
      <Timer className="h-3.5 w-3.5 text-slate-400" />
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={hourValue}
          onChange={e => {
            const raw = e.target.value.replace(/\D/g, '').slice(0, 2)
            setHourValue(raw)
            const h = raw === '' ? 0 : Number(raw)
            commit(h, minutes)
          }}
          onBlur={() => setHourValue(String(hours).padStart(2, '0'))}
          className="h-6 w-9 rounded border border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-700 focus:border-blue-400 focus:outline-none disabled:opacity-50"
        />
        <span className="text-xs text-slate-400">:</span>
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={minuteValue}
          onChange={e => {
            const raw = e.target.value.replace(/\D/g, '').slice(0, 2)
            setMinuteValue(raw)
            const m = raw === '' ? 0 : Number(raw)
            commit(hours, m)
          }}
          onBlur={() => setMinuteValue(String(minutes).padStart(2, '0'))}
          className="h-6 w-9 rounded border border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-700 focus:border-blue-400 focus:outline-none disabled:opacity-50"
        />
      </div>
      <span className="text-[11px] text-slate-400">HH:MM</span>
    </div>
  )
}
