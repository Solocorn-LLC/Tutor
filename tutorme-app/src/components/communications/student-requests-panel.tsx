'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, CalendarClock, Video, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { resolveOneOnOneSession, joinableRequestId } from '@/lib/one-on-one/enter-classroom'
import { OneOnOneReviewDialog } from '@/components/booking/one-on-one-review-dialog'
import {
  OneOnOneRequestCard,
  groupIntoSeries,
  type OneOnOneRequestSummary,
} from '@/components/one-on-one/one-on-one-request-card'

/** The most recent COMPLETED session in a group — the one a "Rate" click reviews. */
function latestCompletedRequestId(members: OneOnOneRequestSummary[]): string | null {
  const completed = members.filter(m => (m.status || '').toUpperCase() === 'COMPLETED')
  if (completed.length === 0) return null
  return completed.reduce((a, b) =>
    new Date(a.requestedDate).getTime() >= new Date(b.requestedDate).getTime() ? a : b
  ).requestId
}

/**
 * A student's own 1-on-1 booking requests (the `role=sent` view). Renders the
 * shared OneOnOneRequestCard with student-facing actions: cancel a pending/accepted
 * request, or pay for an accepted one.
 */
export default function StudentRequestsPanel() {
  const params = useParams()
  const router = useRouter()
  const locale = (params?.locale as string) || 'en'
  const [requests, setRequests] = useState<OneOnOneRequestSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [reviewRequestId, setReviewRequestId] = useState<string | null>(null)

  const join = useCallback(
    async (requestId: string) => {
      setJoiningId(requestId)
      const sessionId = await resolveOneOnOneSession(requestId)
      if (sessionId) router.push(`/call/${sessionId}`)
      setJoiningId(null)
    },
    [router]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/one-on-one/request?role=sent', { credentials: 'include' })
      const data = res.ok ? await res.json() : { requests: [] }
      setRequests(Array.isArray(data.requests) ? data.requests : [])
    } catch {
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const cancel = useCallback(async (requestId: string) => {
    setBusyId(requestId)
    try {
      const res = await fetchWithCsrf('/api/one-on-one/cancel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestId }),
      })
      if (!res.ok) throw new Error('cancel failed')
      setRequests(prev =>
        prev.map(r => (r.requestId === requestId ? { ...r, status: 'CANCELLED' } : r))
      )
      toast.success('Request cancelled')
    } catch {
      toast.error('Could not cancel the request. Please try again.')
    } finally {
      setBusyId(null)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
        <CalendarClock className="mx-auto mb-2 h-8 w-8 text-slate-300" />
        You haven&apos;t requested any 1-on-1 sessions yet.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {groupIntoSeries(requests).map(group => {
        // Actions target the series head; the API derives the whole series from it
        // (one payment covers all sessions, cancel cancels the series).
        const r = group.head
        const status = (r.status || '').toUpperCase()
        const cancellable = status === 'PENDING' || status === 'ACCEPTED'
        // Confirmed (paid) bookings are joinable — open the next upcoming session.
        const joinId = status === 'PAID' ? joinableRequestId(group.members) : null
        // Finished sessions are reviewable — rate the most recent completed one.
        const reviewId = status === 'COMPLETED' ? latestCompletedRequestId(group.members) : null
        return (
          <OneOnOneRequestCard
            key={r.seriesId ?? r.requestId}
            request={r}
            perspective="student"
            variant="light"
            series={group.series}
            actions={
              joinId || reviewId || status === 'ACCEPTED' || cancellable ? (
                <>
                  {joinId ? (
                    <Button size="sm" disabled={joiningId === joinId} onClick={() => join(joinId)}>
                      <Video className="mr-1.5 h-3.5 w-3.5" />
                      {joiningId === joinId ? 'Opening…' : 'Join session'}
                    </Button>
                  ) : null}
                  {reviewId ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReviewRequestId(reviewId)}
                    >
                      <Star className="mr-1.5 h-3.5 w-3.5" />
                      Rate
                    </Button>
                  ) : null}
                  {status === 'ACCEPTED' ? (
                    <Button asChild size="sm">
                      <Link
                        href={`/${locale}/payment?requestId=${encodeURIComponent(r.requestId)}`}
                      >
                        Pay now
                      </Link>
                    </Button>
                  ) : null}
                  {cancellable ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10"
                      disabled={busyId === r.requestId}
                      onClick={() => cancel(r.requestId)}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </>
              ) : null
            }
          />
        )
      })}

      {reviewRequestId ? (
        <OneOnOneReviewDialog
          requestId={reviewRequestId}
          open={!!reviewRequestId}
          onOpenChange={open => {
            if (!open) setReviewRequestId(null)
          }}
          onSubmitted={load}
        />
      ) : null}
    </div>
  )
}
