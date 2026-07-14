/**
 * Mark finished 1-on-1 sessions COMPLETED.
 *
 * A paid booking otherwise stays PAID forever, so a past session still reads as
 * an upcoming "Confirmed" booking, keeps offering a (pointless) Join button, and
 * never nudges the student for a review. This flips a PAID booking to COMPLETED
 * once its scheduled end (plus a grace period, so a session running a little long
 * isn't cut off) has passed.
 *
 * Per-session, not per-series: each week of a series finishes — and becomes
 * reviewable — at its own time. Reviews accept PAID or COMPLETED (see the review
 * route), so this transition never blocks a review.
 *
 * Runs lazily when a party views their requests, on boot, and from the cron sweep.
 */

import { and, eq, lte, inArray, isNotNull } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest } from '@/lib/db/schema'
import { notify } from '@/lib/notifications/notify'
import { bookingInstants } from '@/lib/one-on-one/time'

/** Grace after the scheduled end before a session counts as finished. */
const COMPLETION_GRACE_MS = 60 * 60 * 1000 // 1 hour

export async function completeFinishedOneOnOneSessions(
  opts: { tutorId?: string; studentId?: string } = {}
): Promise<number> {
  const now = Date.now()

  const conditions = [
    eq(oneOnOneBookingRequest.status, 'PAID'),
    isNotNull(oneOnOneBookingRequest.paidAt),
    // Coarse pre-filter: only bookings whose calendar date is today or past
    // (widened a day so a far-east-timezone session that already ended isn't
    // missed). The exact end instant is checked in JS below.
    lte(oneOnOneBookingRequest.requestedDate, new Date(now + 24 * 60 * 60 * 1000)),
  ]
  if (opts.tutorId) conditions.push(eq(oneOnOneBookingRequest.tutorId, opts.tutorId))
  if (opts.studentId) conditions.push(eq(oneOnOneBookingRequest.studentId, opts.studentId))

  const candidates = await drizzleDb
    .select({
      requestId: oneOnOneBookingRequest.requestId,
      studentId: oneOnOneBookingRequest.studentId,
      tutorId: oneOnOneBookingRequest.tutorId,
      requestedDate: oneOnOneBookingRequest.requestedDate,
      startTime: oneOnOneBookingRequest.startTime,
      endTime: oneOnOneBookingRequest.endTime,
      timezone: oneOnOneBookingRequest.timezone,
    })
    .from(oneOnOneBookingRequest)
    .where(and(...conditions))

  const finished = candidates.filter(b => {
    const { end } = bookingInstants(b)
    return Number.isFinite(end.getTime()) && end.getTime() + COMPLETION_GRACE_MS < now
  })
  if (finished.length === 0) return 0

  await drizzleDb
    .update(oneOnOneBookingRequest)
    .set({ status: 'COMPLETED', updatedAt: new Date() })
    .where(
      inArray(
        oneOnOneBookingRequest.requestId,
        finished.map(b => b.requestId)
      )
    )

  // Nudge each student to review the session they just had.
  for (const b of finished) {
    notify({
      userId: b.studentId,
      type: 'class',
      title: 'How was your 1-on-1?',
      message: 'Your session is complete — leave a quick review to help other students.',
      data: { requestId: b.requestId, type: 'one-on-one-review-prompt' },
      actionUrl: '/student/dashboard',
    }).catch(() => {})
  }

  return finished.length
}
