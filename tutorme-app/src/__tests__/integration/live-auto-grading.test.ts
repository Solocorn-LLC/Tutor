/**
 * Integration test: live auto-grading end-to-end (the path a live session drives).
 *
 * When a student fires `task:complete` in a live session, the socket handler
 * (socket-server-enhanced.ts) fetches the task's DMI answer key from
 * BuilderTaskDmi.items, grades the answers with autoGradeDmi, and persists the
 * resulting score + questionResults on the taskSubmission. The tutor Monitor's
 * "Understanding" indicator then reads that score via the comprehension route.
 *
 * This test reproduces that exact chain against a real DB:
 *   1. Seed a task with a DMI answer key (the server-only key).
 *   2. Run the handler's exact fetch-latest-DMI + autoGradeDmi + insert sequence.
 *   3. Assert the submission row carries the computed score + per-item results.
 *   4. Call the REAL /api/tutor/live-sessions/[id]/comprehension handler and
 *      assert it surfaces that score as the student's live Understanding.
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { desc, eq, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  user,
  course,
  courseLesson,
  builderTask,
  builderTaskDmi,
  liveSession,
  taskSubmission,
} from '@/lib/db/schema'
import { autoGradeDmi } from '@/lib/grading/auto-grade'

const stamp = Date.now()
const tutorEmail = `claude-grade-tutor-${stamp}@example.com`
const studentEmail = `claude-grade-student-${stamp}@example.com`

const tutorId = crypto.randomUUID()
const studentId = crypto.randomUUID()
const courseId = `c_${stamp}`
const lessonId = `l_${stamp}`
const sessionId = `sess_${stamp}`
const taskId = `task_${stamp}`
const dmiId = `dmi_${stamp}`

// The tutor's answer key — stored server-side in BuilderTaskDmi.items, never
// sent to students. Keyed by item id, which is what the student answers map to.
const answerKey = [
  { id: 'q1', questionNumber: 1, questionText: 'Capital of France?', answer: 'Paris' },
  { id: 'q2', questionNumber: 2, questionText: '6 x 7?', answer: '42' },
  { id: 'q3', questionNumber: 3, questionText: 'Plant energy process?', answer: 'Photosynthesis' },
]
// Student gets 2 of 3 right (q2 wrong) -> 67.
const studentAnswers: Record<string, string> = {
  q1: 'It is Paris',
  q2: '7',
  q3: 'photosynthesis',
}
const EXPECTED_SCORE = 67

// Mock auth so the real comprehension handler runs as our tutor.
const mockSession = {
  user: { id: tutorId, email: tutorEmail, role: 'TUTOR' as const },
  expires: new Date(Date.now() + 86400 * 1000).toISOString(),
}
vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve(mockSession)),
  authOptions: {},
}))

// Imported after the mock is registered (hoisted by vitest anyway).
import { GET as getComprehension } from '@/app/api/tutor/live-sessions/[sessionId]/comprehension/route'

/**
 * Reproduces exactly what the live `task:complete` socket handler does to grade
 * and persist a completion: fetch the latest DMI answer key for the task, grade
 * the student's answers, and write the score + per-item results.
 */
async function gradeAndPersistCompletion(answers: Record<string, string>) {
  const now = new Date()
  let autoScore: number | null = null
  let autoResults: ReturnType<typeof autoGradeDmi>['questionResults'] = null
  const [dmi] = await drizzleDb
    .select({ items: builderTaskDmi.items })
    .from(builderTaskDmi)
    .where(eq(builderTaskDmi.taskId, taskId))
    .orderBy(desc(builderTaskDmi.updatedAt))
    .limit(1)
  if (dmi?.items) {
    const graded = autoGradeDmi(dmi.items as { id: string; answer?: string }[], answers)
    autoScore = graded.score
    autoResults = graded.questionResults
  }
  await drizzleDb
    .insert(taskSubmission)
    .values({
      submissionId: `s_${stamp}`,
      taskId,
      studentId,
      answers,
      timeSpent: 0,
      attempts: 1,
      questionResults: autoResults,
      score: autoScore,
      maxScore: 100,
      status: 'submitted',
      tutorApproved: false,
      submittedAt: now,
    })
    .onConflictDoNothing({ target: [taskSubmission.taskId, taskSubmission.studentId] })
  return autoScore
}

