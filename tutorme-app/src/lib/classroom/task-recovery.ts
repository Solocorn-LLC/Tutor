/**
 * Helpers for recovering corrupted deployed task/assessment snapshots.
 *
 * The live session may lose its in-memory room state (server restart, Redis
 * eviction, reconnect). When that happens, subsequent code paths can create
 * DeployedMaterial rows with missing or "Untitled" content. This module finds
 * the authoritative source of truth (BuilderTask or courseLesson.builderData)
 * and rebuilds the snapshot while preserving live-only fields.
 */

import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, courseLesson, deployedMaterial } from '@/lib/db/schema'
import { eq, and, or, isNull, sql } from 'drizzle-orm'
import type { LiveTaskSourceDocument } from '@/lib/socket/socket-types'

export type RecoverableTaskFields = {
  title: string
  content: string
  sourceDocument?: LiveTaskSourceDocument
  dmiItems?: unknown[]
  htmlContent?: string
  linkPreviews?: unknown
  generatedFromText?: string
  description?: string
  instructions?: string
  source?: 'task' | 'assessment' | 'homework'
}

/** Minimal LiveTask shape used by recovery helpers; avoids a circular import. */
export type RecoveredLiveTask = {
  id: string
  title: string
  content: string
  description?: string
  instructions?: string
  source: 'task' | 'assessment' | 'homework'
  dmiItems?: unknown[]
  deployedAt: number
  polls: unknown[]
  questions: unknown[]
  sourceDocument?: LiveTaskSourceDocument
  htmlContent?: string
  linkPreviews?: unknown
  generatedFromText?: string | boolean
  parentId?: string
  isExtension?: boolean
  lessonId?: string
  completedBy?: string[]
  timeLimit?: string
  audioTrack?: {
    fileName: string
    mimeType: string
    fileUrl: string
    fileKey: string
    durationSeconds?: number
    uploadedAt: string
  }
}

export type TaskSourceLocation =
  | { kind: 'builderTask'; taskId: string }
  | { kind: 'builderData'; lessonId: string; courseId: string }
  | undefined

const isBlank = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim().length === 0)

const looksCorrupted = (title: unknown, content: unknown) =>
  isBlank(title) || title === 'Untitled' || isBlank(content)

/** Return true if a stored snapshot is missing its core identifying content. */
export function isCorruptedSnapshot(
  snapshot: Partial<RecoveredLiveTask> | undefined | null
): boolean {
  if (!snapshot) return true
  return looksCorrupted(snapshot.title, snapshot.content)
}

/** Best-effort fetch of the original task fields from BuilderTask or builderData. */
export async function fetchTaskSourceFromBuilder(
  taskId: string,
  courseId: string
): Promise<{ fields: RecoverableTaskFields; location: TaskSourceLocation } | undefined> {
  // 1) BuilderTask is the most authoritative normalized source.
  const [bt] = await drizzleDb
    .select({
      title: builderTask.title,
      content: builderTask.content,
      type: builderTask.type,
      metadata: builderTask.metadata,
      lessonId: builderTask.lessonId,
    })
    .from(builderTask)
    .where(and(eq(builderTask.taskId, taskId), eq(builderTask.courseId, courseId)))
    .limit(1)

  const metadata = (bt?.metadata ?? {}) as Record<string, unknown>
  const sourceDoc = metadata?.sourceDocument as LiveTaskSourceDocument | undefined

  if (bt && !looksCorrupted(bt.title, bt.content)) {
    return {
      fields: {
        title: bt.title,
        content: bt.content,
        source: (bt.type as RecoverableTaskFields['source']) || 'task',
        sourceDocument: sourceDoc,
        htmlContent: metadata?.htmlContent as string | undefined,
        linkPreviews: metadata?.linkPreviews,
        generatedFromText: metadata?.generatedFromText as string | undefined,
      },
      location: { kind: 'builderTask', taskId },
    }
  }

  // 2) Fall back to the JSON builderData inside CourseLesson.
  const lessons = await drizzleDb
    .select({ lessonId: courseLesson.lessonId, builderData: courseLesson.builderData })
    .from(courseLesson)
    .where(eq(courseLesson.courseId, courseId))

  for (const lesson of lessons) {
    const bData = (lesson.builderData ?? {}) as Record<string, unknown>
    const tasks = Array.isArray(bData.tasks) ? bData.tasks : []
    const assessments = Array.isArray(bData.assessments) ? bData.assessments : []
    const homework = Array.isArray(bData.homework) ? bData.homework : []

    for (const item of [...tasks, ...assessments, ...homework]) {
      const raw = item as Record<string, unknown>
      if (raw.id !== taskId) continue
      const rawSourceDoc = raw.sourceDocument as LiveTaskSourceDocument | undefined
      const source: RecoverableTaskFields['source'] = tasks.includes(item)
        ? 'task'
        : assessments.includes(item)
          ? 'assessment'
          : 'homework'

      const title =
        (raw.title as string) ||
        (rawSourceDoc?.fileName as string) ||
        (source === 'assessment' ? 'Assessment' : source === 'homework' ? 'Homework' : 'Task')
      const content =
        (raw.taskContent as string) || (raw.description as string) || (raw.content as string) || ''

      if (!looksCorrupted(title, content)) {
        return {
          fields: {
            title,
            content,
            source,
            sourceDocument: rawSourceDoc,
            dmiItems: Array.isArray(raw.dmiItems) ? raw.dmiItems : undefined,
            htmlContent: raw.htmlContent as string | undefined,
            linkPreviews: raw.linkPreviews,
            generatedFromText: raw.generatedFromText as string | undefined,
            description: raw.description as string | undefined,
            instructions: raw.instructions as string | undefined,
          },
          location: { kind: 'builderData', lessonId: lesson.lessonId, courseId },
        }
      }
    }
  }

  return undefined
}

