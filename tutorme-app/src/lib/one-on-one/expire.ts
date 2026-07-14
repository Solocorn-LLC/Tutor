/**
 * Expire overdue 1-on-1 bookings.
 *
 * When a tutor accepts a paid request the booking sits in ACCEPTED with a 48h
 * `paymentDueAt` window while it holds the tutor's slot (an ACCEPTED booking
 * blocks the time in conflict detection). If the student never pays, the hold
 * would linger forever. This sweep flips overdue, still-unpaid holds to EXPIRED,
 * frees the calendar slot, notifies both parties, and pings the tutor's waitlist.
 *
 * Free sessions are confirmed (PAID) on accept with no `paymentDueAt`, so they
 * never match. Runs on boot, lazily when a tutor's availability/requests are
 * viewed, and from the cron endpoint.
 */

import { and, eq, isNull, lt, ne, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest, calendarEvent, liveSession } from '@/lib/db/schema'
import { notify } from '@/lib/notifications/notify'
import { notifyWaitlistOfOpening } from '@/lib/one-on-one/waitlist'

export async function expireOverdueOneOnOneBookings(
  opts: { tutorId?: string; studentId?: string } = {}
): Promise<number> {
  const now = new Date()

  const conditions = [
    eq(oneOnOneBookingRequest.status, 'ACCEPTED'),
    isNull(oneOnOneBookingRequest.paidAt),
    // `lt(paymentDueAt, now)` also excludes rows where paymentDueAt is null.
    lt(oneOnOneBookingRequest.paymentDueAt, now),
  ]
  if (opts.tutorId) conditions.push(eq(oneOnOneBookingRequest.tutorId, opts.tutorId))
  if (opts.studentId) conditions.push(eq(oneOnOneBookingRequest.studentId, opts.studentId))

  const overdue = await drizzleDb
    .select({
      requestId: oneOnOneBookingRequest.requestId,
      tutorId: oneOnOneBookingRequest.tutorId,
      studentId: oneOnOneBookingRequest.studentId,
      seriesId: oneOnOneBookingRequest.seriesId,
      calendarEventId: oneOnOneBookingRequest.calendarEventId,
    })
    .from(oneOnOneBookingRequest)
    .where(and(...conditions))

  if (overdue.length === 0) return 0

  // Free each held slot: cancel its calendar event and end the linked session.
  for (const b of overdue) {
    if (!b.calendarEventId) continue
    const [ev] = await drizzleDb
      .update(calendarEvent)
      .set({ status: 'CANCELLED', isCancelled: true, updatedAt: now })
      .where(eq(calendarEvent.eventId, b.calendarEventId))
      .returning({ externalId: calendarEvent.externalId })
    if (ev?.externalId) {
      await drizzleDb
        .update(liveSession)
        .set({ status: 'ended', endedAt: now })
        .where(and(eq(liveSession.sessionId, ev.externalId), ne(liveSession.status, 'ended')))
    }
  }

  // Flip them all to EXPIRED.
  await drizzleDb
    .update(oneOnOneBookingRequest)
    .set({ status: 'EXPIRED', updatedAt: now })
    .where(
      inArray(
        oneOnOneBookingRequest.requestId,
        overdue.map(b => b.requestId)
      )
    )

  // Notify once per booking group (a series is one booking).
  const groups = new Map<string, typeof overdue>()
  for (const b of overdue) {
    const key = b.seriesId ?? b.requestId
    const arr = groups.get(key)
    if (arr) arr.push(b)
    else groups.set(key, [b])
  }
  for (const members of groups.values()) {
    const head = members[0]
    const label = members.length > 1 ? `${members.length}-session series` : 'session'
    notify({
      userId: head.studentId,
      type: 'class',
      title: '1-on-1 booking expired',
      message: `Your 1-on-1 ${label} expired because payment wasn't completed in time. The hold has been released — you can book again.`,
      data: { requestId: head.requestId, seriesId: head.seriesId, type: 'one-on-one-expired' },
      actionUrl: '/student/tutors',
    }).catch(() => {})
    notify({
      userId: head.tutorId,
      type: 'class',
      title: '1-on-1 hold released',
      message: `An unpaid 1-on-1 ${label} passed its payment window and expired, so the slot is free again.`,
      data: { requestId: head.requestId, seriesId: head.seriesId, type: 'one-on-one-expired' },
      actionUrl: '/tutor/dashboard',
    }).catch(() => {})
  }

  // Let each affected tutor's waitlist know a slot opened (deduped).
  for (const tutorId of new Set(overdue.map(b => b.tutorId))) {
    void notifyWaitlistOfOpening(tutorId)
  }

  return overdue.length
}
