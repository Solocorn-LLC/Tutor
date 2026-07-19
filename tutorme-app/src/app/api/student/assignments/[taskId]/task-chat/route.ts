/**
 * POST /api/student/assignments/[taskId]/task-chat
 *
 * The chat-based TASK flow for a live session. A task has no DMI — the student
 * answers by chatting, then completes:
 *   • mode "complete" ({ answers: string[] }) — the AI responds to EACH chatted
 *     answer, grounded in the task's PCI, and the attempt is persisted.
 *   • mode "ask" ({ question, history }) — after completing, the student asks
 *     about the task/their answers and the AI explains, per the PCI.
 *
 * Grounded + guardrailed + rate-limited, exactly like the assessment grader/ask.
 * The task PCI lives server-side (builderTask, upserted at deploy) — it never
 * reaches the student client.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { expandToCourseFamily } from '@/lib/courses/variant-family'
import { randomUUID } from 'crypto'
import { getServerSession, authOptions } from '@/lib/auth'
import { getParamAsync } from '@/lib/api/params'
import { handleApiError, requireCsrf, withRateLimitPreset } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  builderTask,
  courseEnrollment,
  taskSubmission,
  sessionParticipant,
  liveSession,
} from '@/lib/db/schema'
import { ASK_SYSTEM_PROMPT } from '@/lib/ai/task-chat-prompts'
import { generateWithKimi } from '@/lib/ai/kimi'
import { runTaskGuardrails } from '@/lib/ai/guardrails'
import { gradeAnswerAgainstBasis, renderGradingSpec } from '@/lib/grading/pci-grader'

const MAX_ANSWERS = 12
const MAX_ANSWER_LEN = 3000
const MAX_QUESTION = 800
const MAX_HISTORY_TURNS = 6

interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> }
) {
  try {
    const { response: rateLimitResponse } = await withRateLimitPreset(request, 'aiGenerate')
    if (rateLimitResponse) return rateLimitResponse

    const session = await getServerSession(authOptions, request)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const studentId = session.user.id

    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const taskId = await getParamAsync(context.params, 'taskId')
    if (!taskId || !/^[a-zA-Z0-9\-_]+$/.test(taskId) || taskId.length > 100) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
    }

    const [task] = await drizzleDb
      .select({
        courseId: builderTask.courseId,
        title: builderTask.title,
        content: builderTask.content,
        pci: builderTask.pci,
        pciSpec: builderTask.pciSpec,
        tutorId: builderTask.tutorId,
      })
      .from(builderTask)
      .where(eq(builderTask.taskId, taskId))
      .limit(1)

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Access: the caller must be enrolled in the task's course, already have a
    // submission (so follow-ups keep working), be a live-session PARTICIPANT of the
    // course (1-on-1/group students join by a booking seat, not enrollment), or be
    // the task's OWNER tutor (an in-session preview of what students get). The
    // owner-tutor path is stateless — it never writes a taskSubmission.
    const isOwnerTutor = !!task.tutorId && task.tutorId === studentId
    const taskCourseFamily = await expandToCourseFamily(task.courseId ? [task.courseId] : [])
    const [enrolled] = await drizzleDb
      .select({ id: courseEnrollment.enrollmentId })
      .from(courseEnrollment)
      .where(
        and(
          eq(courseEnrollment.studentId, studentId),
          inArray(courseEnrollment.courseId, taskCourseFamily)
        )
      )
      .limit(1)
    const [existing] = await drizzleDb
      .select({
        submissionId: taskSubmission.submissionId,
        answers: taskSubmission.answers,
        followUps: taskSubmission.followUps,
      })
      .from(taskSubmission)
      .where(and(eq(taskSubmission.taskId, taskId), eq(taskSubmission.studentId, studentId)))
      .limit(1)
    let isParticipant = false
    if (!enrolled && !existing && !isOwnerTutor && taskCourseFamily.length > 0) {
      const [p] = await drizzleDb
        .select({ id: sessionParticipant.participantId })
        .from(sessionParticipant)
        .innerJoin(liveSession, eq(liveSession.sessionId, sessionParticipant.sessionId))
        .where(
          and(
            eq(sessionParticipant.studentId, studentId),
            inArray(liveSession.courseId, taskCourseFamily)
          )
        )
        .limit(1)
      isParticipant = !!p
    }
    if (!enrolled && !existing && !isOwnerTutor && !isParticipant) {
      return NextResponse.json({ error: 'Not enrolled in this task' }, { status: 403 })
    }
    // The tutor previewing their own task never persists a submission.
    const persist = !isOwnerTutor

    const body = (await request.json().catch(() => ({}))) as {
      answers?: unknown
      question?: unknown
      history?: HistoryTurn[]
    }

    const specText = renderGradingSpec(task.pciSpec)
    const taskContext = `${task.title}\n\n${task.content}`.trim().slice(0, 4000)

    // ─── COMPLETE: respond to each chatted answer, grounded in the PCI ──────────
    if (Array.isArray(body.answers) && body.answers.length > 0) {
      const answers = body.answers
        .map(a =>
          String(a ?? '')
            .trim()
            .slice(0, MAX_ANSWER_LEN)
        )
        .filter(Boolean)
        .slice(0, MAX_ANSWERS)
      if (answers.length === 0) {
        return NextResponse.json({ error: 'No answers to respond to' }, { status: 400 })
      }

      const responses: { answer: string; response: string; score: number | null }[] = []
      let anyBasis = false
      let anyUnavailable = false
      for (const answer of answers) {
        const result = await gradeAnswerAgainstBasis({
          pci: task.pci,
          specText,
          questionText: taskContext,
          studentAnswer: answer,
        })
        anyBasis = anyBasis || result.hasBasis
        anyUnavailable = anyUnavailable || result.aiUnavailable
        const response = !result.hasBasis
          ? "Your answer's recorded — your tutor hasn't set a marking policy for this task yet, so I can't check it here."
          : result.aiUnavailable
            ? "Your answer's recorded, but the assistant is unavailable right now — try asking again in a moment."
            : result.feedback || 'Thanks — noted.'
        responses.push({ answer, response, score: result.score })
      }

      const graded = responses.map(r => r.score).filter((s): s is number => typeof s === 'number')
      const avgScore = graded.length
        ? Math.round(graded.reduce((a, b) => a + b, 0) / graded.length)
        : null

      const aiFeedback = {
        generatedAt: new Date().toISOString(),
        provider: 'kimi',
        items: responses.map((r, i) => ({
          questionId: String(i + 1),
          explanation: r.response,
        })),
      }
      const answersRecord: Record<string, string> = {}
      answers.forEach((a, i) => {
        answersRecord[String(i + 1)] = a
      })

      // Persist the completed attempt (idempotent on re-complete) — unless this is
      // the owner tutor's stateless preview.
      if (persist) {
        await drizzleDb
          .insert(taskSubmission)
          .values({
            submissionId: randomUUID(),
            taskId,
            studentId,
            answers: answersRecord,
            timeSpent: 0,
            attempts: 1,
            score: avgScore,
            maxScore: 100,
            status: 'submitted',
            tutorApproved: false,
            aiFeedback,
            submittedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [taskSubmission.taskId, taskSubmission.studentId],
            set: {
              answers: answersRecord,
              score: avgScore,
              status: 'submitted',
              aiFeedback,
              submittedAt: new Date(),
            },
          })
      }

      return NextResponse.json({
        mode: 'complete',
        responses,
        hasBasis: anyBasis,
        aiUnavailable: anyUnavailable && !anyBasis,
      })
    }

    // ─── ASK: follow-up about the task / their answers, explained per PCI ───────
    const question = String(body.question ?? '')
      .trim()
      .slice(0, MAX_QUESTION)
    if (!question) {
      return NextResponse.json({ error: 'answers or question is required' }, { status: 400 })
    }

    const priorAnswers =
      existing && existing.answers && typeof existing.answers === 'object'
        ? Object.values(existing.answers as Record<string, string>)
            .map(a => String(a))
            .filter(Boolean)
        : []

    const pci = (task.pci ?? '').trim()
    if (!pci && !specText) {
      return NextResponse.json({
        mode: 'ask',
        answer:
          "Your tutor hasn't set a marking policy for this task, so I can't explain it reliably — please ask your tutor directly.",
      })
    }

    const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_TURNS) : []
    const historyBlock = history.length
      ? `Conversation so far:\n${history
          .map(
            t =>
              `${t.role === 'assistant' ? 'Tutor' : 'Student'}: ${String(t.content).slice(0, 800)}`
          )
          .join('\n')}\n\n`
      : ''
    const answersBlock = priorAnswers.length
      ? `The student's answers to this task:\n${priorAnswers.map((a, i) => `${i + 1}. ${a.slice(0, 800)}`).join('\n')}\n\n`
      : ''
    const specBlock = specText ? `Structured marking guidance (PCI):\n${specText}\n\n` : ''
    const prompt = `Tutor's marking policy (PCI):\n${pci.slice(0, 2000)}\n\n${specBlock}Task:\n${taskContext}\n\n${answersBlock}${historyBlock}The student's follow-up:\n${question}`

    let answer: string
    try {
      answer = await generateWithKimi(prompt, {
        systemPrompt: ASK_SYSTEM_PROMPT,
        temperature: 0.4,
        maxTokens: 400,
        timeoutMs: 30000,
      })
    } catch (aiErr) {
      console.warn('[task-chat] Kimi call failed:', aiErr)
      return NextResponse.json(
        { error: 'The tutor assistant is unavailable right now. Please try again.' },
        { status: 503 }
      )
    }
    answer = answer.trim().slice(0, 1500)
    if (!answer) {
      return NextResponse.json({ error: 'Could not generate an answer.' }, { status: 502 })
    }

    const guardrail = runTaskGuardrails(answer, {
      sourceContent: [pci, specText].filter(Boolean).join('\n'),
    })
    if (guardrail.violations.length > 0) {
      console.warn(
        '[task-chat] guardrail warnings:',
        guardrail.violations.map(v => `${v.ruleId} ${v.severity}`).join(', ')
      )
    }

    // Persist the follow-up for tutor visibility (best-effort). Never for the
    // owner tutor's stateless preview.
    if (persist && existing) {
      try {
        const list = Array.isArray(existing.followUps) ? (existing.followUps as unknown[]) : []
        const next = [
          ...list,
          { questionId: 'task', question, answer, at: new Date().toISOString() },
        ].slice(-50)
        await drizzleDb
          .update(taskSubmission)
          .set({ followUps: next })
          .where(eq(taskSubmission.submissionId, existing.submissionId))
      } catch (persistErr) {
        console.warn('[task-chat] failed to persist follow-up:', persistErr)
      }
    }

    return NextResponse.json({ mode: 'ask', answer })
  } catch (error) {
    return handleApiError(
      error,
      'Failed to process task chat',
      'api/student/assignments/[taskId]/task-chat/route.ts'
    )
  }
}
