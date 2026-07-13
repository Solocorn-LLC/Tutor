/**
 * Conversations API (Messaging System)
 * GET /api/conversations - List user's conversations
 * POST /api/conversations - Create or get conversation
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { conversation, directMessage, user, profile } from '@/lib/db/schema'
import { or, eq, and, desc, ne, inArray, sql } from 'drizzle-orm'
import { canSendDirectMessage, isConversationAllowedByRoles } from '@/lib/messaging/permissions'

type AppRole = 'STUDENT' | 'TUTOR' | 'PARENT' | 'ADMIN'

// GET - List conversations
export const GET = withAuth(async (req: NextRequest, session) => {
  const userId = session.user.id

  const conversations = await drizzleDb
    .select()
    .from(conversation)
    .where(or(eq(conversation.participant1Id, userId), eq(conversation.participant2Id, userId)))
    .orderBy(desc(conversation.updatedAt))

  if (conversations.length === 0) {
    return NextResponse.json({ conversations: [] })
  }

  const convIds = conversations.map(c => c.conversationId)
  const participantIds = [
    ...new Set(conversations.flatMap(c => [c.participant1Id, c.participant2Id])),
  ]

  const [participants, profiles, allMessages, unreadRows] = await Promise.all([
    drizzleDb.select().from(user).where(inArray(user.userId, participantIds)),
    drizzleDb.select().from(profile).where(inArray(profile.userId, participantIds)),
    drizzleDb
      .select()
      .from(directMessage)
      .where(inArray(directMessage.conversationId, convIds))
      .orderBy(desc(directMessage.createdAt)),
    drizzleDb
      .select({
        conversationId: directMessage.conversationId,
        count: sql<number>`count(*)::int`,
      })
      .from(directMessage)
      .where(
        and(
          inArray(directMessage.conversationId, convIds),
          eq(directMessage.read, false),
          ne(directMessage.senderId, userId)
        )
      )
      .groupBy(directMessage.conversationId),
  ])

  const profileByUserId = Object.fromEntries(profiles.map(p => [p.userId, p]))
  const userById = Object.fromEntries(participants.map(u => [u.userId, u]))
  const lastMessageByConvId: Record<string, (typeof allMessages)[0]> = {}
  for (const m of allMessages) {
    if (!lastMessageByConvId[m.conversationId]) lastMessageByConvId[m.conversationId] = m
  }
  const unreadByConvId = Object.fromEntries(unreadRows.map(r => [r.conversationId, r.count]))

  const formattedConversations = conversations
    .filter(conv =>
      isConversationAllowedByRoles(
        (userById[conv.participant1Id]?.role as AppRole) ?? 'STUDENT',
        (userById[conv.participant2Id]?.role as AppRole) ?? 'STUDENT'
      )
    )
    .map(conv => {
      const p1 = userById[conv.participant1Id]
      const p2 = userById[conv.participant2Id]
      const otherParticipant = conv.participant1Id === userId ? p2 : p1
      const otherProfile = otherParticipant ? profileByUserId[otherParticipant.userId] : null
      const lastMsg = lastMessageByConvId[conv.conversationId]
      return {
        ...conv,
        // The DB row exposes `conversationId` (column `id`); the client reads
        // `conversation.id` (used to build /api/conversations/:id/messages URLs).
        // Without this, that id was `undefined` → 404 on load and send.
        id: conv.conversationId,
        participant1: p1
          ? {
              id: p1?.userId,
              email: p1.email,
              role: p1.role,
              profile: profileByUserId[p1?.userId ?? '']
                ? {
                    name: profileByUserId[p1?.userId ?? ''].name,
                    avatarUrl: profileByUserId[p1?.userId ?? ''].avatarUrl,
                  }
                : null,
            }
          : null,
        participant2: p2
          ? {
              id: p2?.userId,
              email: p2.email,
              role: p2.role,
              profile: profileByUserId[p2?.userId ?? '']
                ? {
                    name: profileByUserId[p2?.userId ?? ''].name,
                    avatarUrl: profileByUserId[p2?.userId ?? ''].avatarUrl,
                  }
                : null,
            }
          : null,
        otherParticipant: otherParticipant
          ? {
              id: otherParticipant.userId,
              name: otherProfile?.name ?? otherParticipant.email?.split('@')[0] ?? '',
              avatarUrl: otherProfile?.avatarUrl ?? null,
            }
          : null,
        lastMessage: lastMsg
          ? {
              content: lastMsg.content,
              createdAt: lastMsg.createdAt,
              read: lastMsg.read,
              senderId: lastMsg.senderId,
            }
          : null,
        unreadCount: unreadByConvId[conv.conversationId] ?? 0,
      }
    })

  return NextResponse.json({ conversations: formattedConversations })
})

// POST - Create or get existing conversation
export const POST = withAuth(async (req: NextRequest, session) => {
  const userId = session.user.id
  const userRole = session.user.role as AppRole

  try {
    const body = await req.json()
    const { participantId } = body

    if (!participantId) {
      return NextResponse.json({ error: 'Participant ID is required' }, { status: 400 })
    }

    if (participantId === userId) {
      return NextResponse.json(
        { error: 'Cannot create conversation with yourself' },
        { status: 400 }
      )
    }

    const [participant] = await drizzleDb
      .select({ userId: user.userId, role: user.role })
      .from(user)
      .where(eq(user.userId, participantId))
    if (!participant) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }
    const participantUserId = participant.userId

    if (
      !canSendDirectMessage(userRole, participant.role as AppRole) ||
      !canSendDirectMessage(participant.role as AppRole, userRole)
    ) {
      return NextResponse.json(
        { error: 'Messaging is not allowed between these roles' },
        { status: 403 }
      )
    }

    const existing = await drizzleDb
      .select()
      .from(conversation)
      .where(
        or(
          and(
            eq(conversation.participant1Id, userId),
            eq(conversation.participant2Id, participantUserId)
          ),
          and(
            eq(conversation.participant1Id, participantUserId),
            eq(conversation.participant2Id, userId)
          )
        )
      )
      .limit(1)

    let conv: (typeof existing)[0] | undefined = existing[0]
    if (!conv) {
      const id = crypto.randomUUID()
      await drizzleDb.insert(conversation).values({
        conversationId: id,
        participant1Id: userId,
        participant2Id: participantId,
      })
      const [created] = await drizzleDb
        .select()
        .from(conversation)
        .where(eq(conversation.conversationId, id))
      conv = created
    }

    if (!conv) {
      return handleApiError(
        new Error('Failed to create conversation'),
        'Failed to create conversation',
        'api/conversations/route.ts'
      )
    }

    const [p1] = await drizzleDb
      .select({ userId: user.userId, email: user.email, role: user.role })
      .from(user)
      .where(eq(user.userId, conv.participant1Id))
    const [p2] = await drizzleDb
      .select({ userId: user.userId, email: user.email, role: user.role })
      .from(user)
      .where(eq(user.userId, conv.participant2Id))
    const prof1 = p1
      ? (await drizzleDb.select().from(profile).where(eq(profile.userId, p1.userId)))[0]
      : null
    const prof2 = p2
      ? (await drizzleDb.select().from(profile).where(eq(profile.userId, p2.userId)))[0]
      : null

    const conversationResponse = {
      ...conv,
      participant1: p1
        ? {
            id: p1?.userId,
            email: p1.email,
            role: p1.role,
            profile: prof1 ? { name: prof1.name, avatarUrl: prof1.avatarUrl } : null,
          }
        : null,
      participant2: p2
        ? {
            id: p2?.userId,
            email: p2.email,
            role: p2.role,
            profile: prof2 ? { name: prof2.name, avatarUrl: prof2.avatarUrl } : null,
          }
        : null,
    }

    return NextResponse.json({ conversation: conversationResponse })
  } catch (error) {
    console.error('Create conversation error:', error)
    return handleApiError(error, 'Failed to create conversation', 'api/conversations/route.ts')
  }
})
