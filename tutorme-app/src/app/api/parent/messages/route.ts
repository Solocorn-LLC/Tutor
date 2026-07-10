/**
 * GET /api/parent/messages
 * List conversations and messages for parent (DirectMessage system)
 */

import { NextRequest, NextResponse } from 'next/server'
import { eq, or, desc, sql } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { conversation } from '@/lib/db/schema'
import cacheManager from '@/lib/cache-manager'

const CACHE_TTL = 60

export const GET = withAuth(
  async (req: NextRequest, session) => {
    const userId = session.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cacheKey = `parent:messages:${userId}`
    const cached = await cacheManager.get<object>(cacheKey)
    if (cached) return NextResponse.json({ success: true, data: cached })

    const conversationsResult = await drizzleDb.query.conversation.findMany({
      where: or(eq(conversation.participant1Id, userId), eq(conversation.participant2Id, userId)),
      with: {
        participant1: {
          with: {
            profile: { columns: { name: true } },
          },
          columns: { userId: true, email: true },
        },
        participant2: {
          with: {
            profile: { columns: { name: true } },
          },
          columns: { userId: true, email: true },
        },
        messages: {
          orderBy: [desc(sql`createdAt`)], // Using sql here because of Drizzle's nested orderBy syntax
          limit: 20,
          with: {
            sender: {
              with: {
                profile: { columns: { name: true } },
              },
              columns: { userId: true },
            },
          },
        },
      },
      orderBy: [desc(conversation.updatedAt)],
      limit: 20,
    })

    const data = {
      conversations: conversationsResult.map((c: any) => {
        const other = c.participant1Id === userId ? c.participant2 : c.participant1
        return {
          id: c.conversationId,
          otherUser: {
            id: other.userId,
            name: other.profile?.name ?? other.email,
            email: other.email,
          },
          lastUpdated: c.updatedAt,
          messages: c.messages
            .map((m: any) => ({
              id: m.messageId,
              content: m.content,
              senderId: m.senderId,
              senderName: m.sender.profile?.name ?? null,
              read: m.read,
              createdAt: m.createdAt,
            }))
            .reverse(), // Reversing because we took desc but usually chat shows asc
        }
      }),
    }

    await cacheManager.set(cacheKey, data, {
      ttl: CACHE_TTL,
      tags: [`parent:${userId}`],
    })
    return NextResponse.json({ success: true, data })
  },
  { role: 'PARENT' }
)
