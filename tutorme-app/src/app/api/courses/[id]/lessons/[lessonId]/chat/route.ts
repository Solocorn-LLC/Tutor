/**
 * Lesson Chat API
 * Handles AI tutor interaction during structured lessons
 */

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import { withAuth, withCsrf, ValidationError, NotFoundError } from '@/lib/api/middleware'
import { advanceLesson, startLesson } from '@/lib/course/lesson-controller'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  courseLesson,
  lessonLearningSession as lessonLearningSessionTable,
  courseProgress,
} from '@/lib/db/schema'
import { generateWithFallback } from '@/lib/agents'

// Type definition for lesson session - matches the database schema
type LessonSessionType = {
  sessionId: string
  studentId: string
  lessonId: string
  currentSection: string
  conceptMastery: Record<string, number> | unknown
  whiteboardItems: unknown[] | unknown
  sessionContext: unknown
  status: string
  completedAt: Date | null
}

// Local implementation of buildCoursePrompt
function buildCoursePrompt(
  _session: LessonSessionType,
  lesson: { title: string; description: string | null },
  message: string
): string {
  return `You are a Socratic tutor helping a student with the lesson "${lesson.title}".

Lesson: ${lesson.title}
Description: ${lesson.description || 'No description'}

Student message: ${message}

Respond as a helpful Socratic tutor, guiding the student to discover the answer themselves rather than providing it directly.`
}

const SECTIONS = ['introduction', 'concept', 'example', 'practice', 'review'] as const
type LessonSection = (typeof SECTIONS)[number]