function request(url: string): Request {
  return new Request(url, { headers: { 'Content-Type': 'application/json' } })
}

describe('Live auto-grading end-to-end', () => {
  beforeAll(async () => {
    const now = new Date()
    await drizzleDb.insert(user).values([
      { userId: tutorId, email: tutorEmail, role: 'TUTOR', createdAt: now, updatedAt: now },
      { userId: studentId, email: studentEmail, role: 'STUDENT', createdAt: now, updatedAt: now },
    ])
    await drizzleDb
      .insert(course)
      .values({ courseId, name: 'Claude Grade Course', creatorId: tutorId })
    await drizzleDb
      .insert(courseLesson)
      .values({ lessonId, courseId, title: 'Live Session', order: 0 })
    await drizzleDb.insert(builderTask).values({
      taskId,
      courseId,
      lessonId,
      tutorId,
      title: 'Graded task',
      content: 'content',
      pci: '',
      type: 'task',
      status: 'published',
    })
    await drizzleDb.insert(builderTaskDmi).values({
      dmiId,
      taskId,
      type: 'assessment',
      items: answerKey,
      createdAt: now,
      updatedAt: now,
    })
    await drizzleDb.insert(liveSession).values({
      sessionId,
      tutorId,
      courseId,
      title: 'Claude Grade Session',
      category: 'general',
      status: 'active',
      scheduledAt: now,
    })
  })

  afterAll(async () => {
    // FK-safe teardown (children first).
    const t = async (fn: () => Promise<unknown>) => {
      try {
        await fn()
      } catch {}
    }
    await t(() => drizzleDb.delete(taskSubmission).where(eq(taskSubmission.taskId, taskId)))
    await t(() => drizzleDb.delete(builderTaskDmi).where(eq(builderTaskDmi.taskId, taskId)))
    await t(() => drizzleDb.delete(builderTask).where(eq(builderTask.taskId, taskId)))
    await t(() => drizzleDb.delete(courseLesson).where(eq(courseLesson.courseId, courseId)))
    await t(() => drizzleDb.delete(liveSession).where(eq(liveSession.sessionId, sessionId)))
    await t(() => drizzleDb.delete(course).where(eq(course.courseId, courseId)))
    await t(() => drizzleDb.delete(user).where(inArray(user.userId, [tutorId, studentId])))
  })

  it('grades the completion against the DMI answer key and persists the score', async () => {
    const score = await gradeAndPersistCompletion(studentAnswers)
    expect(score).toBe(EXPECTED_SCORE)

    const [row] = await drizzleDb
      .select({
        score: taskSubmission.score,
        questionResults: taskSubmission.questionResults,
        status: taskSubmission.status,
      })
      .from(taskSubmission)
      .where(eq(taskSubmission.taskId, taskId))
      .limit(1)

    expect(row?.score).toBe(EXPECTED_SCORE)
    // Per-item correctness recorded; stays 'submitted' so the tutor can override.
    expect(row?.status).toBe('submitted')
    const qr = row?.questionResults as { questionId: string; correct: boolean }[] | null
    expect(Array.isArray(qr)).toBe(true)
    expect(qr?.find(x => x.questionId === 'q1')?.correct).toBe(true)
    expect(qr?.find(x => x.questionId === 'q2')?.correct).toBe(false)
    expect(qr?.find(x => x.questionId === 'q3')?.correct).toBe(true)
    // The answer key must never be persisted in the student-readable results.
    expect(JSON.stringify(qr)).not.toContain('Photosynthesis')
  })

  it('surfaces the score as live Understanding via the real comprehension route', async () => {
    const res = await getComprehension(
      request(`http://localhost/api/tutor/live-sessions/${sessionId}/comprehension`) as never,
      { params: Promise.resolve({ sessionId }) } as never
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.comprehension?.[studentId]).toBeTruthy()
    expect(data.comprehension[studentId].understanding).toBe(EXPECTED_SCORE)
    expect(data.comprehension[studentId].scored).toBe(1)
  })
})
