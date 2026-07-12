/**
 * 1-on-1 review helpers — the tutor's aggregate rating shown on their profile.
 */

import { eq, sql } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneReview } from '@/lib/db/schema'

export interface TutorRating {
  /** Mean rating (1–5) rounded to 1 dp, or null when there are no reviews. */
  average: number | null
  count: number
}

export async function getTutorRating(tutorId: string): Promise<TutorRating> {
  const [row] = await drizzleDb
    .select({
      avg: sql<number>`avg(${oneOnOneReview.rating})`,
      count: sql<number>`count(*)::int`,
    })
    .from(oneOnOneReview)
    .where(eq(oneOnOneReview.tutorId, tutorId))

  const count = Number(row?.count ?? 0)
  if (count === 0) return { average: null, count: 0 }
  return { average: Math.round(Number(row.avg) * 10) / 10, count }
}
