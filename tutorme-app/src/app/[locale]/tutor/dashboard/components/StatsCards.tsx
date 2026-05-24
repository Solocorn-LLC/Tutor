'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Calendar, Users, DollarSign, TrendingUp } from 'lucide-react'
import { formatEarnings } from '@/lib/format-currency'

interface Stats {
  totalClasses: number
  totalStudents: number
  upcomingClasses: number
  earnings: number
  /** Tutor's display currency from settings (e.g. SGD, USD). Defaults to SGD. */
  currency?: string
}

interface StatsCardsProps {
  stats: Stats
  loading?: boolean
}

function StatSkeleton() {
  return (
    <Card className="rounded-[18px] border border-white/10 bg-[#1e3a5f] shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
            <div className="h-8 w-12 animate-pulse rounded bg-white/10" />
          </div>
          <div className="h-12 w-12 animate-pulse rounded-full bg-white/10" />
        </div>
      </CardContent>
    </Card>
  )
}

export function StatsCards({ stats, loading }: StatsCardsProps) {
  if (loading) {
    return (
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <StatSkeleton key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className="overflow-hidden rounded-[18px] border border-white/10 bg-[#1e3a5f] shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70">Total Classes</p>
              <p className="text-3xl font-bold text-white">{stats.totalClasses}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <Calendar className="h-6 w-6 text-white/80" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[18px] border border-white/10 bg-[#1e3a5f] shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70">Total Students</p>
              <p className="text-3xl font-bold text-white">{stats.totalStudents}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <Users className="h-6 w-6 text-white/80" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[18px] border border-white/10 bg-[#1e3a5f] shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p
                className="text-sm text-white/70"
                title="Scheduled (any future date) and currently active sessions"
              >
                Upcoming
              </p>
              <p className="text-3xl font-bold text-white">{stats.upcomingClasses}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <TrendingUp className="h-6 w-6 text-white/80" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[18px] border border-white/10 bg-[#1e3a5f] shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70">Earnings</p>
              <p className="text-3xl font-bold text-white">
                {formatEarnings(stats.earnings, stats.currency ?? 'SGD')}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <DollarSign className="h-6 w-6 text-white/80" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
