/**
 * POST /api/chat/summary
 * Generate a summary for a chat session
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { getServerSession, authOptions } from '@/lib/auth'
import { and, eq } from 'drizzle-orm'
import { generateSessionSummary, SummaryOptions } from '@/lib/chat/summary'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, sessionParticipant } from '@/lib/db/schema'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions, request)
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await request.json()
    const {
      sessionId,
      type = 'session',
      maxLength = 'medium',
      includeActionItems = true,
    }: {
      sessionId: string
      type?: 'session' | 'topic' | 'student'
      maxLength?: 'short' | 'medium' | 'detailed'
      includeActionItems?: boolean
    } = body

    if (!sessionId) {
      return NextResponse.json({ error: '缺少sessionId参数' }, { status: 400 })
    }

    // Verify user has access to this session (tutor or participant)
    const [sessionRow] = await drizzleDb
      .select()
      .from(liveSession)
      .where(eq(liveSession.sessionId, sessionId))
      .limit(1)

    const isTutor = sessionRow?.tutorId === session.user.id
    let isParticipant = false
    if (sessionRow) {
      const [participantRow] = await drizzleDb
        .select()
        .from(sessionParticipant)
        .where(
          and(
            eq(sessionParticipant.sessionId, sessionId),
            eq(sessionParticipant.studentId, session.user.id)
          )
        )
        .limit(1)
      isParticipant = participantRow != null
    }
    const hasAccess = sessionRow && (isTutor || isParticipant)

    if (!hasAccess && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '无权访问该会话' }, { status: 403 })
    }

    const options: SummaryOptions = {
      type,
      maxLength,
      includeActionItems,
      language: 'zh',
    }

    const result = await generateSessionSummary(sessionId, options)

    if (!result.success) {
      return handleApiError(
        new Error(result.error || '生成总结失败'),
        result.error || '生成总结失败',
        'api/chat/summary/route.ts'
      )
    }

    return NextResponse.json({
      success: true,
      data: result.summary,
    })
  } catch (error) {
    console.error('Failed to generate chat summary:', error)
    return handleApiError(error, '生成聊天总结失败', 'api/chat/summary/route.ts')
  }
}
