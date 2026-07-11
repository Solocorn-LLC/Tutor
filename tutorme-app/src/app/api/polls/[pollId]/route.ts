/**
 * Poll Detail API Routes
 * Individual poll management endpoints
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { getServerSession, authOptions } from '@/lib/auth'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { poll, pollOption, pollResponse } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { z } from 'zod'

// GET /api/polls/[pollId] - Get a specific poll
export async function GET(
  request: NextRequest,
  context: {
    params: Promise<Record<string, string | string[]>>
  }
) {
  try {
    const session = await getServerSession(authOptions, request)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const pollId = await getParamAsync(context.params, 'pollId')
    if (!pollId) {
      return NextResponse.json({ error: 'Poll ID required' }, { status: 400 })
    }

    const [pollRow] = await drizzleDb.select().from(poll).where(eq(poll.pollId, pollId)).limit(1)

    if (!pollRow) {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
    }

    const options = await drizzleDb
      .select()
      .from(pollOption)
      .where(eq(pollOption.pollId, pollId))
      .orderBy(asc(pollOption.label))

    const responses = await drizzleDb
      .select({
        id: pollResponse.responseId,
        optionIds: pollResponse.optionIds,
        rating: pollResponse.rating,
        textAnswer: pollResponse.textAnswer,
        studentId: pollResponse.studentId,
        createdAt: pollResponse.createdAt,
      })
      .from(pollResponse)
      .where(eq(pollResponse.pollId, pollId))

    // Only the poll's owning tutor (or an admin) may see who answered. For anyone
    // else, drop per-respondent studentIds so this endpoint can't be used to
    // enumerate which students responded (IDOR / PII leak).
    const isPollOwner = pollRow.tutorId === session.user.id || session.user.role === 'ADMIN'
    const hideStudentIds = pollRow.isAnonymous || !isPollOwner
    const formattedPoll = {
      ...pollRow,
      options,
      responses: hideStudentIds
        ? responses.map(r => ({ ...r, studentId: undefined }))
        : responses,
      totalResponses: responses.length,
    }

    return NextResponse.json({ poll: formattedPoll })
  } catch (error) {
    console.error('Failed to fetch poll:', error)
    return handleApiError(error, 'Failed to fetch poll', 'api/polls/[pollId]/route.ts')
  }
}

// PATCH /api/polls/[pollId] - Update poll status (start/end)
const UpdatePollSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED']).optional(),
  question: z.string().min(1).max(500).optional(),
  showResults: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<Record<string, string | string[]>>
  }
) {
  try {
    const session = await getServerSession(authOptions, request)
    if (!session?.user || session.user.role !== 'TUTOR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const pollId = await getParamAsync(context.params, 'pollId')
    if (!pollId) {
      return NextResponse.json({ error: 'Poll ID required' }, { status: 400 })
    }
    // Ownership: a tutor may only mutate their own poll (was gated on role only,
    // letting any tutor edit any poll by id).
    const [ownerRow] = await drizzleDb
      .select({ tutorId: poll.tutorId })
      .from(poll)
      .where(eq(poll.pollId, pollId))
      .limit(1)
    if (!ownerRow) {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
    }
    // The handler already returns 401 for any non-TUTOR, so ownership is the only
    // remaining check here (admins are intentionally not poll managers).
    if (ownerRow.tutorId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validated = UpdatePollSchema.parse(body)

    const updateData: {
      status?: 'DRAFT' | 'ACTIVE' | 'CLOSED'
      startedAt?: Date
      endedAt?: Date
      question?: string
      showResults?: boolean
    } = {}

    if (validated.status) {
      updateData.status = validated.status
      if (validated.status === 'ACTIVE') {
        updateData.startedAt = new Date()
      } else if (validated.status === 'CLOSED') {
        updateData.endedAt = new Date()
      }
    }

    if (validated.question !== undefined) {
      updateData.question = validated.question
    }

    if (validated.showResults !== undefined) {
      updateData.showResults = validated.showResults
    }

    if (Object.keys(updateData).length === 0) {
      const [existing] = await drizzleDb.select().from(poll).where(eq(poll.pollId, pollId)).limit(1)
      if (!existing) {
        return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
      }
      const options = await drizzleDb.select().from(pollOption).where(eq(pollOption.pollId, pollId))
      const responses = await drizzleDb
        .select({
          id: pollResponse.responseId,
          optionIds: pollResponse.optionIds,
          rating: pollResponse.rating,
          textAnswer: pollResponse.textAnswer,
          createdAt: pollResponse.createdAt,
        })
        .from(pollResponse)
        .where(eq(pollResponse.pollId, pollId))
      return NextResponse.json({ poll: { ...existing, options, responses } })
    }

    await drizzleDb.update(poll).set(updateData).where(eq(poll.pollId, pollId))

    const [updated] = await drizzleDb.select().from(poll).where(eq(poll.pollId, pollId)).limit(1)
    const options = await drizzleDb.select().from(pollOption).where(eq(pollOption.pollId, pollId))
    const responses = await drizzleDb
      .select({
        id: pollResponse.responseId,
        optionIds: pollResponse.optionIds,
        rating: pollResponse.rating,
        textAnswer: pollResponse.textAnswer,
        createdAt: pollResponse.createdAt,
      })
      .from(pollResponse)
      .where(eq(pollResponse.pollId, pollId))

    return NextResponse.json({ poll: { ...updated, options, responses } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Failed to update poll:', error)
    return handleApiError(error, 'Failed to update poll', 'api/polls/[pollId]/route.ts')
  }
}

// DELETE /api/polls/[pollId] - Delete a poll
export async function DELETE(
  request: NextRequest,
  context: {
    params: Promise<Record<string, string | string[]>>
  }
) {
  try {
    const session = await getServerSession(authOptions, request)
    if (!session?.user || session.user.role !== 'TUTOR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const pollId = await getParamAsync(context.params, 'pollId')
    if (!pollId) {
      return NextResponse.json({ error: 'Poll ID required' }, { status: 400 })
    }

    // Ownership: a tutor may only delete their own poll (was gated on role only).
    const [ownerRow] = await drizzleDb
      .select({ tutorId: poll.tutorId })
      .from(poll)
      .where(eq(poll.pollId, pollId))
      .limit(1)
    if (!ownerRow) {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
    }
    // The handler already returns 401 for any non-TUTOR, so ownership is the only
    // remaining check here (admins are intentionally not poll managers).
    if (ownerRow.tutorId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await drizzleDb.delete(pollResponse).where(eq(pollResponse.pollId, pollId))
    await drizzleDb.delete(pollOption).where(eq(pollOption.pollId, pollId))
    await drizzleDb.delete(poll).where(eq(poll.pollId, pollId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete poll:', error)
    return handleApiError(error, 'Failed to delete poll', 'api/polls/[pollId]/route.ts')
  }
}