/** Merge recovered source fields into a corrupted snapshot, preserving live state. */
export function recoverSnapshot(
  existing: Partial<RecoveredLiveTask> | undefined | null,
  source: RecoverableTaskFields
): RecoveredLiveTask {
  const snapshot = (existing ?? {}) as Partial<RecoveredLiveTask>

  return {
    id: snapshot.id || `unknown-${Date.now()}`,
    title: source.title,
    content: source.content,
    description: source.description ?? snapshot.description,
    instructions: source.instructions ?? snapshot.instructions,
    source: source.source ?? snapshot.source ?? 'task',
    dmiItems: source.dmiItems ?? snapshot.dmiItems,
    deployedAt: typeof snapshot.deployedAt === 'number' ? snapshot.deployedAt : Date.now(),
    polls: Array.isArray(snapshot.polls) ? snapshot.polls : [],
    questions: Array.isArray(snapshot.questions) ? snapshot.questions : [],
    sourceDocument: source.sourceDocument ?? snapshot.sourceDocument,
    htmlContent: source.htmlContent ?? snapshot.htmlContent,
    linkPreviews: source.linkPreviews ?? snapshot.linkPreviews,
    generatedFromText: source.generatedFromText ?? snapshot.generatedFromText,
    parentId: snapshot.parentId,
    isExtension: snapshot.isExtension ?? false,
    lessonId: snapshot.lessonId,
    completedBy: Array.isArray(snapshot.completedBy) ? snapshot.completedBy : [],
    timeLimit: snapshot.timeLimit,
    audioTrack: snapshot.audioTrack,
  } as RecoveredLiveTask
}

/**
 * For a given DeployedMaterial row, find the best source and return a recovered
 * LiveTask snapshot. Returns undefined if the row is not corrupted or if no
 * source can be found.
 */
export async function recoverDeployedMaterialRow(row: {
  sessionId: string
  courseId: string
  itemId: string
  type: string
  title: string
  content: Record<string, unknown> | null
}): Promise<RecoveredLiveTask | undefined> {
  const snapshot = (row.content ?? {}) as Partial<RecoveredLiveTask>
  if (!isCorruptedSnapshot(row.title ? snapshot : { ...snapshot, title: row.title })) {
    return undefined
  }

  const source = await fetchTaskSourceFromBuilder(row.itemId, row.courseId)
  if (!source) return undefined

  // Preserve live-only fields from the existing snapshot, then overlay source.
  return recoverSnapshot(snapshot, source.fields)
}

/** Update a single DeployedMaterial row with a recovered snapshot. */
export async function writeRecoveredSnapshot(
  sessionId: string,
  itemId: string,
  snapshot: RecoveredLiveTask
): Promise<void> {
  await drizzleDb
    .update(deployedMaterial)
    .set({
      title: snapshot.title,
      content: snapshot as unknown as Record<string, unknown>,
    })
    .where(and(eq(deployedMaterial.sessionId, sessionId), eq(deployedMaterial.itemId, itemId)))
}

/** List all DeployedMaterial rows that appear corrupted for a given course. */
export async function listCorruptedDeployedMaterials(courseId?: string) {
  const conditions = [
    eq(deployedMaterial.title, 'Untitled'),
    isNull(deployedMaterial.content),
    sql`(${deployedMaterial.content}->>'title' IS NULL OR ${deployedMaterial.content}->>'title' = '')`,
    sql`(${deployedMaterial.content}->>'content' IS NULL OR ${deployedMaterial.content}->>'content' = '')`,
  ]

  const whereClause = courseId
    ? and(eq(deployedMaterial.courseId, courseId), or(...conditions))
    : or(...conditions)

  return drizzleDb
    .select({
      id: deployedMaterial.id,
      sessionId: deployedMaterial.sessionId,
      courseId: deployedMaterial.courseId,
      itemId: deployedMaterial.itemId,
      type: deployedMaterial.type,
      title: deployedMaterial.title,
      content: deployedMaterial.content,
      sessionSequence: deployedMaterial.sessionSequence,
      lessonId: deployedMaterial.lessonId,
      deployedAt: deployedMaterial.deployedAt,
    })
    .from(deployedMaterial)
    .where(whereClause)
    .orderBy(deployedMaterial.deployedAt)
}
