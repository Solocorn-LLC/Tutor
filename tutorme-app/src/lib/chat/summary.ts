/**
 * Chat Summary Service
 * Generates AI summaries of chat sessions for tutors and students
 */

import { asc, eq, and } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { message, profile, user } from '@/lib/db/schema'
import { generateWithFallback } from '@/lib/agents'
import cacheManager from '@/lib/cache-manager'

export type SummaryType = 'session' | 'topic' | 'student'

export interface ChatSummary {
  id: string
  type: SummaryType
  title: string
  overview: string
  keyPoints: string[]
  questions: string[]
  actionItems?: string[]
  sentiment: 'positive' | 'neutral' | 'negative'
  engagementScore: number
  duration: number
  messageCount: number
  participantCount: number
  generatedAt: Date
}

export interface SummaryOptions {
  type: SummaryType
  maxLength?: 'short' | 'medium' | 'detailed'
  includeActionItems?: boolean
  language?: 'zh' | 'en'
  /**
   * Skip the cache and regenerate even if a cached summary exists.
   * Defaults to false (cached summaries are returned when fresh).
   */
  forceRegenerate?: boolean
}

/**
 * Generate summary for a session's chat messages.
 * Returns a cached summary when one exists unless forceRegenerate is set.
 */
export async function generateSessionSummary(
  sessionId: string,
  options: SummaryOptions = { type: 'session', maxLength: 'medium', includeActionItems: true }
): Promise<{ success: boolean; summary?: ChatSummary; error?: string }> {
  try {
    if (!options.forceRegenerate) {
      const cached = await getCachedSummary(sessionId)
      if (cached) {
        return { success: true, summary: cached }
      }
    }

    const messagesRows = await drizzleDb
      .select({
        messageId: message.messageId,
        sessionId: message.sessionId,
        userId: message.userId,
        content: message.content,
        type: message.type,
        timestamp: message.timestamp,
        userName: profile.name,
      })
      .from(message)
      .leftJoin(user, eq(message.userId, user.userId))
      .leftJoin(profile, eq(user.userId, profile.userId))
      .where(eq(message.sessionId, sessionId))
      .orderBy(asc(message.timestamp))
    const messages = messagesRows.map(m => ({
      userId: m.userId,
      content: m.content,
      timestamp: m.timestamp,
      type: m.type,
      user: { profile: { name: m.userName } },
    }))

    if (messages.length === 0) {
      return { success: false, error: '没有找到聊天记录' }
    }

    const formattedChat = messages.map(m => ({
      user: m.user?.profile?.name || m.userId,
      content: m.content,
      time: m.timestamp,
      type: m.type,
    }))

    const prompt = createSummaryPrompt(formattedChat, options)
    const result = await generateWithFallback(prompt, { temperature: 0.5 })
    const parsed = parseSummaryResponse(result.content)

    // Calculate metrics
    const uniqueParticipants = new Set(messages.map(m => m.userId)).size
    const duration =
      messages.length > 1
        ? (messages[messages.length - 1].timestamp.getTime() - messages[0].timestamp.getTime()) /
          1000 /
          60
        : 0

    const summary: ChatSummary = {
      id: `summary_${sessionId}_${Date.now()}`,
      type: options.type,
      title: parsed.title || '聊天总结',
      overview: parsed.overview,
      keyPoints: parsed.keyPoints,
      questions: parsed.questions || [],
      actionItems: parsed.actionItems,
      sentiment: parsed.sentiment,
      engagementScore: calculateEngagementScore(messages),
      duration: Math.round(duration),
      messageCount: messages.length,
      participantCount: uniqueParticipants,
      generatedAt: new Date(),
    }

    // Save summary to cache for future lookups
    await saveSummary(sessionId, summary)

    return { success: true, summary }
  } catch (error) {
    console.error('Failed to generate chat summary:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成总结失败',
    }
  }
}

/**
 * Create summary prompt for AI
 */
function createSummaryPrompt(
  messages: { user: string; content: string; time: Date; type: string }[],
  options: SummaryOptions
): string {
  const lengthMap = {
    short: '100-150字',
    medium: '200-300字',
    detailed: '400-500字',
  }

  const chatText = messages.map(m => `${m.user}: ${m.content}`).join('\n')

  return `请总结以下课堂聊天记录：

${chatText}

要求：
1. 概述：用${lengthMap[options.maxLength || 'medium']}总结主要内容
2. 关键点：列出3-5个重要讨论点
3. 学生提问：提取学生提出的关键问题
${options.includeActionItems ? '4. 行动项：列出需要后续跟进的事项' : ''}
5. 整体氛围：判断是积极/中性/消极

请用以下JSON格式返回：
{
  "title": "总结标题",
  "overview": "概述内容...",
  "keyPoints": ["要点1", "要点2", "要点3"],
  "questions": ["问题1", "问题2"],
  "actionItems": ["行动1", "行动2"],
  "sentiment": "positive"
}`
}

/**
 * Parse AI summary response
 */
