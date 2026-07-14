'use client'

import { useEffect, useState } from 'react'
import { Star, Loader2, MessageSquare, UserCheck, UserX } from 'lucide-react'
import { CollapsibleCard } from '@/components/collapsible-card'
import { cn } from '@/lib/utils'

interface HistorySession {
  requestId: string
  date: string | null
  startTime: string
  studentName: string
  attended: boolean
  rating: number | null
  comment: string | null
}

interface HistoryData {
  sessions: HistorySession[]
  averageRating: number
  reviewCount: number
}

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={cn(
            'h-3.5 w-3.5',
            i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
          )}
        />
      ))}
    </span>
  )
}

function dateLabel(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function TutorReviewsCard({ className }: { className?: string }) {
  const [data, setData] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/one-on-one/history', { credentials: 'include' })
        const json = res.ok ? await res.json() : null
        if (active) setData(json)
      } catch {
        if (active) setData(null)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  return (
    <CollapsibleCard
      className={className}
      title="Your 1-on-1 Reviews"
      icon={<Star className="h-5 w-5 text-slate-900" />}
      defaultOpen
    >
      <div className="space-y-4 p-6">
        {/* Summary */}
        <div className="flex items-center justify-between rounded-[12px] border bg-slate-50 p-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Average rating</p>
            <p className="text-xs text-slate-500">
              Across {data?.reviewCount ?? 0} review{(data?.reviewCount ?? 0) === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tabular-nums text-slate-900">
              {(data?.averageRating ?? 0).toFixed(1)}
            </span>
            <Stars value={data?.averageRating ?? 0} />
          </div>
        </div>

        {/* Recent sessions */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : !data || data.sessions.length === 0 ? (
          <div className="rounded-[12px] border border-dashed py-8 text-center text-sm text-slate-500">
            No completed 1-on-1 sessions yet. Reviews and attendance will show up here.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.sessions.map(s => (
              <li key={s.requestId} className="rounded-[12px] border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold capitalize text-slate-900">
                      {s.studentName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {dateLabel(s.date)}
                      {s.startTime ? ` · ${s.startTime}` : ''}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      s.attended
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : 'bg-rose-500/10 text-rose-600'
                    )}
                  >
                    {s.attended ? (
                      <>
                        <UserCheck className="h-3 w-3" /> Attended
                      </>
                    ) : (
                      <>
                        <UserX className="h-3 w-3" /> No-show
                      </>
                    )}
                  </span>
                </div>

                {s.rating != null ? (
                  <div className="mt-2 border-t pt-2">
                    <Stars value={s.rating} />
                    {s.comment ? (
                      <p className="mt-1 flex gap-1.5 text-xs text-slate-600">
                        <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                        <span className="italic">“{s.comment}”</span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </CollapsibleCard>
  )
}
