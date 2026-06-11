/**
 * DELETE /api/tutor/classes/:id
 * GET /api/tutor/classes/:id - Class details with participants/messages
 * POST /api/tutor/classes/:id - Start class
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, handleApiError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  liveSession,
  sessionParticipant,
  message,
  user,
  profile,
  course,
  sessionReplayArtifact,
} from '@/lib/db/schema'
import { eq, and, asc, desc, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { generateSessionSummary } from '@/lib/chat/summary'
import { dailyProvider } from '@/lib/video/daily-provider'
import { getIO } from '@/lib/socket-server-enhanced'

function buildTranscript(
  messages: Array<{
    timestamp: Date | null
    content: string
    userName: string | null
    userEmail: string | null
  }>
): string {
  return messages
    .map(m => {
      const speaker = m.userName?.trim() || m.userEmail?.split('@')[0] || 'Speaker'
      const at = m.timestamp?.toISOString() ?? new Date().toISOString()
      return `[${at}] ${speaker}: ${m.content}`
    })
    .join('\n')
}

function normalizeCourseText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(live|class|session|clinic)\b/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const GET = withAuth(
  async (req: NextRequest, session, context) => {
    const tutorId = session.user.id
    const classId = await getParamAsync(context?.params, 'id')
    if (!classId) return NextResponse.json({ error: 'Class ID required' }, { status: 400 })

    const sessionRows = await drizzleDb
      .select()
      .from(liveSession)
      .where(and(eq(liveSession.sessionId, classId), eq(liveSession.tutorId, tutorId)))
      .limit(1)

    const liveSessionRow = sessionRows[0]
    if (!liveSessionRow) {
      return NextResponse.json(
        { error: 'Class not found or you do not have permission to view it' },
        { status: 404 }
      )
    }

    const participants = await drizzleDb
      .select({
        participant: sessionParticipant,
        studentId: sessionParticipant.studentId,
        name: profile.name,
        email: user.email,
      })
      .from(sessionParticipant)
      .innerJoin(user, eq(sessionParticipant.studentId, user.userId))
      .leftJoin(profile, eq(profile.userId, user.userId))
      .where(
        and(
          eq(sessionParticipant.sessionId, classId),
          // Exclude the tutor from the participant list
          sql`${sessionParticipant.studentId} != ${liveSessionRow.tutorId}`
        )
      )

    const messages = await drizzleDb
      .select({
        msg: message,
        userId: message.userId,
        content: message.content,
        timestamp: message.timestamp,
        userName: profile.name,
        userEmail: user.email,
      })
      .from(message)
      .innerJoin(user, eq(message.userId, user.userId))
      .leftJoin(profile, eq(profile.userId, user.userId))
      .where(eq(message.sessionId, classId))
      .orderBy(asc(message.timestamp))
      .limit(200)

    const messagesByUser = new Map<string, number>()
    for (const m of messages) {
      messagesByUser.set(m.userId, (messagesByUser.get(m.userId) || 0) + 1)
    }

    const students = participants.map(p => {
      const chatCount = messagesByUser.get(p.studentId) || 0
      const engagementScore = Math.max(20, Math.min(100, 40 + chatCount * 12))
      const attentionLevel =
        engagementScore >= 80 ? 'high' : engagementScore >= 55 ? 'medium' : 'low'
      const lastMessage = [...messages].reverse().find(m => m.userId === p.studentId)
      const displayName = p.name || p.email || 'Student'
      return {
        id: p.studentId,
        name: displayName,
        status: p.participant.leftAt ? 'offline' : 'online',
        engagementScore,
        handRaised: false,
        attentionLevel,
        lastActive:
          (lastMessage?.timestamp || p.participant.joinedAt)?.toISOString?.() ??
          new Date().toISOString(),
        joinedAt: p.participant.joinedAt?.toISOString?.() ?? new Date().toISOString(),
        reactions: 0,
        chatMessages: chatCount,
      }
    })

    const activeStudents = students.filter(s => s.status === 'online')
    const averageEngagement =
      activeStudents.length > 0
        ? Math.round(
            activeStudents.reduce((sum, s) => sum + s.engagementScore, 0) / activeStudents.length
          )
        : 0

    const classStart = liveSessionRow.startedAt || liveSessionRow.scheduledAt || new Date()
    const classDuration = Math.max(
      0,
      Math.floor((Date.now() - new Date(classStart).getTime()) / 60000)
    )

    const tutorCourses = await drizzleDb
      .select({ id: course.courseId, name: course.name, updatedAt: course.updatedAt })
      .from(course)
      .where(
        and(
          eq(course.creatorId, tutorId),
          sql`${course.categories} @> ARRAY[${liveSessionRow.category}]`
        )
      )
      .orderBy(desc(course.updatedAt))
      .limit(50)

    const normalizedSessionTitle = normalizeCourseText(liveSessionRow.title || '')
    const exactNameMatch = tutorCourses.find(
      course => normalizeCourseText(course.name) === normalizedSessionTitle
    )
    const containsMatch = tutorCourses.find(course => {
      const normalizedCourseName = normalizeCourseText(course.name)
      return (
        normalizedCourseName.length > 0 &&
        (normalizedSessionTitle.includes(normalizedCourseName) ||
          normalizedCourseName.includes(normalizedSessionTitle))
      )
    })
    const subjectSingleton = tutorCourses.length === 1 ? tutorCourses[0] : null
    const linkedCourse = exactNameMatch || containsMatch || subjectSingleton || null
    const deterministicLinkedCourseId = liveSessionRow.courseId || linkedCourse?.id || null

    const sessionDuration = liveSessionRow.durationMinutes ?? 240
    const token = liveSessionRow.roomId
      ? await dailyProvider.createMeetingToken(liveSessionRow.roomId, tutorId, {
          isOwner: true,
          durationMinutes: sessionDuration,
        })
      : null

    return NextResponse.json({
      session: {
        id: liveSessionRow.sessionId,
        title: liveSessionRow.title,
        subject: liveSessionRow.category,
        status: liveSessionRow.status,
        roomId: liveSessionRow.roomId,
        roomUrl: liveSessionRow.roomUrl,
        token,
        scheduledAt: liveSessionRow.scheduledAt?.toISOString?.() ?? null,
        startedAt: liveSessionRow.startedAt?.toISOString?.() ?? null,
        maxStudents: liveSessionRow.maxStudents,
        linkedCourseId: deterministicLinkedCourseId,
        category: liveSessionRow.category,
      },
      students,
      messages: messages.map(m => ({
        id: m.msg.messageId,
        studentId: m.userId,
        studentName: m.userName || m.userEmail || 'User',
        content: m.content,
        timestamp: m.timestamp?.toISOString?.() ?? new Date().toISOString(),
        sentiment: 'neutral',
        isQuestion: m.content?.includes('?'),
        isPinned: false,
      })),
      metrics: {
        totalStudents: students.length,
        activeStudents: activeStudents.length,
        averageEngagement,
        participationRate:
          students.length > 0 ? Math.round((activeStudents.length / students.length) * 100) : 0,
        totalChatMessages: messages.length,
        classDuration,
        classStartTime: classStart?.toISOString?.() ?? new Date().toISOString(),
        veryEngaged: students.filter(s => s.engagementScore >= 85).length,
        engaged: students.filter(s => s.engagementScore >= 60 && s.engagementScore < 85).length,
        passive: students.filter(s => s.engagementScore >= 30 && s.engagementScore < 60).length,
        disengaged: students.filter(s => s.engagementScore < 30).length,
        engagementTrend: 'stable',
      },
      alerts: [],
    })
  },
  { role: 'TUTOR' }
)

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const tutorId = session.user.id
      const classId = await getParamAsync(context?.params, 'id')
      if (!classId) return NextResponse.json({ error: 'Class ID required' }, { status: 400 })

      const sessionRows = await drizzleDb
        .select()
        .from(liveSession)
        .where(and(eq(liveSession.sessionId, classId), eq(liveSession.tutorId, tutorId)))
        .limit(1)

      const liveSessionRow = sessionRows[0]
      if (!liveSessionRow) {
        return NextResponse.json(
          { error: 'Class not found or you do not have permission to start it' },
          { status: 404 }
        )
      }

      if (liveSessionRow.status === 'ended') {
        return NextResponse.json({ error: 'Cannot start a completed class' }, { status: 400 })
      }

      // Enforce scheduled time: cannot start before scheduledAt
      if (
        liveSessionRow.scheduledAt &&
        new Date(liveSessionRow.scheduledAt).getTime() > Date.now()
      ) {
        return NextResponse.json(
          { error: 'Cannot start before the scheduled time' },
          { status: 403 }
        )
      }

      const [updated] = await drizzleDb
        .update(liveSession)
        .set({
          status: 'active',
          startedAt: liveSessionRow.startedAt || new Date(),
        })
        .where(eq(liveSession.sessionId, classId))
        .returning()

      return NextResponse.json({
        session: {
          id: updated!.sessionId,
          status: updated!.status,
          startedAt: updated!.startedAt?.toISOString?.() ?? null,
          roomId: updated!.roomId,
          roomUrl: updated!.roomUrl,
        },
      })
    },
    { role: 'TUTOR' }
  )
)

export const PATCH = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const tutorId = session.user.id
      const classId = await getParamAsync(context?.params, 'id')
      if (!classId) return NextResponse.json({ error: 'Class ID required' }, { status: 400 })

      const sessionRows = await drizzleDb
        .select()
        .from(liveSession)
        .where(and(eq(liveSession.sessionId, classId), eq(liveSession.tutorId, tutorId)))
        .limit(1)

      const liveSessionRow = sessionRows[0]
      if (!liveSessionRow) {
        return NextResponse.json(
          { error: 'Class not found or you do not have permission to end it' },
          { status: 404 }
        )
      }

      if (liveSessionRow.status === 'ended') {
        return NextResponse.json({ success: true, status: 'ended', alreadyEnded: true })
      }

      const endedAt = new Date()
      await drizzleDb
        .update(liveSession)
        .set({
          status: 'ended',
          endedAt,
          recordingAvailableAt: liveSessionRow.recordingUrl ? endedAt : null,
        })
        .where(eq(liveSession.sessionId, classId))

      getIO()
        ?.to(classId)
        .emit('session:ended', { sessionId: classId, reason: 'tutor-ended' })

      const [partCount, messagesCountResult] = await Promise.all([
        drizzleDb
          .select({ count: sql<number>`count(*)::int` })
          .from(sessionParticipant)
          .where(eq(sessionParticipant.sessionId, classId)),
        drizzleDb
          .select({ count: sql<number>`count(*)::int` })
          .from(message)
          .where(eq(message.sessionId, classId)),
      ])

      const _count = {
        participants: partCount[0]?.count ?? 0,
        messages: messagesCountResult[0]?.count ?? 0,
      }

      const existingArtifact = await drizzleDb
        .select()
        .from(sessionReplayArtifact)
        .where(eq(sessionReplayArtifact.sessionId, classId))
        .limit(1)

      if (existingArtifact[0]) {
        await drizzleDb
          .update(sessionReplayArtifact)
          .set({
            recordingUrl: liveSessionRow.recordingUrl,
            status: 'processing',
            endedAt,
          })
          .where(eq(sessionReplayArtifact.sessionId, classId))
      } else {
        await drizzleDb.insert(sessionReplayArtifact).values({
          artifactId: randomUUID(),
          sessionId: classId,
          tutorId,
          recordingUrl: liveSessionRow.recordingUrl,
          status: 'processing',
          startedAt: liveSessionRow.startedAt ?? endedAt,
          endedAt,
        })
      }

      try {
        const messageRows = await drizzleDb
          .select({
            timestamp: message.timestamp,
            content: message.content,
            userName: profile.name,
            userEmail: user.email,
          })
          .from(message)
          .innerJoin(user, eq(message.userId, user.userId))
          .leftJoin(profile, eq(profile.userId, user.userId))
          .where(eq(message.sessionId, classId))
          .orderBy(asc(message.timestamp))

        const transcript =
          messageRows.length > 0
            ? buildTranscript(messageRows)
            : liveSessionRow.recordingUrl
              ? 'Transcript unavailable from chat history. Recording exists and is pending audio transcription ingestion.'
              : 'No transcript available for this session.'

        const summaryResult = await generateSessionSummary(classId, {
          type: 'session',
          maxLength: 'detailed',
          includeActionItems: true,
          language: 'en',
        })

        const summaryText =
          summaryResult.success && summaryResult.summary
            ? summaryResult.summary.overview
            : 'Summary generation is unavailable for this session.'

        const summaryPayload = {
          ...(summaryResult.success && summaryResult.summary ? summaryResult.summary : {}),
          sessionMeta: {
            title: liveSessionRow.title,
            subject: liveSessionRow.category,
            participants: _count.participants,
            messages: _count.messages,
            generatedAt: new Date().toISOString(),
          },
          transcriptMeta: {
            source: messageRows.length > 0 ? 'chat_messages' : 'recording_placeholder',
            hasTranscriptText: Boolean(transcript?.trim()),
          },
        }

        await drizzleDb
          .update(sessionReplayArtifact)
          .set({
            transcript,
            summary: summaryText,
            summaryJson: summaryPayload,
            recordingUrl: liveSessionRow.recordingUrl,
            status: summaryResult.success ? 'ready' : 'failed',
            generatedAt: new Date(),
          })
          .where(eq(sessionReplayArtifact.sessionId, classId))
      } catch (error) {
        await drizzleDb
          .update(sessionReplayArtifact)
          .set({
            status: 'failed',
            generatedAt: new Date(),
          })
          .where(eq(sessionReplayArtifact.sessionId, classId))
        console.error('Failed to generate replay artifact:', error)
      }

      return NextResponse.json({ success: true, status: 'COMPLETED' })
    },
    { role: 'TUTOR' }
  )
)

export const DELETE = withAuth(
  async (req: NextRequest, session, context) => {
    const tutorId = session.user.id
    const classId = await getParamAsync(context?.params, 'id')
    if (!classId) return NextResponse.json({ error: 'Class ID required' }, { status: 400 })

    try {
      const sessionRows = await drizzleDb
        .select()
        .from(liveSession)
        .where(and(eq(liveSession.sessionId, classId), eq(liveSession.tutorId, tutorId)))
        .limit(1)

      const liveSessionRow = sessionRows[0]
      if (!liveSessionRow) {
        return NextResponse.json(
          { error: 'Class not found or you do not have permission to delete it' },
          { status: 404 }
        )
      }

      if (liveSessionRow.status === 'active') {
        return NextResponse.json(
          { error: 'Cannot delete an active class. Please end the class first.' },
          { status: 400 }
        )
      }

      if (liveSessionRow.status === 'ended') {
        return NextResponse.json({ error: 'Cannot delete a completed class' }, { status: 400 })
      }

      await drizzleDb.delete(liveSession).where(eq(liveSession.sessionId, classId))

      return NextResponse.json({ message: 'Class deleted successfully' })
    } catch (error) {
      console.error('Error deleting class:', error)
      return handleApiError(error, 'Failed to delete class', 'api/tutor/classes/[id]/route.ts')
    }
  },
  { role: 'TUTOR' }
)