export const POST = withCsrf(
  withAuth(
    async (req, session, routeContext: any) => {
      const params = await routeContext?.params
      const { id: routeCourseId, lessonId } = await params
      const body = await req.json()
      const { message, sessionId, currentSection } = body

      if (!message) {
        throw new ValidationError('Message is required')
      }

      // Get lesson details
      const [lessonRow] = await drizzleDb
        .select()
        .from(courseLesson)
        .where(eq(courseLesson.lessonId, lessonId))
        .limit(1)

      if (!lessonRow) {
        throw new NotFoundError('Lesson not found')
      }

      // Handle case where lesson may not have a module (new flat structure)
      // Lessons now stored in builderData, module lookup by moduleId removed
      const lesson = {
        ...lessonRow,
        module: { courseId: '', title: '' },
      }

      // Get or create lesson session
      let lessonSessionData: LessonSessionType | null = null

      if (sessionId) {
        const [dbSession] = await drizzleDb
          .select()
          .from(lessonLearningSessionTable)
          .where(eq(lessonLearningSessionTable.sessionId, sessionId))
          .limit(1)
        if (dbSession) {
          lessonSessionData = dbSession as unknown as LessonSessionType
        }
      }

      if (!lessonSessionData) {
        const [dbSession] = await drizzleDb
          .select()
          .from(lessonLearningSessionTable)
          .where(
            and(
              eq(lessonLearningSessionTable.studentId, session.user.id),
              eq(lessonLearningSessionTable.lessonId, lessonId)
            )
          )
          .limit(1)

        if (dbSession) {
          lessonSessionData = dbSession as unknown as LessonSessionType
        } else {
          lessonSessionData = (await startLesson(
            session.user.id,
            lessonId
          )) as unknown as LessonSessionType
        }
      }

      // Get module info if available from lesson
      // moduleId removed from courseLesson; lessons now in builderData
      const courseId = lesson.module?.courseId || ''

      const lessonLearningSession = lessonSessionData

      if (!lessonLearningSession) {
        throw new Error('Failed to create lesson session')
      }

      // Build course prompt
      const prompt = buildCoursePrompt(lessonLearningSession, lesson, message)

      // Get conversation history
      const context = (lessonLearningSession.sessionContext as any) || {}
      const history = context.messages || []

      // Add user message
      history.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      })

      // Generate AI response
      const aiResult = await generateWithFallback(prompt, {
        temperature: 0.7,
        maxTokens: 2000,
        usageContext: {
          studentId: session.user.id,
          courseId: courseId || routeCourseId || null,
          feature: 'lesson-chat',
        },
      })

      const aiResponse = aiResult.content

      // Parse response for metadata
      let parsedResponse = aiResponse
      let whiteboardItems: any[] = []
      let understandingLevel = 0
      let nextSection = lessonLearningSession.currentSection

      // Try to extract JSON metadata from response
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}$/)
        if (jsonMatch) {
          const metadata = JSON.parse(jsonMatch[0])
          whiteboardItems = metadata.whiteboardItems || []
          understandingLevel = metadata.understandingLevel || 0
          nextSection = metadata.nextSection || lessonLearningSession.currentSection
          parsedResponse = aiResponse.replace(jsonMatch[0], '').trim()
        }
      } catch (e) {
        // No metadata found, use raw response
      }

      // Add AI response to history
      history.push({
        role: 'assistant',
        content: parsedResponse,
        timestamp: new Date().toISOString(),
      })

      // Keep only last 50 messages
      if (history.length > 50) {
        history.splice(0, history.length - 50)
      }

      // Update concept mastery based on understanding level
      const conceptMastery = (lessonLearningSession.conceptMastery as Record<string, number>) || {}
      if (understandingLevel > 0) {
        const currentConcept = 'general' // teachingPoints no longer in schema
        conceptMastery[currentConcept] = Math.max(
          conceptMastery[currentConcept] || 0,
          understandingLevel
        )
      }

      // Check if should advance section
      const currentSectionIndex = SECTIONS.indexOf(
        lessonLearningSession.currentSection as LessonSection
      )
      const nextSectionIndex = SECTIONS.indexOf(nextSection as LessonSection)

      const newSessionContext = {
        ...context,
        messages: history,
        lastMessage: message,
        lastResponse: parsedResponse,
      }
      const newWhiteboardItems =
        whiteboardItems.length > 0
          ? [...((lessonLearningSession.whiteboardItems as unknown[]) || []), ...whiteboardItems]
          : (lessonLearningSession.whiteboardItems as unknown[])

      let updatedSession: LessonSessionType
      if (nextSectionIndex > currentSectionIndex || understandingLevel >= 80) {
        const advanceResult = await advanceLesson(lessonLearningSession as any, message)
        const [updated] = await drizzleDb
          .update(lessonLearningSessionTable)
          .set({
            currentSection: advanceResult.newSection,
            conceptMastery: conceptMastery as any,
            sessionContext: newSessionContext as any,
            whiteboardItems: newWhiteboardItems as any,
          })
          .where(eq(lessonLearningSessionTable.sessionId, lessonLearningSession.sessionId))
          .returning()
        updatedSession = (updated ?? lessonLearningSession) as any
      } else {
        const [updated] = await drizzleDb
          .update(lessonLearningSessionTable)
          .set({
            conceptMastery: conceptMastery as any,
            sessionContext: newSessionContext as any,
            whiteboardItems: newWhiteboardItems as any,
          })
          .where(eq(lessonLearningSessionTable.sessionId, lessonLearningSession.sessionId))
          .returning()
        updatedSession = (updated ?? lessonLearningSession) as any
      }

      const isComplete = updatedSession.currentSection === 'review' && understandingLevel >= 80
      if (isComplete) {
        await drizzleDb
          .update(lessonLearningSessionTable)
          .set({ status: 'completed', completedAt: new Date() })
          .where(eq(lessonLearningSessionTable.sessionId, lessonLearningSession.sessionId))

        if (courseId) {
          // Lessons now stored in builderData JSON, can't query count directly
          const totalLessons = 0

          const [existing] = await drizzleDb
            .select()
            .from(courseProgress)
            .where(
              and(
                eq(courseProgress.studentId, session.user.id),
                eq(courseProgress.courseId, courseId)
              )
            )
            .limit(1)

          if (existing) {
            await drizzleDb
              .update(courseProgress)
              .set({
                lessonsCompleted: existing.lessonsCompleted + 1,
                currentLessonId: lessonId,
                averageScore: understandingLevel,
              })
              .where(eq(courseProgress.progressId, existing.progressId))
          } else {
            await drizzleDb.insert(courseProgress).values({
              progressId: crypto.randomUUID(),
              studentId: session.user.id,
              courseId,
              lessonsCompleted: 1,
              totalLessons: totalLessons ?? 0,
              currentLessonId: lessonId,
              averageScore: understandingLevel,
              isCompleted: false,
              startedAt: new Date(),
            })
          }
        }
      }

      return NextResponse.json({
        success: true,
        response: parsedResponse,
        whiteboardItems,
        understandingLevel,
        currentSection: updatedSession.currentSection,
        conceptMastery: updatedSession.conceptMastery,
        isComplete,
        sessionId: lessonLearningSession.sessionId,
      })
    },
    { role: 'STUDENT' }
  )
)

export const GET = withAuth(
  async (req, session, routeContext: any) => {
    const params = await routeContext?.params
    const { lessonId } = await params

    // Get current session
    const [sessionRow] = await drizzleDb
      .select()
      .from(lessonLearningSessionTable)
      .where(
        and(
          eq(lessonLearningSessionTable.studentId, session.user.id),
          eq(lessonLearningSessionTable.lessonId, lessonId)
        )
      )
      .limit(1)

    if (!sessionRow) {
      return NextResponse.json({ session: null })
    }

    const context = (sessionRow.sessionContext as any) || {}

    return NextResponse.json({
      session: {
        id: sessionRow.sessionId,
        currentSection: sessionRow.currentSection,
        conceptMastery: sessionRow.conceptMastery,
        status: sessionRow.status,
        messages: context.messages || [],
      },
    })
  },
  { role: 'STUDENT' }
)
