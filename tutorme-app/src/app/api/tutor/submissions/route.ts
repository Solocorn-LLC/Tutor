/**
 * GET /api/tutor/submissions
 *
 * Flat list of submissions for tasks owned by the logged-in tutor, with the
 * student's answers and current grade — the data source for the grading view.
 * Optional ?status= filter (submitted | graded). Admins see all submissions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { getServerSession, authOptions } from '@/lib/auth'
import { handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, profile, taskSubmission, user } from '@/lib/db/schema'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions, request)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user.role !== 'TUTOR' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const statusParam = new URL(request.url).searchParams.get('status')
    const isAdmin = session.user.role === 'ADMIN'

    const filters = [
      ...(isAdmin ? [] : [eq(builderTask.tutorId, session.user.id)]),
      ...(statusParam === 'submitted' || statusParam === 'graded'
        ? [eq(taskSubmission.status, statusParam)]
        : []),
    ]

    const rows = await drizzleDb
      .select({
        submissionId: taskSubmission.submissionId,
        taskId: taskSubmission.taskId,
        taskTitle: builderTask.title,
        studentId: taskSubmission.studentId,
        studentName: profile.name,
        status: taskSubmission.status,
        score: taskSubmission.score,
        maxScore: taskSubmission.maxScore,
        answers: taskSubmission.answers,
        questionResults: taskSubmission.questionResults,
        tutorFeedback: taskSubmission.tutorFeedback,
        timeSpent: taskSubmission.timeSpent,
        submittedAt: taskSubmission.submittedAt,
        gradedAt: taskSubmission.gradedAt,
      })
      .from(taskSubmission)
      .innerJoin(builderTask, eq(taskSubmission.taskId, builderTask.taskId))
      .leftJoin(user, eq(taskSubmission.studentId, user.userId))
      .leftJoin(profile, eq(user.userId, profile.userId))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(taskSubmission.submittedAt))
      .limit(200)

    return NextResponse.json({
      submissions: rows.map(r => ({
        ...r,
        studentName: r.studentName ?? 'Student',
        submittedAt: r.submittedAt?.toISOString() ?? null,
        gradedAt: r.gradedAt?.toISOString() ?? null,
      })),
    })
  } catch (error) {
    return handleApiError(error, 'Failed to load submissions', 'api/tutor/submissions/route.ts')
  }
}
