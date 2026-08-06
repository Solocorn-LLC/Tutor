/**
 * POST /api/tutor/ai-assistant
 *
 * Tutor-only endpoint for the context-aware AI Assistant in the Course Builder
 * Desk panel. It works across builder states:
 *   - classroom: delegates to the existing analytics assistant (live session data)
 *   - edit / test / first-course / new-course / no-course: course-builder assistant
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
import {
  runCourseBuilderAssistant,
  type CourseBuilderContext,
  type CourseBuilderMessage,
} from '@/lib/ai/course-builder-assistant'
import type { CourseBuilderMode } from '@/lib/ai/guardrails'

export const dynamic = 'force-dynamic'

const VALID_MODES: CourseBuilderMode[] = [
  'edit',
  'test',
  'classroom',
  'first-course',
  'new-course',
  'no-course',
]

function isValidMode(value: unknown): value is CourseBuilderMode {
  return typeof value === 'string' && (VALID_MODES as string[]).includes(value)
}

function isValidMessages(value: unknown): value is Array<{ role: string; content: string }> {
  if (!Array.isArray(value)) return false
  return value.every(
    m =>
      m &&
      typeof m === 'object' &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string'
  )
}

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

      const { mode, sessionId, courseId, context, messages } = body as Record<string, unknown>

      if (!isValidMode(mode)) {
        return NextResponse.json({ error: 'mode is required and must be valid' }, { status: 400 })
      }

      if (!isValidMessages(messages)) {
        return NextResponse.json(
          { error: 'messages must be an array of {role, content} objects' },
          { status: 400 }
        )
      }

      try {
        if (mode === 'classroom') {
          if (typeof sessionId !== 'string' || !sessionId.trim()) {
            return NextResponse.json(
              { error: 'sessionId is required for classroom mode' },
              { status: 400 }
            )
          }

          const [sessionRow] = await drizzleDb
            .select({
              sessionId: liveSession.sessionId,
              tutorId: liveSession.tutorId,
              title: liveSession.title,
              status: liveSession.status,
              sessionType: liveSession.sessionType,
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
              sessionType: sessionRow.sessionType ?? undefined,
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
        }

        // Non-classroom modes: course-builder assistant.
        const ctx = context as CourseBuilderContext | undefined
        if (!ctx || typeof ctx !== 'object') {
          return NextResponse.json(
            { error: 'context is required for non-classroom modes' },
            { status: 400 }
          )
        }

        const result = await runCourseBuilderAssistant(
          {
            ...ctx,
            mode,
            courseId: typeof courseId === 'string' ? courseId : ctx.courseId,
          },
          messages as CourseBuilderMessage[]
        )

        return NextResponse.json({
          reply: result.reply,
          guardrailWarnings: result.guardrailWarnings,
        })
      } catch (err: unknown) {
        return handleApiError(
          err,
          'Could not generate AI assistant response right now.',
          'course-builder-assistant'
        )
      }
    },
    { role: 'TUTOR' }
  )
)
