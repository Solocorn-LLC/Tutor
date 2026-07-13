/**
 * Conversation Messages API
 * GET /api/conversations/[id]/messages - Get messages
 * POST /api/conversations/[id]/messages - Send message
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, parseBoundedInt, handleApiError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { conversation, directMessage, user, profile, notification } from '@/lib/db/schema'
import { or, eq, and, desc, ne, lt, inArray } from 'drizzle-orm'
import { getInboxPathByRole, isConversationAllowedByRoles } from '@/lib/messaging/permissions'
import { recordMentions } from '@/lib/mentions/parse-mentions'

type AppRole = 'STUDENT' | 'TUTOR' | 'PARENT' | 'ADMIN'

// GET - Get messages in conversation
export const GET = withAuth(async (req: NextRequest, session, context) => {
  const id = await getParamAsync(context?.params, 'id')
  if (!id) {
    return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 })
  }
  const userId = session.user.id
  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor')
  const limit = parseBoundedInt(searchParams.get('limit'), 50, { min: 1, max: 100 })

  const [conv] = await drizzleDb
    .select({
      id: conversation.conversationId,
      participant1Id: conversation.participant1Id,
      participant2Id: conversation.participant2Id,
    })
    .from(conversation)
    .where(
      and(
        eq(conversation.conversationId, id),
        or(eq(conversation.participant1Id, userId), eq(conversation.participant2Id, userId))
      )
    )
    .limit(1)

  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const [p1, p2] = await Promise.all([
    drizzleDb
      .select({ role: user.role, userId: user.userId })
      .from(user)
      .where(eq(user.userId, conv.participant1Id))
      .limit(1),
    drizzleDb
      .select({ role: user.role, userId: user.userId })
      .from(user)
      .where(eq(user.userId, conv.participant2Id))
      .limit(1),
  ])
  if (
    !p1[0] ||
    !p2[0] ||
    !isConversationAllowedByRoles(p1[0].role as AppRole, p2[0].role as AppRole)
  ) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  let messages: {
    directMessageId: string
    conversationId: string
    senderId: string
    content: string
    type: string
    attachmentUrl: string | null
    read: boolean
    readAt: Date | null
    createdAt: Date
  }[]
  if (cursor) {
    const [cursorMsg] = await drizzleDb
      .select()
      .from(directMessage)
      .where(and(eq(directMessage.conversationId, id), eq(directMessage.directMessageId, cursor)))
      .limit(1)
    const cursorTime = cursorMsg?.createdAt
    messages = cursorTime
      ? await drizzleDb
          .select()
          .from(directMessage)
          .where(and(eq(directMessage.conversationId, id), lt(directMessage.createdAt, cursorTime)))
          .orderBy(desc(directMessage.createdAt))
          .limit(limit)
      : await drizzleDb
          .select()
          .from(directMessage)
          .where(eq(directMessage.conversationId, id))
          .orderBy(desc(directMessage.createdAt))
          .limit(limit)
  } else {
    messages = await drizzleDb
      .select()
      .from(directMessage)
      .where(eq(directMessage.conversationId, id))
      .orderBy(desc(directMessage.createdAt))
      .limit(limit)
  }

  await drizzleDb
    .update(directMessage)
    .set({ read: true, readAt: new Date() })
    .where(
      and(
        eq(directMessage.conversationId, id),
        ne(directMessage.senderId, userId),
        eq(directMessage.read, false)
      )
    )

  const senderIds = [...new Set(messages.map(m => m.senderId))]
  const senders = await drizzleDb.select().from(user).where(inArray(user.userId, senderIds))
  const profiles = await drizzleDb.select().from(profile).where(inArray(profile.userId, senderIds))
  const profileByUserId = Object.fromEntries(profiles.map(p => [p.userId, p]))
  const userById = Object.fromEntries(senders.map(u => [u.userId, u]))

  const messagesWithSender = messages.map(m => ({
    ...m,
    id: m.directMessageId, // client reads `message.id` (row exposes `directMessageId`)
    sender: userById[m.senderId]
      ? {
          id: userById[m.senderId].userId,
          profile: profileByUserId[m.senderId]
            ? {
                name: profileByUserId[m.senderId].name,
                avatarUrl: profileByUserId[m.senderId].avatarUrl,
              }
            : null,
        }
      : null,
  }))

  return NextResponse.json({
    messages: messagesWithSender.reverse(),
    nextCursor: messages.length === limit ? messages[messages.length - 1]?.directMessageId : null,
  })
})

// POST - Send message
export const POST = withAuth(async (req: NextRequest, session, context) => {
  const id = await getParamAsync(context?.params, 'id')
  if (!id) {
    return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 })
  }
  const userId = session.user.id

  try {
    const body = await req.json()
    const { content, type = 'text', attachmentUrl } = body

    if (!content && !attachmentUrl) {
      return NextResponse.json({ error: 'Content or attachment is required' }, { status: 400 })
    }

    const [conv] = await drizzleDb
      .select()
      .from(conversation)
      .where(
        and(
          eq(conversation.conversationId, id),
          or(eq(conversation.participant1Id, userId), eq(conversation.participant2Id, userId))
        )
      )
      .limit(1)

    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const [p1, p2] = await Promise.all([
      drizzleDb
        .select({ role: user.role, userId: user.userId })
        .from(user)
        .where(eq(user.userId, conv.participant1Id))
        .limit(1),
      drizzleDb
        .select({ role: user.role, userId: user.userId })
        .from(user)
        .where(eq(user.userId, conv.participant2Id))
        .limit(1),
    ])
    if (
      !p1[0] ||
      !p2[0] ||
      !isConversationAllowedByRoles(p1[0].role as AppRole, p2[0].role as AppRole)
    ) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const messageId = crypto.randomUUID()
    await drizzleDb.insert(directMessage).values({
      directMessageId: messageId,
      conversationId: id,
      senderId: userId,
      content: content ?? '',
      type,
      attachmentUrl: attachmentUrl ?? null,
      read: false,
    })

    await drizzleDb
      .update(conversation)
      .set({ updatedAt: new Date() })
      .where(eq(conversation.conversationId, id))

    const recipientId = conv.participant1Id === userId ? conv.participant2Id : conv.participant1Id
    const recipientRole = conv.participant1Id === userId ? p2[0].role : p1[0].role

    await drizzleDb.insert(notification).values({
      notificationId: crypto.randomUUID(),
      userId: recipientId,
      type: 'message',
      title: 'New Message',
      message: (content?.slice(0, 100) as string) || 'You received a new message',
      actionUrl: getInboxPathByRole(recipientRole as AppRole),
      read: false,
    })

    const [message] = await drizzleDb
      .select()
      .from(directMessage)
      .where(eq(directMessage.directMessageId, messageId))
    const [sender] = await drizzleDb.select().from(user).where(eq(user.userId, userId))
    const [senderProfile] = await drizzleDb.select().from(profile).where(eq(profile.userId, userId))

    if (typeof content === 'string' && content.includes('@[')) {
      await recordMentions({
        text: content,
        messageId,
        mentionerId: userId,
        mentionerName: senderProfile?.name ?? sender?.email ?? 'Someone',
        actionUrl: getInboxPathByRole(recipientRole as AppRole),
      })
    }

    const messageResponse = message
      ? {
          ...message,
          id: message.directMessageId, // client reads `message.id`
          sender: sender
            ? {
                id: sender.userId,
                profile: senderProfile
                  ? { name: senderProfile.name, avatarUrl: senderProfile.avatarUrl }
                  : null,
              }
            : null,
        }
      : null

    return NextResponse.json({ message: messageResponse }, { status: 201 })
  } catch (error) {
    console.error('Send message error:', error)
    return handleApiError(
      error,
      'Failed to send message',
      'api/conversations/[id]/messages/route.ts'
    )
  }
})
