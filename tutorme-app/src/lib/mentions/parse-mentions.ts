import { drizzleDb } from '@/lib/db/drizzle'
import { mention } from '@/lib/db/schema'
import { sendMentionNotification } from '@/lib/mentions/send-mention-notification'

export interface ParsedMention {
  userId: string
  displayName: string
  start: number
  end: number
}

const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g

export function parseMentions(text: string): ParsedMention[] {
  const mentions: ParsedMention[] = []
  if (!text) return mentions

  let match: RegExpExecArray | null
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    const [, displayName, userId] = match
    if (!userId) continue
    mentions.push({
      userId,
      displayName,
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return mentions
}

export async function recordMentions(params: {
  text: string
  messageId: string
  source: 'classroom' | 'direct'
  mentionerId: string
  mentionerName?: string
  actionUrl?: string
}): Promise<string[]> {
  const { text, messageId, source, mentionerId, mentionerName, actionUrl } = params
  const parsed = parseMentions(text)
  if (parsed.length === 0) return []

  const uniqueIds = Array.from(new Set(parsed.map(m => m.userId))).filter(id => id !== mentionerId)
  if (uniqueIds.length === 0) return []

  await drizzleDb.insert(mention).values(
    uniqueIds.map(mentioneeId => ({
      messageId,
      source,
      mentionerId,
      mentioneeId,
    }))
  )

  await Promise.all(
    uniqueIds.map(mentioneeId =>
      sendMentionNotification({
        mentioneeId,
        mentionerId,
        mentionerName,
        messageId,
        actionUrl,
      })
    )
  )

  return uniqueIds
}
