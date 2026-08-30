import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, deployedMaterial, liveSession } from '@/lib/db/schema'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import {
  fetchTaskSourceFromBuilder,
  recoverSnapshot,
  isCorruptedSnapshot,
} from '@/lib/classroom/task-recovery'
import type { LiveTask } from '@/lib/socket'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req, session, context) => {
  const tutorId = session.user.id
  const sessionId = await getParamAsync(context.params, 'sessionId')

  if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
  }

  const [sessionRow] = await drizzleDb
    .select({
      id: liveSession.sessionId,
      tutorId: liveSession.tutorId,
      courseId: liveSession.courseId,
      title: liveSession.title,
      status: liveSession.status,
    })
    .from(liveSession)
    .where(eq(liveSession.sessionId, sessionId))
    .limit(1)

  if (!sessionRow) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (sessionRow.tutorId !== tutorId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const rows = await drizzleDb
    .select({
      itemId: deployedMaterial.itemId,
      courseId: deployedMaterial.courseId,
      title: deployedMaterial.title,
      type: deployedMaterial.type,
      content: deployedMaterial.content,
      sessionSequence: deployedMaterial.sessionSequence,
      lessonId: deployedMaterial.lessonId,
      deployedAt: deployedMaterial.deployedAt,
    })
    .from(deployedMaterial)
    .leftJoin(builderTask, eq(builderTask.taskId, deployedMaterial.itemId))
    .where(
      and(
        eq(deployedMaterial.sessionId, sessionId),
        inArray(deployedMaterial.type, ['task', 'assessment', 'homework']),
        isNull(builderTask.deletedAt)
      )
    )
    .orderBy(asc(deployedMaterial.sessionSequence), asc(deployedMaterial.deployedAt))

  const tasks: LiveTask[] = []
  for (const row of rows) {
    const snapshot = (row.content ?? {}) as Partial<LiveTask>
    if (!snapshot.id) snapshot.id = row.itemId

    // Self-heal corrupted snapshots from the authoritative BuilderTask / builderData source.
    // Also recover a missing sourceDocument, because tasks whose title/content survive but
    // whose document reference was lost will render as blank PDFs / unavailable documents.
    const snapshotTitle = row.title || snapshot.title
    const needsSourceRecovery =
      isCorruptedSnapshot({ ...snapshot, title: snapshotTitle }) ||
      (!snapshot.sourceDocument?.fileUrl && !snapshot.sourceDocument?.fileKey)
    if (needsSourceRecovery && row.courseId) {
      try {
        const source = await fetchTaskSourceFromBuilder(row.itemId, row.courseId)
        if (source) {
          const recovered = recoverSnapshot(snapshot, source.fields)
          Object.assign(snapshot, recovered)
        }
      } catch (recoverErr) {
        console.error(`[deployed-tasks] recovery failed for ${row.itemId}:`, recoverErr)
      }
    }

    tasks.push({
      id: snapshot.id!,
      title: snapshot.title || row.title || 'Task',
      content: snapshot.content || '',
      description: snapshot.description,
      instructions: snapshot.instructions,
      source: (row.type as LiveTask['source']) || snapshot.source || 'task',
      dmiItems: Array.isArray(snapshot.dmiItems) ? snapshot.dmiItems : undefined,
      deployedAt:
        typeof snapshot.deployedAt === 'number'
          ? snapshot.deployedAt
          : row.deployedAt
            ? new Date(row.deployedAt).getTime()
            : Date.now(),
      polls: Array.isArray(snapshot.polls) ? snapshot.polls : [],
      questions: Array.isArray(snapshot.questions) ? snapshot.questions : [],
      sourceDocument: snapshot.sourceDocument,
      htmlContent: snapshot.htmlContent,
      linkPreviews: snapshot.linkPreviews,
      generatedFromText: snapshot.generatedFromText,
      parentId: snapshot.parentId,
      isExtension: snapshot.isExtension ?? false,
      lessonId: snapshot.lessonId || row.lessonId || undefined,
      completedBy: Array.isArray(snapshot.completedBy) ? snapshot.completedBy : [],
      timeLimit: snapshot.timeLimit,
      audioTrack: snapshot.audioTrack,
    })
  }

  return NextResponse.json({
    session: {
      id: sessionRow.id,
      title: sessionRow.title,
      status: sessionRow.status,
    },
    tasks,
  })
})
