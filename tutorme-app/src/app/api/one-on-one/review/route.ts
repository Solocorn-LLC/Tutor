/**
 * 1-on-1 reviews.
 *
 * GET  ?requestId=…  → the caller's review for that booking (or null) + whether
 *                      it's reviewable yet.
 * POST { requestId, rating, comment? } → student submits/updates their review of
 *                      a completed, paid session (one per booking).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest, oneOnOneReview } from '@/lib/db/schema'
import { nanoid } from 'nanoid'

const postSchema = z.object({
  requestId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
})

/** A booking is reviewable once it's paid and its scheduled end has passed. */
function isReviewable(booking: { status: string; requestedDate: Date; endTime: string }): boolean {
  if (booking.status !== 'PAID') return false
  const date = booking.requestedDate.toISOString().split('T')[0]
  const end = new Date(`${date}T${booking.endTime}:00`)
  return Number.isFinite(end.getTime()) && end.getTime() < Date.now()
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestId = new URL(req.url).searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  const booking = await drizzleDb.query.oneOnOneBookingRequest.findFirst({
    where: eq(oneOnOneBookingRequest.requestId, requestId),
  })
  if (!booking || (booking.studentId !== session.user.id && booking.tutorId !== session.user.id)) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const [review] = await drizzleDb
    .select()
    .from(oneOnOneReview)
    .where(eq(oneOnOneReview.requestId, requestId))
    .limit(1)

  return NextResponse.json({
    review: review ?? null,
    reviewable: booking.studentId === session.user.id && isReviewable(booking),
  })
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions, req)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { requestId, rating, comment } = postSchema.parse(await req.json())

    const booking = await drizzleDb.query.oneOnOneBookingRequest.findFirst({
      where: eq(oneOnOneBookingRequest.requestId, requestId),
    })
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    if (booking.studentId !== session.user.id) {
      return NextResponse.json(
        { error: 'Only the student can review this session' },
        { status: 403 }
      )
    }
    if (!isReviewable(booking)) {
      return NextResponse.json(
        { error: 'You can review a session once it has been paid and has taken place.' },
        { status: 400 }
      )
    }

    // Upsert — one review per booking; a student can update their own.
    const [existing] = await drizzleDb
      .select({ reviewId: oneOnOneReview.reviewId })
      .from(oneOnOneReview)
      .where(eq(oneOnOneReview.requestId, requestId))
      .limit(1)

    if (existing) {
      await drizzleDb
        .update(oneOnOneReview)
        .set({ rating, comment: comment ?? null, updatedAt: new Date() })
        .where(eq(oneOnOneReview.reviewId, existing.reviewId))
    } else {
      await drizzleDb.insert(oneOnOneReview).values({
        reviewId: nanoid(),
        requestId,
        tutorId: booking.tutorId,
        studentId: booking.studentId,
        rating,
        comment: comment ?? null,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid review (rating must be 1–5)' }, { status: 400 })
    }
    console.error('review submit failed:', err)
    return NextResponse.json({ error: 'Failed to submit review' }, { status: 500 })
  }
}
