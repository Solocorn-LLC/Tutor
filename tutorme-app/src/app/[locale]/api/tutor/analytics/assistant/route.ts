/**
 * POST /api/tutor/analytics/assistant
 *
 * Tutor-only endpoint for the live-session Desk Analytics assistant.
 * Fetches real session context from the database, runs the analytics-specific
 * guardrail prompt, and returns the LLM reply.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { and, eq, inArray, asc } from 'drizzle-orm'
import { withAuth, withCsrf, handleApiError, withRateLimitPreset } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  course,
  deployedMaterial,
  liveSession,
  profile,
  sessionParticipant,
  taskSubmission,
} from '@/lib/db/schema'
import { runAnalyticsAssistant, type AnalyticsMessage } from '@/lib/ai/analytics-assistant'

export const dynamic = 'force-dynamic'

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session: Session) => {
      const { response: rateLimited } = await withRateLimitPreset(req, 'aiGenerate')
      if (rateLimited) return rateLimited

      let body: unknown
      try {
        body = await req.json()
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
      }

      if (!body || typeof body !== 'object') {
        return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 })
      }

      const { sessionId, messages } = body as Record<string, unknown>

      if (typeof sessionId !== 'string' || !sessionId.trim()) {
        return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
      }

      if (!Array.isArray(messages)) {
        return NextResponse.json({ error: 'messages must be an array' }, { status: 400 })
      }

      const validMessages = messages.every(
        m =>
          m &&
          typeof m === 'object' &&
          (m as AnalyticsMessage).role !== undefined &&
          (m as AnalyticsMessage).content !== undefined &&
          typeof (m as AnalyticsMessage).role === 'string' &&
          typeof (m as AnalyticsMessage).content === 'string'
      )
      if (!validMessages) {
        return NextResponse.json(
          { error: 'messages must contain objects with role and content strings' },
          { status: 400 }
        )
      }

      try {
        const [sessionRow] = await drizzleDb
          .select({
            sessionId: liveSession.sessionId,
            tutorId: liveSession.tutorId,
            title: liveSession.title,
            status: liveSession.status,
            scheduledAt: liveSession.scheduledAt,
            courseName: course.name,
          })
          .from(liveSession)
          .leftJoin(course, eq(liveSession.courseId, course.courseId))
          .where(eq(liveSession.sessionId, sessionId))
          .limit(1)

        if (!sessionRow) {
          return NextResponse.json({ error: 'Session not found' }, { status: 404 })
        }

        if (sessionRow.tutorId !== session.user.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const participants = await drizzleDb
          .select({
            studentId: sessionParticipant.studentId,
            name: profile.name,
          })
          .from(sessionParticipant)
          .leftJoin(profile, eq(sessionParticipant.studentId, profile.userId))
          .where(eq(sessionParticipant.sessionId, sessionId))

        const deployed = await drizzleDb
          .select({
            itemId: deployedMaterial.itemId,
            title: deployedMaterial.title,
          })
          .from(deployedMaterial)
          .where(eq(deployedMaterial.sessionId, sessionId))
          .orderBy(asc(deployedMaterial.deployedAt))

        const itemIds = [...new Set(deployed.map(d => d.itemId).filter(Boolean))] as string[]
        const studentIds = [
          ...new Set(participants.map(p => p.studentId).filter(Boolean)),
        ] as string[]

        const submissions =
          itemIds.length === 0 || studentIds.length === 0
            ? []
            : await drizzleDb
                .select({
                  taskId: taskSubmission.taskId,
                  studentId: taskSubmission.studentId,
                  submittedAt: taskSubmission.submittedAt,
                })
                .from(taskSubmission)
                .where(
                  and(
                    inArray(taskSubmission.taskId, itemIds),
                    inArray(taskSubmission.studentId, studentIds)
                  )
                )

        const result = await runAnalyticsAssistant(
          {
            sessionId,
            courseName: sessionRow.courseName ?? undefined,
            sessions: [
              {
                id: sessionRow.sessionId,
                title: sessionRow.title,
                scheduledAt: sessionRow.scheduledAt?.toISOString() ?? new Date().toISOString(),
                status: sessionRow.status,
              },
            ],
            students: participants.map(p => ({ id: p.studentId, name: p.name || 'Student' })),
            liveSubmissions: submissions.map(s => ({
              taskId: s.taskId,
              studentId: s.studentId,
              submittedAt: s.submittedAt?.toISOString(),
            })),
          },
          messages as AnalyticsMessage[]
        )

        return NextResponse.json({
          reply: result.reply,
          guardrailWarnings: result.guardrailWarnings,
        })
      } catch (err: unknown) {
        return handleApiError(
          err,
          'Could not generate analytics response right now.',
          'analytics-assistant'
        )
      }
    },
    { role: 'TUTOR' }
  )
)
