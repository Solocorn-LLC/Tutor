'use client'

/**
 * Reschedule a 1-on-1 booking. Self-fetches the booking's reschedule state and
 * shows one of three modes:
 *  - a pending proposal from the OTHER party → Accept / Decline
 *  - a pending proposal I made → "waiting for their response"
 *  - no proposal → a form to propose a new date/time
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Proposal {
  date: string | null
  startTime: string | null
  endTime: string | null
  proposedByMe: boolean
}
interface RescheduleState {
  current: { date: string; startTime: string; endTime: string }
  proposal: Proposal | null
  canReschedule: boolean
}

interface Props {
  requestId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged?: () => void
}

export function OneOnOneRescheduleDialog({ requestId, open, onOpenChange, onChanged }: Props) {
  const [state, setState] = useState<RescheduleState | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/one-on-one/reschedule?requestId=${encodeURIComponent(requestId)}`, {
      credentials: 'include',
    })
      .then(r => (r.ok ? r.json() : null))
      .then((data: RescheduleState | null) => {
        setState(data)
        if (data?.current) {
          setDate(data.current.date)
          setStartTime(data.current.startTime)
          setEndTime(data.current.endTime)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [requestId])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const propose = async () => {
    if (!date || !startTime || !endTime) {
      toast.error('Pick a date, start and end time')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/one-on-one/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestId, date, startTime, endTime }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('New time proposed — waiting for the other person to accept.')
        onChanged?.()
        onOpenChange(false)
      } else {
        toast.error(data.error || 'Could not propose a new time')
      }
    } finally {
      setBusy(false)
    }
  }

  const respond = async (action: 'accept' | 'decline') => {
    setBusy(true)
    try {
      const res = await fetch('/api/one-on-one/reschedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestId, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(
          action === 'accept' ? 'Session moved to the new time.' : 'Reschedule declined.'
        )
        onChanged?.()
        onOpenChange(false)
      } else {
        toast.error(data.error || 'Could not respond')
      }
    } finally {
      setBusy(false)
    }
  }

  const proposal = state?.proposal
  const incoming = proposal && !proposal.proposedByMe
  const mine = proposal && proposal.proposedByMe

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reschedule session</DialogTitle>
          <DialogDescription>
            {state?.current
              ? `Currently ${state.current.date}, ${state.current.startTime}–${state.current.endTime}.`
              : 'Propose a new time for this 1-on-1.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : incoming ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-700">
              The other person proposed a new time:{' '}
              <span className="font-semibold">
                {proposal!.date}, {proposal!.startTime}–{proposal!.endTime}
              </span>
              .
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={busy} onClick={() => respond('decline')}>
                Decline
              </Button>
              <Button disabled={busy} onClick={() => respond('accept')}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Accept new time
              </Button>
            </div>
          </div>
        ) : mine ? (
          <p className="py-4 text-sm text-gray-600">
            You proposed {proposal!.date}, {proposal!.startTime}–{proposal!.endTime}. Waiting for
            the other person to accept or decline.
          </p>
        ) : (
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="rs-date">Date</Label>
              <Input
                id="rs-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="rs-start">Start</Label>
                <Input
                  id="rs-start"
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="rs-end">End</Label>
                <Input
                  id="rs-end"
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={propose} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Propose new time
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
