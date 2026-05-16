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
      <div className="from-background via-secondary to-card relative overflow-hidden rounded-3xl bg-gradient-to-br p-8">
        <div className="animate-pulse space-y-4">
          <div className="bg-muted h-8 w-1/3 rounded" />
          <div className="bg-muted/70 h-4 w-1/4 rounded" />
          <div className="mt-8 grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-muted/60 h-24 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border-border from-background via-secondary to-card relative overflow-hidden rounded-3xl border bg-gradient-to-br p-8 shadow-2xl">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-40">
        <div className="bg-primary/20 absolute left-0 top-0 h-96 w-96 animate-pulse rounded-full opacity-50 mix-blend-multiply blur-[100px] filter" />
        <div className="bg-accent/40 absolute right-0 top-0 h-96 w-96 animate-pulse rounded-full opacity-50 mix-blend-multiply blur-[100px] filter delay-1000" />
        <div className="delay-2000 bg-secondary/40 absolute bottom-0 left-1/2 h-96 w-96 animate-pulse rounded-full opacity-50 mix-blend-multiply blur-[100px] filter" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header Row */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="text-primary h-5 w-5" />
              <span className="text-muted-foreground text-sm font-medium">
                {greeting}, @
                {username ??
                  session?.user?.name ??
                  session?.user?.email?.split('@')[0] ??
                  'username'}
              </span>
            </div>
            <h1 className="text-foreground mb-2 text-4xl font-bold">Welcome Back!</h1>
            <p className="text-muted-foreground">
              {formatDate(currentTime)} • {formatTime(currentTime)}
            </p>
          </div>
        </div>

        {/* One Week Calendar Schedule */}
        <div className="border-border bg-card/70 mb-8 grid grid-cols-7 gap-2 rounded-2xl border p-4 shadow-2xl backdrop-blur-md">
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
                <span className="text-muted-foreground mb-1 text-xs font-medium">
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span
                  className={cn(
                    'mt-1 flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold',
                    i === 0
                      ? 'bg-primary text-primary-foreground shadow-primary/30 shadow-md'
                      : 'text-foreground group-hover:bg-accent/30'
                  )}
                >
                  {d.getDate()}
                </span>
                {/* Show class times instead of dots */}
                <div className="mt-2 flex flex-col items-center gap-0.5">
                  {dayClasses.slice(0, 1).map((cls, idx) => (
                    <span key={idx} className="text-primary text-[10px] font-medium">
                      {cls.time}
                    </span>
                  ))}
                  {dayClasses.length > 1 && (
                    <span className="text-muted-foreground text-[8px]">
                      +{dayClasses.length - 1} more
                    </span>
                  )}
                  {!hasClasses && (
                    <div className="flex h-1.5 gap-1">
                      <div className="bg-muted-foreground/60 h-1.5 w-1.5 rounded-full" />
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
            variant="outline"
            className="border-border bg-card/60 text-foreground hover:bg-muted/60"
            onClick={() => toast.info('Coming soon...')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Class
          </Button>
          <Button
            variant="outline"
            className="border-border bg-card/60 text-foreground hover:bg-muted/60"
            onClick={() => toast.info('Coming soon...')}
          >
            <Video className="mr-2 h-4 w-4" />
            Go Live
          </Button>
          <div className="flex-1" />
          {nextSession && (
            <div className="flex items-center gap-2 text-base font-medium text-green-600">
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
    <div className="border-border bg-card/70 hover:bg-muted/60 group relative cursor-pointer overflow-hidden rounded-2xl border p-4 shadow-2xl backdrop-blur-md transition-all">
      <div
        className={cn(
          'absolute right-0 top-0 h-20 w-20 rounded-bl-full bg-gradient-to-br opacity-20',
          color
        )}
      />
      <div className="relative">
        <div
          className={cn(
            'mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br',
            color
          )}
        >
          <Icon className="text-primary-foreground h-5 w-5" />
        </div>
        <p className="text-muted-foreground mb-1 text-xs font-medium">{label}</p>
        <div className="flex items-end justify-between">
          <p className="text-foreground text-2xl font-bold">{value}</p>
          {sublabel && <p className="text-muted-foreground text-xs">{sublabel}</p>}
          {trend && (
            <div
              className={cn(
                'flex items-center text-xs font-medium',
                trendUp ? 'text-primary' : 'text-destructive'
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
