'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent } from '@/components/ui/card'

async function fetchTutorUsername(): Promise<string | null> {
  try {
    const res = await fetch('/api/tutor/public-profile', { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    const raw = data?.profile?.username ?? data?.profile?.handle ?? ''
    const trimmed = typeof raw === 'string' ? raw.trim().replace(/^@+/, '') : ''
    return trimmed || null
  } catch {
    return null
  }
}
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Calendar,
  Users,
  DollarSign,
  TrendingUp,
  Clock,
  Sparkles,
  ArrowRight,
  BookOpen,
  Award,
  Video,
  Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from '@/components/ui/dialog'

interface ModernHeroSectionProps {
  stats?: {
    totalClasses: number
    totalStudents: number
    upcomingClasses: number
    earnings: number
    currency: string
  }
  loading?: boolean
}

interface ClassEvent {
  id: string
  title: string
  time: string
  duration: number
  subject: string
}

export function ModernHeroSection({
  stats,
  loading,
  nextSession,
}: ModernHeroSectionProps & { nextSession?: string }) {
  const { data: session } = useSession()
  const [greeting, setGreeting] = useState('Good morning')
  const [currentTime, setCurrentTime] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<{ date: Date; events: ClassEvent[] } | null>(null)
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 18) setGreeting('Good afternoon')
    else setGreeting('Good evening')

    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    fetchTutorUsername().then(u => {
      if (active) setUsername(u)
    })
    return () => {
      active = false
    }
  }, [])

  const handleDayClick = (date: Date) => {
    setSelectedDay({ date, events: [] })
  }

  const getDayClasses = (_date: Date): ClassEvent[] => {
    return []
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-[#1e3a5f] p-8 shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/3 rounded bg-white/10" />
          <div className="h-4 w-1/4 rounded bg-white/10" />
          <div className="mt-8 grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 rounded-xl bg-white/10" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-[#1e3a5f] p-8 shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
      {/* Content */}
      <div>
        {/* Header Row */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-white/70" />
              <span className="text-sm font-medium text-white/70">
                {greeting}, @
                {username ??
                  session?.user?.name ??
                  session?.user?.email?.split('@')[0] ??
                  'username'}
              </span>
            </div>
            <h1 className="mb-2 text-4xl font-bold text-white">Welcome Back!</h1>
            <p className="text-white/70">
              {formatDate(currentTime)} • {formatTime(currentTime)}
            </p>
          </div>
        </div>

        {/* One Week Calendar Schedule */}
        <div className="mb-8 grid grid-cols-7 gap-2 rounded-[14px] border border-white/10 bg-white/10 p-4 shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date(currentTime)
            d.setDate(currentTime.getDate() + i)
            const dayClasses = getDayClasses(d)
            const hasClasses = dayClasses.length > 0

            return (
              <div
                key={i}
                onClick={() => handleDayClick(d)}
                className="hover:bg-accent/40 group flex cursor-pointer flex-col items-center justify-center rounded-xl p-2 transition-colors"
              >
                <span className="mb-1 text-xs font-medium text-white/70">
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span
                  className={cn(
                    'mt-1 flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold',
                    i === 0
                      ? 'bg-indigo-400 text-white shadow-md shadow-indigo-400/30'
                      : 'text-white group-hover:bg-white/10'
                  )}
                >
                  {d.getDate()}
                </span>
                {/* Show class times instead of dots */}
                <div className="mt-2 flex flex-col items-center gap-0.5">
                  {dayClasses.slice(0, 1).map((cls, idx) => (
                    <span key={idx} className="text-[10px] font-medium text-indigo-600">
                      {cls.time}
                    </span>
                  ))}
                  {dayClasses.length > 1 && (
                    <span className="text-[8px] text-slate-500">
                      +{dayClasses.length - 1} more
                    </span>
                  )}
                  {!hasClasses && (
                    <div className="flex h-1.5 gap-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-white/30" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Day Detail Modal */}
        <Dialog open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {selectedDay?.date.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </DialogTitle>
              <DialogDescription>
                {selectedDay && selectedDay.events.length > 0
                  ? `${selectedDay.events.length} session${selectedDay.events.length > 1 ? 's' : ''} scheduled`
                  : 'No sessions scheduled'}
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-3" spacing="default">
              {selectedDay?.events.map(event => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white p-4 text-[#1F2933]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
                    <BookOpen className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{event.title}</p>
                    <p className="text-sm text-slate-600">
                      {event.time} • {event.duration} min
                    </p>
                  </div>
                </div>
              ))}

              {(!selectedDay || selectedDay.events.length === 0) && (
                <div className="rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white px-6 py-10 text-center text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.10)]">
                  <Calendar className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                  <p className="font-medium">No sessions scheduled for this day</p>
                </div>
              )}
            </DialogBody>
          </DialogContent>
        </Dialog>

        {/* Action Bar */}
        <div className="flex flex-wrap items-center gap-4">
          <Button
            className="bg-white text-[#1e3a5f] hover:bg-white/90"
            onClick={() => toast.info('Coming soon...')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Class
          </Button>
          <Button
            variant="outline"
            className="border-white/30 text-white hover:bg-white/10"
            onClick={() => toast.info('Coming soon...')}
          >
            <Video className="mr-2 h-4 w-4" />
            Go Live
          </Button>
          <div className="flex-1" />
          {nextSession && (
            <div className="flex items-center gap-2 text-base font-medium text-emerald-300">
              <Clock className="h-5 w-5" />
              <span>Next session: {nextSession}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  icon: any
  label: string
  value: string | number
  sublabel?: string
  trend?: string
  trendUp?: boolean
  color: string
}

function StatCard({ icon: Icon, label, value, sublabel, trend, trendUp, color }: StatCardProps) {
  return (
    <div className="group relative cursor-pointer overflow-hidden rounded-[18px] border border-white/10 bg-[#1e3a5f] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.10)] transition-all hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
      <div className="relative">
        <div
          className={cn(
            'mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br',
            color
          )}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
        <p className="mb-1 text-xs font-medium text-white/70">{label}</p>
        <div className="flex items-end justify-between">
          <p className="text-2xl font-bold text-white">{value}</p>
          {sublabel && <p className="text-xs text-white/70">{sublabel}</p>}
          {trend && (
            <div
              className={cn(
                'flex items-center text-xs font-medium',
                trendUp ? 'text-indigo-300' : 'text-red-300'
              )}
            >
              <TrendingUp className={cn('mr-0.5 h-3 w-3', !trendUp && 'rotate-180')} />
              {trend}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
