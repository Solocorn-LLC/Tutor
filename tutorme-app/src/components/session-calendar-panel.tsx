'use client'

import * as React from 'react'
import { Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
}: SessionCalendarPanelProps) {
  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-[18px] border border-slate-200 bg-white !pb-4 shadow-[0_14px_45px_rgba(0,0,0,0.12)]">
      <Tabs value={value} onValueChange={onValueChange} className="flex h-full w-full flex-col">
        <CardHeader className="flex-shrink-0 px-6 pb-0 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="flex gap-1.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] p-1.5">
              {tabs.map(tab => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex-1 rounded-lg text-white/80 hover:text-white data-[state=active]:bg-white data-[state=active]:text-[#2563EB] data-[state=active]:shadow-sm"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
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
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-2 pt-3">
          {children}
        </CardContent>
      </Tabs>
    </Card>
  )
}
