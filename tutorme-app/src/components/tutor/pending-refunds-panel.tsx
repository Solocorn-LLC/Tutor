'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, DollarSign } from 'lucide-react'
import { toast } from 'sonner'

interface PendingRefund {
  refundId: string
  amount: number
  currency: string
  reason: string | null
  createdAt: string
  courseId: string | null
  courseName: string | null
}

interface PendingRefundsPanelProps {
  /** Limit to a single course (omit for all of the tutor's courses). */
  courseId?: string
  /** Show the course name per row (useful in the global view). */
  showCourse?: boolean
  /** Hide the card entirely when there are no pending refunds (default true). */
  hideWhenEmpty?: boolean
}

/**
 * Lists the tutor's PENDING refunds with one-click Approve / Decline.
 * Approve processes the existing refund via the gateway; Decline marks it FAILED.
 */
export function PendingRefundsPanel({
  courseId,
  showCourse = false,
  hideWhenEmpty = true,
}: PendingRefundsPanelProps) {
  const [loading, setLoading] = useState(true)
  const [refunds, setRefunds] = useState<PendingRefund[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const qs = courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''
    fetch(`/api/tutor/refunds${qs}`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { refunds: [] }))
      .then(d => {
        if (!cancelled) setRefunds(Array.isArray(d?.refunds) ? d.refunds : [])
      })
      .catch(() => {
        if (!cancelled) setRefunds([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [courseId])

  const act = useCallback(async (refundId: string, action: 'approve' | 'decline') => {
    setBusyId(refundId)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfToken = (await csrfRes.json().catch(() => ({})))?.token ?? null
      const res = await fetch(`/api/tutor/refunds/${refundId}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
        },
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || `Could not ${action} refund`)
        return
      }
      toast.success(
        action === 'approve' ? 'Refund approved and sent to the gateway' : 'Refund declined'
      )
      setRefunds(prev => prev.filter(r => r.refundId !== refundId))
    } catch {
      toast.error(`Could not ${action} refund`)
    } finally {
      setBusyId(null)
    }
  }, [])

  if (hideWhenEmpty && !loading && refunds.length === 0) return null

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700">
          <DollarSign className="h-5 w-5" />
          Pending refunds{refunds.length > 0 ? ` (${refunds.length})` : ''}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
          </div>
        ) : refunds.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            No pending refunds.
          </div>
        ) : (
          refunds.map(r => (
            <div
              key={r.refundId}
              className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  {r.currency} {Number(r.amount).toFixed(2)}
                  {showCourse && r.courseName ? (
                    <span className="text-muted-foreground font-normal"> · {r.courseName}</span>
                  ) : null}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {r.reason || 'Refund requested'}
                </p>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Requested {new Date(r.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => act(r.refundId, 'decline')}
                  disabled={busyId !== null}
                  className="border-slate-300 text-slate-600 hover:bg-slate-50"
                >
                  Decline
                </Button>
                <Button
                  size="sm"
                  onClick={() => act(r.refundId, 'approve')}
                  disabled={busyId !== null}
                  className="bg-amber-600 text-white hover:bg-amber-700"
                >
                  {busyId === r.refundId ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Approve refund
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
