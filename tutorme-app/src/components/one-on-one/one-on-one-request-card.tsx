'use client'

import type { ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Calendar, Clock, CreditCard, Timer } from 'lucide-react'
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
  createdAt?: string | null
  paymentDueAt?: string | null
  paidAt?: string | null
  student?: OneOnOneParty | null
  tutor?: OneOnOneParty | null
}

interface Props {
  request: OneOnOneRequestSummary
  /** 'tutor' shows the requesting student; 'student' shows the tutor. */
  perspective: 'tutor' | 'student'
  /** Match the surrounding surface — dashboard is dark, comms page is light. */
  variant?: 'dark' | 'light'
  /** Role-specific buttons (Accept/Reject/Reschedule, or Pay/Cancel). */
  actions?: ReactNode
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-amber-500/15 text-amber-600 ring-amber-500/30' },
  ACCEPTED: { label: 'Accepted', className: 'bg-blue-500/15 text-blue-600 ring-blue-500/30' },
  PAID: { label: 'Confirmed', className: 'bg-emerald-500/15 text-emerald-600 ring-emerald-500/30' },
  COMPLETED: { label: 'Completed', className: 'bg-slate-500/15 text-slate-500 ring-slate-500/30' },
  REJECTED: { label: 'Declined', className: 'bg-rose-500/15 text-rose-600 ring-rose-500/30' },
  CANCELLED: { label: 'Cancelled', className: 'bg-slate-500/15 text-slate-500 ring-slate-500/30' },
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

export function OneOnOneRequestCard({ request, perspective, variant = 'light', actions }: Props) {
  const dark = variant === 'dark'
  const other = perspective === 'tutor' ? request.student : request.tutor
  const name = partyName(other)
  const status = (request.status || '').toUpperCase()
  const meta = STATUS_META[status] ?? {
    label: status || 'Request',
    className: 'bg-slate-500/15 text-slate-500 ring-slate-500/30',
  }
  const dur = durationLabel(request)
  const dateLabel = new Date(request.requestedDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const cost = money(request.costPerSession, request.currency)

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

      {/* session details */}
      <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs', detail)}>
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          {dateLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {request.startTime}–{request.endTime}
          {dur ? ` · ${dur}` : ''}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" />
          {request.timezone}
        </span>
        <span className={cn('inline-flex items-center gap-1.5 font-medium', strong)}>
          <CreditCard className="h-3.5 w-3.5" />
          {cost}
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

      {actions ? (
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
