'use client'

import * as React from 'react'
import { useRef } from 'react'
import { motion } from 'framer-motion'
import { Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSlidingPillMetrics } from '@/hooks/use-sliding-pill'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { type CalendarView } from '@/app/[locale]/tutor/dashboard/components/InteractiveCalendar'

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Europe/Istanbul',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
]

function formatTimezoneLabel(tz: string) {
  const parts = tz.split('/')
  const city = parts[parts.length - 1]?.replace(/_/g, ' ') || tz
  return { city }
}

interface SessionCalendarPanelTab {
  value: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

interface SessionCalendarPanelProps {
  value: string
  onValueChange: (value: string) => void
  tabs: SessionCalendarPanelTab[]
  children: React.ReactNode
  showCalendarControls?: boolean
  calendarView?: CalendarView
  onCalendarViewChange?: (view: CalendarView) => void
  timezone?: string
  onTimezoneChange?: (tz: string) => void
  variant?: 'blue' | 'orange' | 'charcoal'
}

export function SessionCalendarPanel({
  value,
  onValueChange,
  tabs,
  children,
  showCalendarControls = false,
  calendarView,
  onCalendarViewChange,
  timezone,
  onTimezoneChange,
  variant = 'blue',
}: SessionCalendarPanelProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([])
  const activeIndex = tabs.findIndex(tab => tab.value === value)
  const { left, width } = useSlidingPillMetrics(triggerRefs, activeIndex)
  const activeTextColor =
    variant === 'orange' ? '#EA580C' : variant === 'charcoal' ? '#1F2933' : '#2563EB'

  return (
    <Card className="border-border/20 shadow-elevation-3 flex h-full flex-col overflow-hidden rounded-[18px] border bg-white p-5">
      <Tabs value={value} onValueChange={onValueChange} className="flex h-full w-full flex-col">
        <div className="flex-shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList
              ref={listRef}
              className={cn(
                'relative flex gap-1.5 rounded-xl p-1.5',
                variant === 'orange'
                  ? 'bg-gradient-to-r from-[#F97316] to-[#EA580C]'
                  : variant === 'charcoal'
                    ? 'bg-[#1F2933]'
                    : 'bg-gradient-to-r from-[#2563EB] to-[#1D4ED8]'
              )}
            >
              {tabs.map((tab, i) => (
                <TabsTrigger
                  key={tab.value}
                  ref={el => {
                    triggerRefs.current[i] = el
                  }}
                  value={tab.value}
                  className={cn(
                    'relative z-10 flex-1 rounded-lg text-white/80 transition-colors hover:text-white data-[state=active]:bg-transparent data-[state=active]:shadow-none',
                    variant === 'orange'
                      ? 'data-[state=active]:!text-[#EA580C]'
                      : variant === 'charcoal'
                        ? 'data-[state=active]:!text-[#1F2933]'
                        : 'data-[state=active]:!text-[#2563EB]'
                  )}
                  style={{ color: tab.value === value ? activeTextColor : undefined }}
                >
                  {tab.icon && <tab.icon className="mr-1.5 h-4 w-4" />}
                  {tab.label}
                </TabsTrigger>
              ))}
              <motion.div
                className="absolute bottom-1.5 top-1.5 rounded-lg bg-white shadow-sm"
                initial={false}
                animate={{ left, width }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            </TabsList>

            {showCalendarControls && (
              <div className="flex items-center gap-2">
                <div className="grid h-9 min-w-[180px] grid-cols-3 rounded-xl bg-[#2D2B4E] p-1">
                  {(['day', 'week', 'month'] as CalendarView[]).map(v => (
                    <button
                      key={v}
                      onClick={() => onCalendarViewChange?.(v)}
                      className={cn(
                        'flex items-center justify-center rounded-lg text-xs font-medium capitalize transition-colors',
                        calendarView === v
                          ? 'bg-white text-black shadow-sm'
                          : 'text-white/70 hover:text-white'
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <Select value={timezone} onValueChange={onTimezoneChange}>
                  <SelectTrigger className="h-9 w-[150px] rounded-lg border border-slate-300 bg-slate-50 text-xs text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-400 hover:bg-slate-100 hover:shadow-md focus-visible:shadow-none">
                    <Globe className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                    <SelectValue placeholder="Timezone" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[280px] w-[var(--radix-select-trigger-width)] rounded-lg border border-slate-200 !bg-white !bg-none p-1.5 !text-slate-700 shadow-lg">
                    {COMMON_TIMEZONES.map(tz => {
                      const { city } = formatTimezoneLabel(tz)
                      return (
                        <SelectItem
                          key={tz}
                          value={tz}
                          className="!hover:bg-slate-100 !focus:bg-slate-100 rounded-md text-xs !text-slate-700"
                        >
                          {city}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-3">{children}</div>
      </Tabs>
    </Card>
  )
}
