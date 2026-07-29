/**
 * POST /api/tutor/task-chat-preview
 *
 * Stateless preview of the chat-based TASK flow for the course builder Test tab.
 * Uses the exact same grading logic as the live student endpoint
 * (/api/student/assignments/[taskId]/task-chat) but never writes to the database.
 *
 * The caller may optionally override content / PCI / PCI-spec so the preview can
 * reflect an active extension rather than the parent task stored in the DB.
 * Ownership is still verified against the DB task record.
 */

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getServerSession, authOptions } from '@/lib/auth'
import { handleApiError, requireCsrf, withRateLimitPreset } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask } from '@/lib/db/schema'
import {
  gradeTaskChatComplete,
  gradeTaskChatAsk,
  sanitizeTaskChatAnswers,
  type TaskChatTask,
} from '@/lib/grading/task-chat-grader'

interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: NextRequest) {
  try {
    const { response: rateLimitResponse } = await withRateLimitPreset(request, 'aiGenerate')
    if (rateLimitResponse) return rateLimitResponse

    const session = await getServerSession(authOptions, request)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user.role !== 'TUTOR' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const body = (await request.json().catch(() => ({}))) as {
      taskId?: unknown
      title?: unknown
      content?: unknown
      questionText?: unknown
      pci?: unknown
      pciSpec?: unknown
      answers?: unknown
      question?: unknown
      history?: HistoryTurn[]
    }

    const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : ''
    if (!taskId || !/^[a-zA-Z0-9\-_]+$/.test(taskId) || taskId.length > 100) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
    }

    const [task] = await drizzleDb
      .select({
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

    const isAdmin = session.user.role === 'ADMIN'
    if (!isAdmin && task.tutorId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const taskChatTask: TaskChatTask = {
      taskId,
      title: typeof body.title === 'string' ? body.title.trim() : task.title,
      content:
        typeof body.content === 'string'
          ? body.content
          : typeof body.questionText === 'string'
            ? body.questionText
            : task.content,
      pci: typeof body.pci === 'string' ? body.pci : task.pci,
      pciSpec: body.pciSpec !== undefined ? body.pciSpec : task.pciSpec,
    }

    if (Array.isArray(body.answers) && body.answers.length > 0) {
      const answers = sanitizeTaskChatAnswers(body.answers)
      if (answers.length === 0) {
        return NextResponse.json({ error: 'No answers to respond to' }, { status: 400 })
      }

      const result = await gradeTaskChatComplete(taskChatTask, answers)
      return NextResponse.json({
        mode: 'complete',
        responses: result.responses,
        hasBasis: result.hasBasis,
        aiUnavailable: result.aiUnavailable,
      })
    }

    const question = typeof body.question === 'string' ? body.question.trim() : ''
    if (!question) {
      return NextResponse.json({ error: 'answers or question is required' }, { status: 400 })
    }

    const askResult = await gradeTaskChatAsk({
      task: taskChatTask,
      question,
      history: Array.isArray(body.history) ? body.history : [],
    })

    return NextResponse.json({ mode: 'ask', answer: askResult.answer })
  } catch (error) {
    return handleApiError(
      error,
      'Failed to preview task chat',
      'api/tutor/task-chat-preview/route.ts'
    )
  }
}
