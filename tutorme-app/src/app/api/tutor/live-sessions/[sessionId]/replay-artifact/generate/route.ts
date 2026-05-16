import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { getServerSession, authOptions } from '@/lib/auth'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  liveSession,
  sessionReplayArtifact,
  sessionParticipant,
  message,
  user,
  profile,
  taskDeployment,
  taskPoll,
  taskQuestion,
  builderTask,
  builderTaskExtension,
  builderTaskDmi,
  builderTaskDmiVersion,
  taskSubmission,
} from '@/lib/db/schema'
import { eq, and, asc, sql, inArray } from 'drizzle-orm'
import { generateSessionSummary } from '@/lib/chat/summary'
import { randomUUID } from 'crypto'

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

export async function POST(req: NextRequest, { params }: { params: any }) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const liveSessionId = await getParamAsync(params, 'sessionId')

  if (!liveSessionId || liveSessionId === 'undefined' || liveSessionId === 'null') {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
  }

  const sessionRows = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      tutorId: liveSession.tutorId,
      title: liveSession.title,
      category: liveSession.category,
      recordingUrl: liveSession.recordingUrl,
      startedAt: liveSession.startedAt,
      endedAt: liveSession.endedAt,
    })
    .from(liveSession)
    .where(and(eq(liveSession.sessionId, liveSessionId), eq(liveSession.tutorId, session.user.id)))
    .limit(1)

  const liveSessionRow = sessionRows[0]
  if (!liveSessionRow) {
    return NextResponse.json({ error: 'Live session not found' }, { status: 404 })
  }

  const [partCount, messagesCountResult] = await Promise.all([
    drizzleDb
      .select({ count: sql<number>`count(*)::int` })
      .from(sessionParticipant)
      .where(eq(sessionParticipant.sessionId, liveSessionId)),
    drizzleDb
      .select({ count: sql<number>`count(*)::int` })
      .from(message)
      .where(eq(message.sessionId, liveSessionId)),
  ])

  const _count = {
    participants: partCount[0]?.count ?? 0,
    messages: messagesCountResult[0]?.count ?? 0,
  }

  const existingArtifact = await drizzleDb
    .select()
    .from(sessionReplayArtifact)
    .where(eq(sessionReplayArtifact.sessionId, liveSessionId))
    .limit(1)

  if (existingArtifact[0]) {
    await drizzleDb
      .update(sessionReplayArtifact)
      .set({
        recordingUrl: liveSessionRow.recordingUrl,
        status: 'processing',
        endedAt: liveSessionRow.endedAt,
      })
      .where(eq(sessionReplayArtifact.sessionId, liveSessionId))
  } else {
    await drizzleDb.insert(sessionReplayArtifact).values({
      artifactId: randomUUID(),
      sessionId: liveSessionId,
      tutorId: session.user.id,
      recordingUrl: liveSessionRow.recordingUrl,
      status: 'processing',
      startedAt: liveSessionRow.startedAt,
      endedAt: liveSessionRow.endedAt,
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
      .where(eq(message.sessionId, liveSessionId))
      .orderBy(asc(message.timestamp))

    const transcript =
      messageRows.length > 0
        ? buildTranscript(messageRows)
        : liveSessionRow.recordingUrl
          ? 'Transcript unavailable from chat history. Recording exists and is pending audio transcription ingestion.'
          : 'No transcript available for this session.'

    const deployments = await drizzleDb
      .select({
        deploymentId: taskDeployment.deploymentId,
        taskId: taskDeployment.taskId,
        deployedAt: taskDeployment.deployedAt,
        status: taskDeployment.status,
        title: builderTask.title,
        type: builderTask.type,
        lessonId: builderTask.lessonId,
        courseId: builderTask.courseId,
      })
      .from(taskDeployment)
      .innerJoin(builderTask, eq(taskDeployment.taskId, builderTask.taskId))
      .where(eq(taskDeployment.sessionId, liveSessionId))

    const deployedTaskIds = deployments.map(d => d.taskId)

    const [extensions, dmiItems, dmiVersions, polls, questions, submissions] = await Promise.all([
      deployedTaskIds.length
        ? drizzleDb
            .select({
              extensionId: builderTaskExtension.extensionId,
              taskId: builderTaskExtension.taskId,
              name: builderTaskExtension.name,
              content: builderTaskExtension.content,
              pci: builderTaskExtension.pci,
              order: builderTaskExtension.order,
            })
            .from(builderTaskExtension)
            .where(inArray(builderTaskExtension.taskId, deployedTaskIds))
        : Promise.resolve([]),
      deployedTaskIds.length
        ? drizzleDb
            .select({
              dmiId: builderTaskDmi.dmiId,
              taskId: builderTaskDmi.taskId,
              type: builderTaskDmi.type,
              items: builderTaskDmi.items,
              updatedAt: builderTaskDmi.updatedAt,
            })
            .from(builderTaskDmi)
            .where(inArray(builderTaskDmi.taskId, deployedTaskIds))
        : Promise.resolve([]),
      deployedTaskIds.length
        ? drizzleDb
            .select({
              versionId: builderTaskDmiVersion.versionId,
              taskId: builderTaskDmiVersion.taskId,
              type: builderTaskDmiVersion.type,
              versionNumber: builderTaskDmiVersion.versionNumber,
              items: builderTaskDmiVersion.items,
              createdAt: builderTaskDmiVersion.createdAt,
            })
            .from(builderTaskDmiVersion)
            .where(inArray(builderTaskDmiVersion.taskId, deployedTaskIds))
        : Promise.resolve([]),
      drizzleDb
        .select({
          pollId: taskPoll.pollId,
          taskId: taskPoll.taskId,
          question: taskPoll.question,
          options: taskPoll.options,
          responses: taskPoll.responses,
          isActive: taskPoll.isActive,
          sentAt: taskPoll.sentAt,
          closedAt: taskPoll.closedAt,
        })
        .from(taskPoll)
        .where(eq(taskPoll.sessionId, liveSessionId)),
      drizzleDb
        .select({
          questionId: taskQuestion.questionId,
          taskId: taskQuestion.taskId,
          question: taskQuestion.question,
          answers: taskQuestion.answers,
          sentAt: taskQuestion.sentAt,
        })
        .from(taskQuestion)
        .where(eq(taskQuestion.sessionId, liveSessionId)),
      deployedTaskIds.length
        ? drizzleDb
            .select({
              submissionId: taskSubmission.submissionId,
              taskId: taskSubmission.taskId,
              studentId: taskSubmission.studentId,
              answers: taskSubmission.answers,
              timeSpent: taskSubmission.timeSpent,
              attempts: taskSubmission.attempts,
              questionResults: taskSubmission.questionResults,
              score: taskSubmission.score,
              maxScore: taskSubmission.maxScore,
              status: taskSubmission.status,
              submittedAt: taskSubmission.submittedAt,
              gradedAt: taskSubmission.gradedAt,
            })
            .from(taskSubmission)
            .where(inArray(taskSubmission.taskId, deployedTaskIds))
        : Promise.resolve([]),
    ])

    const latestDmiByTask = dmiVersions.reduce(
      (acc, version) => {
        const current = acc[version.taskId]
        if (!current || version.versionNumber > current.versionNumber) {
          acc[version.taskId] = version
        }
        return acc
      },
      {} as Record<string, (typeof dmiVersions)[number]>
    )

    const summaryResult = await generateSessionSummary(liveSessionId, {
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
      sessionContent: {
        deployments,
        extensions,
        dmiItems,
        latestDmiVersions: Object.values(latestDmiByTask),
        polls,
        questions,
        submissions,
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
      .where(eq(sessionReplayArtifact.sessionId, liveSessionId))

    return NextResponse.json({ success: true, transcriptLength: transcript.length })
  } catch (error) {
    await drizzleDb
      .update(sessionReplayArtifact)
      .set({
        status: 'failed',
        generatedAt: new Date(),
      })
      .where(eq(sessionReplayArtifact.sessionId, liveSessionId))

    console.error('Failed to generate replay artifact:', error)
    return handleApiError(
      error,
      'Failed to generate replay artifact',
      'api/tutor/live-sessions/[sessionId]/replay-artifact/generate/route.ts'
    )
  }
}
