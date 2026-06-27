/**
 * Integration regression test: live-session submission persistence + tutor reads.
 *
 * Guards the bug chain that repeatedly broke grading:
 *  1. Schema-drift class — columns declared notNull().defaultNow()/.default(...)
 *     must have real DB DEFAULTs, or inserts that omit them fail with a not-null
 *     violation. This is exactly what silently dropped every live submission
 *     (BuilderTask.updatedAt). The test inserts the live-flow rows WITHOUT the
 *     defaulted timestamps; if a default is missing again, these throw and fail.
 *  2. Reader visibility — a completed task/assessment must show on BOTH tutor
 *     views: the Grading page (/api/tutor/submissions, real handler) and the
 *     in-session panel (/submissions-tree query shape: deployedMaterial.itemId
 *     + sessionParticipant/enrollee).
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  user,
  course,
  courseLesson,
  builderTask,
  liveSession,
  deployedMaterial,
  sessionParticipant,
  taskSubmission,
} from '@/lib/db/schema'
import { GET as getSubmissions } from '@/app/api/tutor/submissions/route'

const stamp = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
const tutorEmail = `claude-subm-tutor-${stamp}@example.com`
const studentEmail = `claude-subm-student-${stamp}@example.com`

const tutorId = crypto.randomUUID()
const studentId = crypto.randomUUID()
const courseId = `c_${stamp}`
const lessonId = `l_${stamp}`
const sessionId = `sess_${stamp}`
const taskItemId = `task_${stamp}`
const assessmentItemId = `asmt_${stamp}`

// Mock next-auth so the real /api/tutor/submissions handler runs as our tutor.
// @/lib/auth.getServerSession delegates to next-auth's getServerSession.
const mockSession = {
  user: { id: tutorId, email: tutorEmail, role: 'TUTOR' as const },
  expires: new Date(Date.now() + 86400 * 1000).toISOString(),
}
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve(mockSession)),
}))

function request(url: string): Request {
  return new Request(url, { headers: { 'Content-Type': 'application/json' } })
}

/**
 * Replicates the durable writes the live `task:complete` socket handler performs
 * for one deployed item. Deliberately OMITS the defaulted timestamp columns
 * (createdAt/updatedAt/deployedAt/joinedAt/submittedAt) so the test fails loudly
 * if the DB defaults ever drift away again.
 */
async function persistCompletion(itemId: string, source: 'task' | 'assessment') {
  await drizzleDb
    .insert(courseLesson)
    .values({ lessonId, courseId, title: 'Live Session', order: 0 })
    .onConflictDoNothing({ target: courseLesson.lessonId })
  await drizzleDb.insert(builderTask).values({
    taskId: itemId,
    courseId,
    lessonId,
    tutorId,
    title: `Item ${itemId}`,
    content: 'content',
    pci: '',
    type: source,
    status: 'published',
  })
  await drizzleDb.insert(deployedMaterial).values({
    sessionId,
    courseId,
    type: source,
    itemId,
    title: `Item ${itemId}`,
    sessionSequence: 1,
  })
  await drizzleDb
    .insert(sessionParticipant)
    .values({ participantId: `p_${itemId}`, sessionId, studentId })
    .onConflictDoNothing({ target: [sessionParticipant.sessionId, sessionParticipant.studentId] })
  await drizzleDb.insert(taskSubmission).values({
    submissionId: `s_${itemId}`,
    taskId: itemId,
    studentId,
    answers: {},
    timeSpent: 0,
    attempts: 1,
    maxScore: 100,
    status: 'submitted',
    tutorApproved: false,
  })
}

