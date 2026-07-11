'use client'

import * as React from 'react'
import { useMemo, useState, useCallback } from 'react'
import { Globe, LocateFixed } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Comprehensive list of IANA timezones grouped by region
const TIMEZONE_GROUPS = [
  {
    region: 'North America',
    zones: [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Toronto',
      'America/Vancouver',
      'America/Mexico_City',
      'America/Anchorage',
      'America/Honolulu',
    ],
  },
  {
    region: 'South America',
    zones: [
      'America/Sao_Paulo',
      'America/Buenos_Aires',
      'America/Santiago',
      'America/Lima',
      'America/Bogota',
    ],
  },
  {
    region: 'Europe',
    zones: [
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Rome',
      'Europe/Madrid',
      'Europe/Amsterdam',
      'Europe/Brussels',
      'Europe/Vienna',
      'Europe/Zurich',
      'Europe/Stockholm',
      'Europe/Oslo',
      'Europe/Copenhagen',
      'Europe/Helsinki',
      'Europe/Warsaw',
      'Europe/Prague',
      'Europe/Budapest',
      'Europe/Istanbul',
      'Europe/Moscow',
      'Europe/Dublin',
      'Europe/Lisbon',
    ],
  },
  {
    region: 'Africa & Middle East',
    zones: [
      'Africa/Cairo',
      'Africa/Johannesburg',
      'Africa/Lagos',
      'Africa/Nairobi',
      'Asia/Dubai',
      'Asia/Riyadh',
      'Asia/Tehran',
      'Asia/Jerusalem',
    ],
  },
  {
    region: 'Asia Pacific',
    zones: [
      'Asia/Shanghai',
      'Asia/Hong_Kong',
      'Asia/Singapore',
      'Asia/Tokyo',
      'Asia/Seoul',
      'Asia/Taipei',
      'Asia/Bangkok',
      'Asia/Jakarta',
      'Asia/Manila',
      'Asia/Hanoi',
      'Asia/Kuala_Lumpur',
      'Asia/Kolkata',
      'Asia/Mumbai',
      'Asia/Dhaka',
      'Asia/Karachi',
      'Asia/Colombo',
    ],
  },
  {
    region: 'Oceania',
    zones: [
      'Australia/Sydney',
      'Australia/Melbourne',
      'Australia/Brisbane',
      'Australia/Perth',
      'Australia/Adelaide',
      'Australia/Darwin',
      'Pacific/Auckland',
      'Pacific/Fiji',
      'Pacific/Honolulu',
    ],
  },
]

// Flat list for search
const ALL_TIMEZONES = TIMEZONE_GROUPS.flatMap(g => g.zones)

function formatTimezoneLabel(tz: string): string {
  try {
    const parts = tz.split('/')
    const city = parts[parts.length - 1]?.replace(/_/g, ' ') || tz
    const region = parts[0]?.replace(/_/g, ' ') || ''

    // Get current offset
    const now = new Date()
    const offset = now.toLocaleString('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
    const offsetMatch = offset.match(/GMT([+-]\d{1,2}:?\d{0,2})/)
    const offsetStr = offsetMatch ? offsetMatch[1] : ''

    return `${city} (GMT${offsetStr})`
  } catch {
    return tz
  }
}

function detectBrowserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return null
  }
}

interface TimezoneSelectorProps {
  value: string
  onChange: (value: string) => void
  className?: string
  showDetectButton?: boolean
  detectButtonLabel?: string
  id?: string
}

export function TimezoneSelector({
  value,
  onChange,
  className,
  showDetectButton = true,
  detectButtonLabel = 'Detect my timezone',
  id,
}: TimezoneSelectorProps) {
  const [detecting, setDetecting] = useState(false)

  const handleDetect = useCallback(() => {
    setDetecting(true)
    const detected = detectBrowserTimezone()
    if (detected && ALL_TIMEZONES.includes(detected)) {
      onChange(detected)
    } else if (detected) {
      // Fallback: find closest match or use the detected one anyway
      onChange(detected)
    }
    // Small delay to show feedback
    setTimeout(() => setDetecting(false), 300)
  }, [onChange])

  // Get current offset display for the selected value
  const selectedLabel = useMemo(() => {
    if (!value) return 'Select timezone'
    return formatTimezoneLabel(value)
  }, [value])

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} className="flex-1">
            <Globe className="mr-2 h-4 w-4 shrink-0 text-gray-400" />
            <SelectValue placeholder="Select timezone">{selectedLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {TIMEZONE_GROUPS.map(group => (
              <React.Fragment key={group.region}>
                <div className="px-2 py-1.5 text-xs font-semibold text-gray-500">
                  {group.region}
                </div>
                {group.zones.map(tz => (
                  <SelectItem key={tz} value={tz}>
                    {formatTimezoneLabel(tz)}
                  </SelectItem>
                ))}
              </React.Fragment>
            ))}
          </SelectContent>
        </Select>
        {showDetectButton && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDetect}
            disabled={detecting}
            className="shrink-0"
          >
            <LocateFixed className="mr-1.5 h-3.5 w-3.5" />
            {detecting ? 'Detecting...' : detectButtonLabel}
          </Button>
        )}
      </div>
      <p className="text-xs text-gray-500">
        Times will be displayed in this timezone across the platform.
      </p>
    </div>
  )
}

// Export the list for external use
export { ALL_TIMEZONES, formatTimezoneLabel, detectBrowserTimezone }
