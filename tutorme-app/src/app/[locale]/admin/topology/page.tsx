'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminTopologyPanel } from '@/components/admin/topology/AdminTopologyPanel'

const timeRanges = [
  { value: '7', label: '7 Days' },
  { value: '30', label: '30 Days' },
  { value: '90', label: '90 Days' },
]

export default function AdminTopologyPage() {
  const [days, setDays] = useState(7)

  return (
    <div className="relative h-full w-full bg-slate-950">
      {/* Topology panel fills the entire container */}
      <AdminTopologyPanel days={days} />

      {/* Time range selector - positioned at bottom left */}
      <div className="absolute left-6 z-50" style={{ bottom: '24px' }}>
        <div className="rounded-xl border border-blue-300/30 bg-slate-950/80 p-2 shadow-lg backdrop-blur-md">
          <Tabs value={String(days)} onValueChange={v => setDays(Number(v))}>
            <TabsList className="bg-slate-900/90">
              {timeRanges.map(range => (
                <TabsTrigger key={range.value} value={range.value}>
                  {range.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