describe('Live-session submission persistence + tutor visibility', () => {
  beforeAll(async () => {
    const now = new Date()
    await drizzleDb.insert(user).values([
      { userId: tutorId, email: tutorEmail, role: 'TUTOR', createdAt: now, updatedAt: now },
      { userId: studentId, email: studentEmail, role: 'STUDENT', createdAt: now, updatedAt: now },
    ])
    await drizzleDb
      .insert(course)
      .values({ courseId, name: 'Claude E2E Course', creatorId: tutorId })
    await drizzleDb.insert(liveSession).values({
      sessionId,
      tutorId,
      courseId,
      title: 'Claude E2E Session',
      category: 'general',
      status: 'active',
      scheduledAt: now,
    })
  })

  afterAll(async () => {
    // FK-safe teardown (children first).
    try {
      await drizzleDb
        .delete(taskSubmission)
        .where(inArray(taskSubmission.taskId, [taskItemId, assessmentItemId]))
    } catch {}
    try {
      await drizzleDb.delete(sessionParticipant).where(eq(sessionParticipant.sessionId, sessionId))
    } catch {}
    try {
      await drizzleDb.delete(deployedMaterial).where(eq(deployedMaterial.sessionId, sessionId))
    } catch {}
    try {
      await drizzleDb
        .delete(builderTask)
        .where(inArray(builderTask.taskId, [taskItemId, assessmentItemId]))
    } catch {}
    try {
      await drizzleDb.delete(courseLesson).where(eq(courseLesson.courseId, courseId))
    } catch {}
    try {
      await drizzleDb.delete(liveSession).where(eq(liveSession.sessionId, sessionId))
    } catch {}
    try {
      await drizzleDb.delete(course).where(eq(course.courseId, courseId))
    } catch {}
    try {
      await drizzleDb.delete(user).where(inArray(user.userId, [tutorId, studentId]))
    } catch {}
  })

  it('persists a task and an assessment completion without relying on missing defaults', async () => {
    // Throws if any defaulted timestamp column lacks its DB DEFAULT (the drift bug).
    await expect(persistCompletion(taskItemId, 'task')).resolves.not.toThrow()
    await expect(persistCompletion(assessmentItemId, 'assessment')).resolves.not.toThrow()

    const rows = await drizzleDb
      .select({
        taskId: builderTask.taskId,
        createdAt: builderTask.createdAt,
        updatedAt: builderTask.updatedAt,
        submittedAt: taskSubmission.submittedAt,
      })
      .from(taskSubmission)
      .innerJoin(builderTask, eq(taskSubmission.taskId, builderTask.taskId))
      .where(inArray(builderTask.taskId, [taskItemId, assessmentItemId]))
    expect(rows).toHaveLength(2)
    // Defaults filled the omitted timestamps.
    for (const r of rows) {
      expect(r.createdAt).toBeTruthy()
      expect(r.updatedAt).toBeTruthy()
      expect(r.submittedAt).toBeTruthy()
    }
  })

  it('shows both submissions on the tutor Grading page (real /api/tutor/submissions handler)', async () => {
    const res = await getSubmissions(
      request('http://localhost/api/tutor/submissions?status=submitted') as never
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    const ids = (data.submissions || []).map((s: { taskId: string }) => s.taskId)
    expect(ids).toContain(taskItemId)
    expect(ids).toContain(assessmentItemId)
  })

  it('shows both submissions to the in-session panel query (deployedMaterial + participant)', async () => {
    const sessions = await drizzleDb
      .select({ id: liveSession.sessionId })
      .from(liveSession)
      .where(and(eq(liveSession.courseId, courseId), eq(liveSession.tutorId, tutorId)))
    const sessionIds = sessions.map(s => s.id)

    const deployed = await drizzleDb
      .select({ itemId: deployedMaterial.itemId })
      .from(deployedMaterial)
      .where(
        and(
          eq(deployedMaterial.courseId, courseId),
          inArray(deployedMaterial.sessionId, sessionIds)
        )
      )
    const itemIds = Array.from(new Set(deployed.map(d => d.itemId)))

    const participants = await drizzleDb
      .select({ studentId: sessionParticipant.studentId })
      .from(sessionParticipant)
      .where(inArray(sessionParticipant.sessionId, sessionIds))
    const studentIds = Array.from(new Set(participants.map(p => p.studentId)))

    const visible = await drizzleDb
      .select({ taskId: taskSubmission.taskId })
      .from(taskSubmission)
      .where(
        and(inArray(taskSubmission.taskId, itemIds), inArray(taskSubmission.studentId, studentIds))
      )
    const ids = visible.map(v => v.taskId)
    expect(ids).toContain(taskItemId)
    expect(ids).toContain(assessmentItemId)
  })
})
