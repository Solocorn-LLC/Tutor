'use client'

/**
 * PendingRescheduleBanner — shows the student any pending session-reschedule
 * proposals from their tutor, with Agree / Disagree. The session keeps its
 * current time until everyone agrees; a single disagree cancels the change.
 * See src/lib/schedule/reschedule-consent.ts.
 */

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'

interface Proposal {
  proposalId: string
  sessionId: string
  title: string
  tutorName: string
  currentStart: string | null
  proposedStart: string | null
  proposedEnd: string | null
  myVote: 'PENDING' | 'AGREE' | 'DISAGREE'
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'an unspecified time'
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function PendingRescheduleBanner() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/student/reschedule-proposals')
      if (!res.ok) return
      const data = await res.json()
      // Only surface proposals the student hasn't answered yet.
      setProposals((data.proposals ?? []).filter((p: Proposal) => p.myVote === 'PENDING'))
    } catch {
      /* non-critical — the banner just stays empty */
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const respond = useCallback(async (p: Proposal, response: 'AGREE' | 'DISAGREE') => {
    setBusy(b => ({ ...b, [p.proposalId]: true }))
    try {
      const res = await fetchWithCsrf(`/api/sessions/${p.sessionId}/reschedule/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: p.proposalId, response }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Could not submit your response.')
        return
      }
      if (response === 'AGREE') {
        toast.success(
          data.status === 'APPLIED'
            ? 'Everyone agreed — the session has been moved.'
            : 'Thanks — waiting on the other students.'
        )
      } else {
        toast.success('Noted — the session keeps its current time.')
      }
      // Remove the answered proposal from the banner.
      setProposals(list => list.filter(x => x.proposalId !== p.proposalId))
    } catch {
      toast.error('Could not submit your response.')
    } finally {
      setBusy(b => ({ ...b, [p.proposalId]: false }))
    }
  }, [])

  if (proposals.length === 0) return null

  return (
    <div className="mb-4 flex-shrink-0 space-y-2">
      {proposals.map(p => (
        <div
          key={p.proposalId}
          className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
            <div className="text-sm text-amber-900">
              <span className="font-semibold">{p.tutorName}</span> proposed moving{' '}
              <span className="font-semibold">“{p.title}”</span> to{' '}
              <span className="font-semibold">{formatWhen(p.proposedStart)}</span>
              {p.currentStart && (
                <span className="text-amber-700"> (currently {formatWhen(p.currentStart)})</span>
              )}
              . It won’t change until everyone agrees.
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              disabled={busy[p.proposalId]}
              onClick={() => respond(p, 'AGREE')}
            >
              <Check className="mr-1 h-4 w-4" /> Agree
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              disabled={busy[p.proposalId]}
              onClick={() => respond(p, 'DISAGREE')}
            >
              <X className="mr-1 h-4 w-4" /> Disagree
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