function parseSummaryResponse(response: string): {
  title?: string
  overview: string
  keyPoints: string[]
  questions?: string[]
  actionItems?: string[]
  sentiment: 'positive' | 'neutral' | 'negative'
} {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      // Fallback: treat entire response as overview
      return {
        overview: response.substring(0, 500),
        keyPoints: [],
        sentiment: 'neutral',
      }
    }

    const parsed = JSON.parse(jsonMatch[0])

    return {
      title: parsed.title,
      overview: parsed.overview || parsed.summary || '无概述',
      keyPoints: parsed.keyPoints || parsed.mainPoints || [],
      questions: parsed.questions || [],
      actionItems: parsed.actionItems || parsed.actions || [],
      sentiment: ['positive', 'neutral', 'negative'].includes(parsed.sentiment)
        ? parsed.sentiment
        : 'neutral',
    }
  } catch (error) {
    console.error('Failed to parse summary:', error)
    return {
      overview: response.substring(0, 500),
      keyPoints: [],
      sentiment: 'neutral',
    }
  }
}

/**
 * Calculate engagement score based on message patterns
 */
function calculateEngagementScore(
  messages: { userId: string; content: string; timestamp: Date }[]
): number {
  if (messages.length === 0) return 0

  const uniqueParticipants = new Set(messages.map(m => m.userId)).size
  const totalMessages = messages.length

  // Calculate message frequency (messages per minute)
  const duration =
    messages.length > 1
      ? (messages[messages.length - 1].timestamp.getTime() - messages[0].timestamp.getTime()) /
        1000 /
        60
      : 1

  const frequency = duration > 0 ? totalMessages / duration : totalMessages

  // Calculate question ratio (higher is more engaged)
  const questions = messages.filter(m => m.content.includes('?') || m.content.includes('？')).length
  const questionRatio = totalMessages > 0 ? questions / totalMessages : 0

  // Score components:
  // - More participants = better (max 30 points)
  // - Higher frequency = better (max 40 points)
  // - More questions = better engagement (max 30 points)

  const participantScore = Math.min(30, uniqueParticipants * 5)
  const frequencyScore = Math.min(40, frequency * 10)
  const questionScore = Math.min(30, questionRatio * 100)

  return Math.round(participantScore + frequencyScore + questionScore)
}

/**
 * Cache TTL for generated summaries (24 hours)
 */
const SUMMARY_CACHE_TTL_SECONDS = 60 * 60 * 24

function summaryCacheKey(sessionId: string): string {
  return `chat:summary:${sessionId}`
}

/**
 * Save summary to the cache layer for future lookups.
 * Cache failures are logged but never block summary generation.
 */
async function saveSummary(sessionId: string, summary: ChatSummary): Promise<void> {
  try {
    await cacheManager.set(summaryCacheKey(sessionId), summary, {
      ttl: SUMMARY_CACHE_TTL_SECONDS,
      tags: ['chat-summary'],
    })
  } catch (error) {
    console.error('Failed to save summary:', error)
  }
}

/**
 * Get cached summary for a session, or null if absent/expired.
 * Dates are serialized to JSON strings in the cache, so revive them here.
 */
export async function getCachedSummary(sessionId: string): Promise<ChatSummary | null> {
  try {
    const cached = await cacheManager.get<ChatSummary>(summaryCacheKey(sessionId))
    if (!cached) return null
    return {
      ...cached,
      generatedAt: cached.generatedAt ? new Date(cached.generatedAt) : new Date(),
    }
  } catch (error) {
    console.error('Failed to load cached summary:', error)
    return null
  }
}

/**
 * Generate summary for a specific student's participation
 */
export async function generateStudentParticipationSummary(
  sessionId: string,
  studentId: string
): Promise<{ success: boolean; summary?: string; error?: string }> {
  try {
    const messages = await drizzleDb
      .select({ userId: message.userId, content: message.content, timestamp: message.timestamp })
      .from(message)
      .where(and(eq(message.sessionId, sessionId), eq(message.userId, studentId)))
      .orderBy(asc(message.timestamp))

    if (messages.length === 0) {
      return { success: false, error: '学生没有发言记录' }
    }

    const content = messages.map(m => m.content).join('\n')

    const prompt = `请总结以下学生在课堂中的参与情况：

学生发言：
${content}

请分析：
1. 参与度如何
2. 提出了什么有价值的问题或观点
3. 在哪些方面可以改进

用2-3句话简要总结。`

    const result = await generateWithFallback(prompt, { temperature: 0.5 })

    return { success: true, summary: result.content }
  } catch (error) {
    console.error('Failed to generate student summary:', error)
    return { success: false, error: '生成学生总结失败' }
  }
}

/**
 * Generate topic-based summary from messages
 */
export async function generateTopicSummary(
  sessionId: string,
  topic: string
): Promise<{ success: boolean; summary?: string; error?: string }> {
  try {
    const messages = await drizzleDb
      .select({ content: message.content })
      .from(message)
      .where(eq(message.sessionId, sessionId))
      .orderBy(asc(message.timestamp))

    // Filter messages related to the topic (simple keyword match)
    const topicMessages = messages.filter(m =>
      m.content.toLowerCase().includes(topic.toLowerCase())
    )

    if (topicMessages.length === 0) {
      return { success: false, error: `没有找到关于"${topic}"的讨论` }
    }

    const content = topicMessages.map(m => m.content).join('\n')

    const prompt = `请总结关于"${topic}"的讨论内容：

${content}

要求：
1. 主要观点和结论
2. 存在的疑问或争议点
3. 总结在100字以内`

    const result = await generateWithFallback(prompt, { temperature: 0.5 })

    return { success: true, summary: result.content }
  } catch (error) {
    console.error('Failed to generate topic summary:', error)
    return { success: false, error: '生成主题总结失败' }
  }
}
