'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

export function SessionCountdown({ scheduledAt }: { scheduledAt: string }) {
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    const target = new Date(scheduledAt).getTime()
    const tick = () => {
      const diff = target - Date.now()
      if (diff <= 0) {
        setCountdown('Starting now')
        return
      }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setCountdown(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      )
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [scheduledAt])

  if (!countdown) return null

  return (
    <span className="flex items-center gap-1 text-xs font-medium text-emerald-300">
      <Clock className="h-3 w-3" />
      <span className="tabular-nums">{countdown}</span>
    </span>
  )
}
