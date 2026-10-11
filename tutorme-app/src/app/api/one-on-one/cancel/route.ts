import { withCsrf } from '@/lib/api/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { eq, and, ne, inArray, sql } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest, calendarEvent, liveSession } from '@/lib/db/schema'
import { notify } from '@/lib/notifications/notify'
import { refundPaidOneOnOne, type RefundOutcome } from '@/lib/payments/refund-one-on-one'
import { notifyWaitlistOfOpening } from '@/lib/one-on-one/waitlist'
import { slotInstants } from '@/lib/one-on-one/time'
import { z } from 'zod'

const cancelSchema = z.object({
  requestId: z.string().min(1),
  reason: z.string().max(500).optional(),
})

export const PATCH = withCsrf(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions, request)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validated = cancelSchema.parse(body)

    // Get the existing request
    const existingRequest = await drizzleDb.query.oneOnOneBookingRequest.findFirst({
      where: eq(oneOnOneBookingRequest.requestId, validated.requestId),
    })

    if (!existingRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    // Verify the user is either the student or tutor of this request
    const isStudent = existingRequest.studentId === session.user.id
    const isTutor = existingRequest.tutorId === session.user.id

    if (!isStudent && !isTutor) {
      return NextResponse.json({ error: 'Not authorized to cancel this request' }, { status: 403 })
    }

    // Cancellable while still upcoming: pending, accepted, or paid. A paid
    // cancellation frees the session and flags a refund (processed via the
    // standard tutor/admin refund flow — see the refund-owed notification below).
    if (!['PENDING', 'ACCEPTED', 'PAID'].includes(existingRequest.status)) {
      return NextResponse.json(
        {
          error: `Cannot cancel a request that is already ${existingRequest.status.toLowerCase()}`,
        },
        { status: 400 }
      )
    }
    // A recurring booking cancels as a whole unit: it was booked — and paid, in a
    // single transaction covering every session — as one series, so a partial
    // cancel would over-refund. The whole cancel runs in ONE transaction behind
    // an advisory lock (keyed on the series, or the lone request) so concurrent
    // cancels — or a payment webhook landing mid-cancel — serialize instead of
    // double-refunding.
    const lockKey = `one-on-one-cancel:${existingRequest.seriesId ?? existingRequest.requestId}`

    const outcome = await drizzleDb.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`)

      // Re-read the still-cancellable targets AFTER taking the lock: the
      // pre-lock snapshot may be stale (concurrent cancel or webhook).
      const targets = await tx.query.oneOnOneBookingRequest.findMany({
        where: and(
          existingRequest.seriesId
            ? eq(oneOnOneBookingRequest.seriesId, existingRequest.seriesId)
            : eq(oneOnOneBookingRequest.requestId, existingRequest.requestId),
          inArray(oneOnOneBookingRequest.status, ['PENDING', 'ACCEPTED', 'PAID'])
        ),
      })

      // A concurrent cancel already flipped the acting row — bail out of the
      // transaction; the caller returns 409 below.
      const acting = targets.find(t => t.requestId === validated.requestId)
      if (!acting) return null

      // Only a genuinely paid booking (positive cost) triggers a refund. Free
      // sessions are PAID with a 0 cost and have no payment to refund. The single
      // series payment is keyed to the head (seriesIndex 0) request.
      const wasPaid = targets.some(t => t.status === 'PAID' && (t.costPerSession ?? 0) > 0)
      const refundKeyId = existingRequest.seriesId
        ? (targets.find(t => (t.seriesIndex ?? 0) === 0)?.requestId ?? existingRequest.requestId)
        : existingRequest.requestId

      // Prorated refund policy: the student gets back the undelivered share of
      // what they paid. A session counts as delivered once its scheduled start
      // has passed, so a 10-session series cancelled after 2 sessions refunds 8/10.
      const now = new Date()
      const allRows = existingRequest.seriesId
        ? await tx.query.oneOnOneBookingRequest.findMany({
            where: eq(oneOnOneBookingRequest.seriesId, existingRequest.seriesId),
          })
        : targets
      const total = allRows.length
      const delivered = allRows.filter(r => {
        const { start } = slotInstants(
          r.requestedDate.toISOString().split('T')[0],
          r.startTime,
          r.endTime,
          r.timezone
        )
        return start.getTime() <= now.getTime()
      }).length
      const remaining = Math.max(0, total - delivered)
      const refundFraction = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0
      const prorationNote = total > 1 ? `${remaining} of ${total} sessions remained` : 'full amount'

      // Cancel each session's calendar event and end its linked live session.
      for (const t of targets) {
        if (!t.calendarEventId) continue
        const [updatedEvent] = await tx
          .update(calendarEvent)
          .set({
            status: 'CANCELLED',
            isCancelled: true,
            updatedAt: new Date(),
          })
          .where(eq(calendarEvent.eventId, t.calendarEventId))
          .returning({ externalId: calendarEvent.externalId })

        if (updatedEvent?.externalId) {
          await tx
            .update(liveSession)
            .set({ status: 'ended', endedAt: new Date() })
            .where(
              and(
                eq(liveSession.sessionId, updatedEvent.externalId),
                ne(liveSession.status, 'ended')
              )
            )
        }
      }

      // Flip every target session to CANCELLED (conditional on still-cancellable
      // status — the lock makes this belt-and-braces), then append the
      // cancellation reason to the specific request the user acted on.
      await tx
        .update(oneOnOneBookingRequest)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(
          and(
            inArray(
              oneOnOneBookingRequest.requestId,
              targets.map(t => t.requestId)
            ),
            inArray(oneOnOneBookingRequest.status, ['PENDING', 'ACCEPTED', 'PAID'])
          )
        )

      const updatedRequest = await tx
        .update(oneOnOneBookingRequest)
        .set({
          tutorNotes:
            validated.reason && isStudent
              ? `${existingRequest.tutorNotes || ''}\nCancellation reason (from student): ${validated.reason}`.trim()
              : validated.reason && isTutor
                ? `${existingRequest.tutorNotes || ''}\nCancellation reason (from tutor): ${validated.reason}`.trim()
                : existingRequest.tutorNotes,
          updatedAt: new Date(),
        })
        .where(eq(oneOnOneBookingRequest.requestId, validated.requestId))
        .returning()

      return { wasPaid, refundKeyId, refundFraction, prorationNote, updatedRequest }
    })

    if (!outcome) {
      return NextResponse.json(
        { error: 'This booking was already cancelled or is no longer cancellable.' },
        { status: 409 }
      )
    }

    const { wasPaid, refundKeyId, refundFraction, prorationNote, updatedRequest } = outcome

    // Notify whichever party did not initiate the cancellation
    const otherPartyId = isStudent ? existingRequest.tutorId : existingRequest.studentId
    notify({
      userId: otherPartyId,
      type: 'class',
      title: '1-on-1 Session Cancelled',
      message: isStudent
        ? 'Your student has cancelled the upcoming 1-on-1 session.'
        : 'Your tutor has cancelled the upcoming 1-on-1 session.',
      data: { requestId: updatedRequest[0].requestId, type: 'one-on-one-cancelled' },
      actionUrl: isStudent ? '/tutor/dashboard' : '/student/dashboard',
    }).catch(console.error)

    // A paid booking is refunded automatically through the original gateway,
    // prorated to the undelivered sessions (fraction computed inside the lock).
    let refundResult: RefundOutcome | null = null
    if (wasPaid) {
      if (refundFraction <= 0) {
        // Every session already happened — nothing left to return.
        refundResult = { refunded: true, amount: 0, fee: 0 }
      } else {
        // One refund for the whole series — the payment covers all its sessions.
        refundResult = await refundPaidOneOnOne(
          refundKeyId,
          `Cancelled by ${isStudent ? 'student' : 'tutor'}`,
          { refundableFraction: refundFraction }
        )
      }
      if (refundResult.refunded && (refundResult.amount ?? 0) > 0) {
        const amt = `${refundResult.amount}${refundResult.currency ? ' ' + refundResult.currency : ''}`
        notify({
          userId: existingRequest.studentId,
          type: 'class',
          title: 'Refund issued',
          message: `Your 1-on-1 was cancelled — ${amt} has been refunded (${prorationNote}).`,
          data: {
            requestId: updatedRequest[0].requestId,
            type: 'one-on-one-refunded',
            amount: refundResult.amount,
            fee: refundResult.fee,
          },
        }).catch(console.error)
        notify({
          userId: existingRequest.tutorId,
          type: 'class',
          title: '1-on-1 refunded',
          message: `The cancelled session was refunded to the student (${amt}, ${prorationNote}).`,
          data: { requestId: updatedRequest[0].requestId, type: 'one-on-one-refunded' },
        }).catch(console.error)
      } else if (!refundResult.refunded) {
        // Automated refund failed — flag it so the owed amount isn't lost.
        notify({
          userId: existingRequest.tutorId,
          type: 'class',
          title: 'Refund needs attention — 1-on-1 cancelled',
          message: `The automatic refund failed (${refundResult.error ?? 'unknown error'}). Please refund ${refundResult.amount ?? existingRequest.costPerSession} to the student manually.`,
          data: {
            requestId: updatedRequest[0].requestId,
            type: 'one-on-one-refund-required',
            amount: refundResult.amount ?? existingRequest.costPerSession,
          },
          actionUrl: '/tutor/dashboard',
        }).catch(console.error)
      }
    }

    // Cancelling a confirmed booking frees a slot — let this tutor's waitlist
    // know they may have new availability.
    if (existingRequest.status === 'ACCEPTED' || existingRequest.status === 'PAID') {
      void notifyWaitlistOfOpening(existingRequest.tutorId)
    }

    return NextResponse.json({
      success: true,
      refunded: refundResult?.refunded ?? false,
      refundAmount: refundResult?.amount,
      refundFee: refundResult?.fee,
      refundRequired: wasPaid && !refundResult?.refunded,
      request: updatedRequest[0],
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: error.issues,
        },
        { status: 400 }
      )
    }

    console.error('Error canceling one-on-one request:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
