import { and, eq, isNull } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest } from '@/lib/db/schema'

/**
 * The amount a single payment covers for a recurring series: the sum of every
 * ACCEPTED, still-unpaid session in it. Shared by the payment-create route (the
 * charge) and the request GET (the price the payment page shows), so the two can
 * never disagree. `total` is rounded to cents; `count` is how many sessions.
 */
export async function unpaidSeriesTotal(
  seriesId: string
): Promise<{ count: number; total: number }> {
  const rows = await drizzleDb
    .select({ costPerSession: oneOnOneBookingRequest.costPerSession })
    .from(oneOnOneBookingRequest)
    .where(
      and(
        eq(oneOnOneBookingRequest.seriesId, seriesId),
        eq(oneOnOneBookingRequest.status, 'ACCEPTED'),
        isNull(oneOnOneBookingRequest.paidAt)
      )
    )
  const total =
    Math.round(rows.reduce((sum, r) => sum + Number(r.costPerSession || 0), 0) * 100) / 100
  return { count: rows.length, total }
}
