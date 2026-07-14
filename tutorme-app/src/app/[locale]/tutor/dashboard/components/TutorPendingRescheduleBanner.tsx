'use client'

/**
 * TutorPendingRescheduleBanner — shows the tutor their pending reschedule
 * proposals with an agreement tally (n/m agreed) and a Cancel action. The
 * session stays at its current time until every student agrees; cancelling
 * withdraws the proposal. See src/lib/schedule/reschedule-consent.ts.
 */

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'

interface TutorProposal {
  proposalId: string
  sessionId: string
  title: string
  proposedStart: string | null
  currentStart: string | null
  agreed: number
  total: number
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

export function TutorPendingRescheduleBanner() {
  const [proposals, setProposals] = useState<TutorProposal[]>([])
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/reschedule-proposals')
      if (!res.ok) return
      const data = await res.json()
      setProposals(data.proposals ?? [])
    } catch {
      /* non-critical — the badge just stays empty */
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const cancel = useCallback(async (p: TutorProposal) => {
    setBusy(b => ({ ...b, [p.proposalId]: true }))
    try {
      const res = await fetchWithCsrf(`/api/sessions/${p.sessionId}/reschedule`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: p.proposalId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Could not cancel the proposal.')
        return
      }
      toast.success('Reschedule cancelled — the session keeps its current time.')
      setProposals(list => list.filter(x => x.proposalId !== p.proposalId))
    } catch {
      toast.error('Could not cancel the proposal.')
    } finally {
      setBusy(b => ({ ...b, [p.proposalId]: false }))
    }
  }, [])

  if (proposals.length === 0) return null

  return (
    <div className="mb-3 flex-shrink-0 space-y-2">
      {proposals.map(p => (
        <div
          key={p.proposalId}
          className="flex flex-col gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" aria-hidden />
            <div className="text-sm text-sky-900">
              Reschedule of <span className="font-semibold">“{p.title}”</span> to{' '}
              <span className="font-semibold">{formatWhen(p.proposedStart)}</span> is awaiting
              student agreement.
              <span className="mt-0.5 flex items-center gap-1 text-sky-700">
                <Users className="h-3.5 w-3.5" aria-hidden />
                {p.agreed}/{p.total} agreed — it applies once everyone does.
              </span>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-slate-600 hover:bg-slate-100 hover:text-slate-800"
            disabled={busy[p.proposalId]}
            onClick={() => cancel(p)}
          >
            <X className="mr-1 h-4 w-4" /> Cancel
          </Button>
        </div>
      ))}
    </div>
  )
}
