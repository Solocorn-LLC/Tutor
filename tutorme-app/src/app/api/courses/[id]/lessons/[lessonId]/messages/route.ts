/**
 * Lesson Messages API
 * GET: Get message history for a lesson session
 * POST: Save a message to the session history
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { withAuth, withCsrf, NotFoundError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { lessonLearningSession } from '@/lib/db/schema'
import { sanitizeHtmlWithMax } from '@/lib/security/sanitize'

export const GET = withAuth(
  async (req, session, routeContext: any) => {
    const params = await routeContext?.params
    const { lessonId } = await params

    const [sessionRow] = await drizzleDb
      .select()
      .from(lessonLearningSession)
      .where(
        and(eq(lessonLearningSession.studentId, session.user.id), eq(lessonLearningSession.lessonId, lessonId))
      )
      .limit(1)

    if (!sessionRow) {
      return NextResponse.json({ messages: [] })
    }

    const messages = (sessionRow.sessionContext as any)?.messages || []
    return NextResponse.json({ messages })
  },
  { role: 'STUDENT' }
)

export const POST = withCsrf(
  withAuth(
    async (req, session, routeContext: any) => {
      const params = await routeContext?.params
      const { lessonId } = await params
      const body = await req.json()
      const { role, content, section, whiteboardItems } = body
      const safeContent = typeof content === 'string' ? sanitizeHtmlWithMax(content, 10000) : ''

      const [sessionRow] = await drizzleDb
        .select()
        .from(lessonLearningSession)
        .where(
          and(eq(lessonLearningSession.studentId, session.user.id), eq(lessonLearningSession.lessonId, lessonId))
        )
        .limit(1)

      if (!sessionRow) {
        throw new NotFoundError('Session not found')
      }

      const context = (sessionRow.sessionContext as any) || {}
      const messages = context.messages || []

      messages.push({
        id: Date.now().toString(),
        role,
        content: safeContent,
        section,
        whiteboardItems,
        timestamp: new Date().toISOString(),
      })

      if (messages.length > 50) {
        messages.splice(0, messages.length - 50)
      }

      context.messages = messages

      await drizzleDb
        .update(lessonLearningSession)
        .set({ sessionContext: context as any })
        .where(eq(lessonLearningSession.sessionId, sessionRow.sessionId))

      return NextResponse.json({ success: true })
    },
    { role: 'STUDENT' }
  )
)
