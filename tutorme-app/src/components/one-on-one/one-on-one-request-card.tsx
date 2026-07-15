'use client'

import type { ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Calendar, Clock, CreditCard, Repeat, Timer, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface OneOnOneParty {
  userId?: string | null
  handle?: string | null
  email?: string | null
  image?: string | null
}

export interface OneOnOneRequestSummary {
  requestId: string
  requestedDate: string
  startTime: string
  endTime: string
  timezone: string
  costPerSession: number
  status: string
  durationMinutes?: number | null
  currency?: string | null
  studentNotes?: string | null
  courseName?: string | null
  seriesId?: string | null
  seriesIndex?: number | null
  createdAt?: string | null
  paymentDueAt?: string | null
  paidAt?: string | null
  student?: OneOnOneParty | null
  tutor?: OneOnOneParty | null
}

/** Summary of a recurring series, when this card heads one (count > 1). */
export interface OneOnOneSeriesSummary {
  count: number
  /** Combined cost across all sessions in the series. */
  totalCost: number
  /** ISO date of the last session, for the "Jul 14 – Aug 4" range. */
  lastDate: string
}

interface Props {
  request: OneOnOneRequestSummary
  /** 'tutor' shows the requesting student; 'student' shows the tutor. */
  perspective: 'tutor' | 'student'
  /** Match the surrounding surface — dashboard is dark, comms page is light. */
  variant?: 'dark' | 'light'
  /** Role-specific buttons (Accept/Reject/Reschedule, or Pay/Cancel). */
  actions?: ReactNode
  /** When set (count > 1), render this as one card for the whole weekly series. */
  series?: OneOnOneSeriesSummary | null
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-amber-500/15 text-amber-600 ring-amber-500/30' },
  ACCEPTED: { label: 'Accepted', className: 'bg-blue-500/15 text-blue-600 ring-blue-500/30' },
  PAID: { label: 'Confirmed', className: 'bg-emerald-500/15 text-emerald-600 ring-emerald-500/30' },
  COMPLETED: { label: 'Completed', className: 'bg-slate-500/15 text-slate-500 ring-slate-500/30' },
  REJECTED: { label: 'Declined', className: 'bg-rose-500/15 text-rose-600 ring-rose-500/30' },
  CANCELLED: { label: 'Cancelled', className: 'bg-slate-500/15 text-slate-500 ring-slate-500/30' },
  EXPIRED: { label: 'Expired', className: 'bg-slate-500/15 text-slate-500 ring-slate-500/30' },
}

function partyName(p?: OneOnOneParty | null): string {
  if (p?.handle) return p.handle
  if (p?.email) return p.email.split('@')[0]
  return 'User'
}

function initial(name: string): string {
  return (name.trim()[0] || 'U').toUpperCase()
}

function money(cost: number, currency?: string | null): string {
  if (!cost || cost <= 0) return 'Free'
  const prefix = currency ? `${currency} ` : ''
  return `${prefix}${cost % 1 === 0 ? cost.toFixed(0) : cost.toFixed(2)}`
}

/** minutes between two HH:mm strings, else the explicit duration. */
function durationLabel(req: OneOnOneRequestSummary): string {
  let mins = req.durationMinutes ?? 0
  if (!mins && req.startTime && req.endTime) {
    const [sh, sm] = req.startTime.split(':').map(Number)
    const [eh, em] = req.endTime.split(':').map(Number)
    if ([sh, sm, eh, em].every(n => Number.isFinite(n))) mins = eh * 60 + em - (sh * 60 + sm)
  }
  return mins > 0 ? `${mins} min` : ''
}

function relativeTime(iso?: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diff = Date.now() - then
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  return `${day}d ago`
}

function untilLabel(iso?: string | null): string {
  if (!iso) return ''
  const diff = new Date(iso).getTime() - Date.now()
  if (!Number.isFinite(diff) || diff <= 0) return 'now'
  const hr = Math.round(diff / 3_600_000)
  if (hr < 24) return `in ${hr}h`
  return `in ${Math.round(hr / 24)}d`
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** One display row: a single request, or a recurring series collapsed to its head. */
export interface OneOnOneSeriesGroup {
  head: OneOnOneRequestSummary
  members: OneOnOneRequestSummary[]
  series: OneOnOneSeriesSummary | null
}

/**
 * Collapse a flat request list into display rows: standalone requests pass
 * through untouched, while requests sharing a `seriesId` fold into one row headed
 * by the first week (seriesIndex 0), with a combined-cost/date-range summary.
 * Original list order is preserved (a series appears where its first row did).
 */
export function groupIntoSeries(requests: OneOnOneRequestSummary[]): OneOnOneSeriesGroup[] {
  const groups: OneOnOneSeriesGroup[] = []
  const posBySeries = new Map<string, number>()
  for (const r of requests) {
    if (!r.seriesId) {
      groups.push({ head: r, members: [r], series: null })
      continue
    }
    const pos = posBySeries.get(r.seriesId)
    if (pos === undefined) {
      posBySeries.set(r.seriesId, groups.length)
      groups.push({ head: r, members: [r], series: null })
    } else {
      groups[pos].members.push(r)
    }
  }
  for (const g of groups) {
    if (g.members.length <= 1) continue
    g.members.sort((a, b) => (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0))
    g.head = g.members[0]
    g.series = {
      count: g.members.length,
      totalCost: g.members.reduce((sum, m) => sum + (m.costPerSession || 0), 0),
      lastDate: g.members.reduce(
        (max, m) => (m.requestedDate > max ? m.requestedDate : max),
        g.members[0].requestedDate
      ),
    }
  }
  return groups
}

export function OneOnOneRequestCard({
  request,
  perspective,
  variant = 'light',
  actions,
  series,
}: Props) {
  const dark = variant === 'dark'
  const other = perspective === 'tutor' ? request.student : request.tutor
  const name = partyName(other)
  const status = (request.status || '').toUpperCase()
  const meta = STATUS_META[status] ?? {
    label: status || 'Request',
    className: 'bg-slate-500/15 text-slate-500 ring-slate-500/30',
  }
  const dur = durationLabel(request)
  const isSeries = !!series && series.count > 1
  const dateLabel = new Date(request.requestedDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  // A series shows its combined cost; a single session shows its own.
  const cost = money(isSeries ? series!.totalCost : request.costPerSession, request.currency)

  const detail = dark ? 'text-white/60' : 'text-slate-500'
  const strong = dark ? 'text-white' : 'text-slate-900'

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4 transition-colors',
        dark
          ? 'border-white/10 bg-white/[0.04] hover:border-white/20'
          : 'border-slate-200 bg-white hover:border-slate-300'
      )}
    >
      {/* header: who + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            {other?.image ? <AvatarImage src={other.image} alt={name} /> : null}
            <AvatarFallback
              className={cn(
                'text-sm font-semibold',
                dark ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600'
              )}
            >
              {initial(name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className={cn('truncate text-sm font-semibold capitalize', strong)}>{name}</p>
            {other?.handle ? (
              <p className={cn('truncate text-xs', detail)}>@{other.handle}</p>
            ) : null}
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset',
            meta.className
          )}
        >
          {meta.label}
        </span>
      </div>

      {/* recurring-series banner */}
      {isSeries ? (
        <div
          className={cn(
            'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset',
            dark
              ? 'bg-indigo-500/15 text-indigo-300 ring-indigo-400/30'
              : 'bg-indigo-500/10 text-indigo-600 ring-indigo-500/20'
          )}
        >
          <Repeat className="h-3 w-3" />
          Weekly series · {series!.count} sessions
        </div>
      ) : null}

      {/* session details */}
      <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs', detail)}>
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          {isSeries ? `${dateLabel} – ${shortDate(series!.lastDate)}` : dateLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {request.startTime}–{request.endTime}
          {dur ? ` · ${dur}` : ''}
          {isSeries ? ' · weekly' : ''}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" />
          {request.timezone}
        </span>
        <span className={cn('inline-flex items-center gap-1.5 font-medium', strong)}>
          <CreditCard className="h-3.5 w-3.5" />
          {cost}
          {isSeries ? (
            <span className={cn('font-normal', detail)}>
              ({series!.count} × {money(request.costPerSession, request.currency)})
            </span>
          ) : null}
        </span>
      </div>

      {/* status-specific line: request age / payment */}
      {(request.createdAt || (status === 'ACCEPTED' && request.paymentDueAt) || request.paidAt) && (
        <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]', detail)}>
          {status === 'ACCEPTED' && request.paymentDueAt ? (
            <span className="font-medium text-amber-600">
              Payment due {untilLabel(request.paymentDueAt)}
            </span>
          ) : request.paidAt ? (
            <span className="font-medium text-emerald-600">
              Paid {relativeTime(request.paidAt)}
            </span>
          ) : request.createdAt ? (
            <span>Requested {relativeTime(request.createdAt)}</span>
          ) : null}
        </div>
      )}

      {/* the course the student wants this session to be about */}
      {request.courseName ? (
        <div
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            dark ? 'bg-white/10 text-white/80' : 'bg-blue-50 text-blue-700'
          )}
        >
          <BookOpen className="h-3 w-3" />
          {request.courseName}
        </div>
      ) : null}

      {/* student's note to the tutor ("why I want this session") */}
      {request.studentNotes?.trim() ? (
        <div
          className={cn(
            'rounded-lg border-l-2 py-1.5 pl-3 text-xs',
            dark
              ? 'border-white/20 bg-white/[0.03] text-white/70'
              : 'border-slate-300 bg-slate-50 text-slate-600'
          )}
        >
          <span className={cn('mr-1 font-semibold', detail)}>
            {perspective === 'tutor' ? 'Note:' : 'Your note:'}
          </span>
          {request.studentNotes.trim()}
        </div>
      ) : null}

      {actions ? (
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
