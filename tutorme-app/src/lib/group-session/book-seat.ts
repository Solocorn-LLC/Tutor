import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { toast } from 'sonner'

export type BookSeatResult = 'booked' | 'redirecting' | 'error'

/**
 * Reserve a seat in a group session and, for a paid session, start checkout.
 * Shared by the tutor-profile list and the browse page. Returns:
 * - 'booked'      — free/auto-confirmed seat, nothing more to do (reload the list)
 * - 'redirecting' — sent to the payment gateway (page is navigating away)
 * - 'error'       — a toast was already shown
 */
export async function bookGroupSeat(groupSessionId: string): Promise<BookSeatResult> {
  try {
    // 1. Reserve a seat.
    const joinRes = await fetch(`/api/group-sessions/${groupSessionId}/join`, {
      method: 'POST',
      credentials: 'include',
    })
    const joinData = await joinRes.json().catch(() => ({}))
    if (!joinRes.ok || !joinData.participantId) {
      toast.error(joinData.error || 'Could not reserve a seat')
      return 'error'
    }
    // Free session: the seat is already confirmed — no checkout.
    if (joinData.free || joinData.confirmed) {
      toast.success("You're booked — this session is free. See you there!")
      return 'booked'
    }
    // 2. Start checkout for that seat.
    const payRes = await fetchWithCsrf('/api/payments/create', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupSessionParticipantId: joinData.participantId }),
    })
    const payData = await payRes.json().catch(() => ({}))
    if (payRes.ok && payData.checkoutUrl) {
      window.location.href = payData.checkoutUrl
      return 'redirecting'
    }
    toast.error(payData.error || 'Could not start checkout')
    return 'error'
  } catch {
    toast.error('Something went wrong — please try again')
    return 'error'
  }
}
