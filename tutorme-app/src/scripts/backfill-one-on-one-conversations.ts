/**
 * Backfill direct-message conversations for already-PAID 1-on-1 bookings.
 *
 * The chat-on-payment wiring only opens a thread for NEW payments. This ensures
 * the conversation exists for every historical PAID booking too, so those
 * student/tutor pairs also appear in each other's chat list. Idempotent
 * (get-or-create) and safe to re-run.
 *
 * Run: DATABASE_URL=... npx tsx src/scripts/backfill-one-on-one-conversations.ts
 */

import { eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest } from '@/lib/db/schema'
import { getOrCreateConversation } from '@/lib/messaging/conversation'

export async function backfillOneOnOneConversations(): Promise<{ pairs: number }> {
  const rows = await drizzleDb
    .select({
      studentId: oneOnOneBookingRequest.studentId,
      tutorId: oneOnOneBookingRequest.tutorId,
    })
    .from(oneOnOneBookingRequest)
    .where(eq(oneOnOneBookingRequest.status, 'PAID'))

  const seen = new Set<string>()
  for (const r of rows) {
    const key = [r.studentId, r.tutorId].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    await getOrCreateConversation(r.studentId, r.tutorId)
  }
  return { pairs: seen.size }
}

if (require.main === module) {
  backfillOneOnOneConversations()
    .then(({ pairs }) => {
      console.log(`✓ Ensured direct-message conversations for ${pairs} paid 1-on-1 pair(s).`)
      process.exit(0)
    })
    .catch(err => {
      console.error('backfill failed:', err)
      process.exit(1)
    })
}
