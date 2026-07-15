import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { toast } from 'sonner'

export type ResumePaymentResult = 'redirecting' | 'error'

/**
 * Resume checkout for a group-session seat the student already RESERVED but
 * never paid for (e.g. they closed the tab mid-checkout). The seat's
 * participantId is enough — `/api/payments/create` reuses the existing pending
 * checkout URL if one exists, or mints a fresh one, and rejects a seat that is
 * already PAID or no longer RESERVED. Mirrors the checkout step in
 * `bookGroupSeat`, minus the reserve call (the seat already exists).
 */
export async function resumeGroupSeatPayment(
  groupSessionParticipantId: string
): Promise<ResumePaymentResult> {
  try {
    const payRes = await fetchWithCsrf('/api/payments/create', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupSessionParticipantId }),
    })
    const payData = await payRes.json().catch(() => ({}))
    if (payRes.ok && payData.checkoutUrl) {
      window.location.href = payData.checkoutUrl
      return 'redirecting'
    }
    toast.error(payData.error || 'Could not resume checkout')
    return 'error'
  } catch {
    toast.error('Something went wrong — please try again')
    return 'error'
  }
}
