/**
 * Direct-message conversation helpers.
 *
 * A `conversation` row (participant1Id, participant2Id) is what makes two users
 * appear in each other's chat list on the communications page. This mirrors the
 * order-independent get-or-create used by POST /api/conversations, so it can be
 * called from server-side flows (e.g. a paid 1-on-1 booking) to open a thread.
 */

import crypto from 'crypto'
import { and, eq, or } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { conversation } from '@/lib/db/schema'

const pairFilter = (a: string, b: string) =>
  or(
    and(eq(conversation.participant1Id, a), eq(conversation.participant2Id, b)),
    and(eq(conversation.participant1Id, b), eq(conversation.participant2Id, a))
  )

/**
 * Ensure a 1:1 conversation exists between two users (order-independent).
 * Returns the conversation id, or null if the inputs are invalid. Idempotent and
 * safe to call repeatedly / concurrently.
 */
export async function getOrCreateConversation(
  userAId: string | null | undefined,
  userBId: string | null | undefined
): Promise<string | null> {
  if (!userAId || !userBId || userAId === userBId) return null

  const existing = await drizzleDb
    .select({ conversationId: conversation.conversationId })
    .from(conversation)
    .where(pairFilter(userAId, userBId))
    .limit(1)
  if (existing[0]) return existing[0].conversationId

  const id = crypto.randomUUID()
  try {
    await drizzleDb.insert(conversation).values({
      conversationId: id,
      participant1Id: userAId,
      participant2Id: userBId,
    })
    return id
  } catch {
    // Lost a race with a concurrent insert — re-read the winner.
    const again = await drizzleDb
      .select({ conversationId: conversation.conversationId })
      .from(conversation)
      .where(pairFilter(userAId, userBId))
      .limit(1)
    return again[0]?.conversationId ?? null
  }
}
