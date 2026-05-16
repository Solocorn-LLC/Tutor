/**
 * Poll Voting API
 *
 * POST /api/class/polls/[pollId]/vote - Submit a vote/response
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { poll, pollResponse } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import crypto from 'crypto'

const voteSchema = z.object({
  answer: z.union([z.string(), z.array(z.string())]),
  anonymousId: z.string().optional(),
})

// POST - Submit a vote
export const POST = withAuth(async (req: NextRequest, session, context) => {
  try {
    const pollId = await getParamAsync(context.params, 'pollId')

    if (!pollId || pollId === 'undefined' || pollId === 'null') {
      return NextResponse.json({ error: 'Poll ID is required' }, { status: 400 })
    }

    const body = await req.json()
    const data = voteSchema.parse(body)

    const [pollRow] = await drizzleDb.select().from(poll).where(eq(poll.pollId, pollId)).limit(1)

    if (!pollRow) {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
    }

    if (pollRow.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Poll is not active' }, { status: 400 })
    }

    if (pollRow.timeLimit != null && pollRow.startedAt) {
      const elapsedSeconds = (Date.now() - new Date(pollRow.startedAt).getTime()) / 1000
      if (elapsedSeconds > pollRow.timeLimit) {
        return NextResponse.json({ error: 'Poll has expired' }, { status: 400 })
      }
    }

    if (!pollRow.isAnonymous) {
      const [existing] = await drizzleDb
        .select()
        .from(pollResponse)
        .where(and(eq(pollResponse.pollId, pollId), eq(pollResponse.studentId, session.user.id)))
        .limit(1)
      if (existing) {
        return NextResponse.json({ error: 'You have already voted in this poll' }, { status: 400 })
      }
    }

    const optionIds = Array.isArray(data.answer) ? data.answer : [data.answer]
    let respondentHash: string | null = null
    if (pollRow.isAnonymous) {
      respondentHash =
        data.anonymousId ??
        crypto
          .createHash('sha256')
          .update(session.user.id + pollId)
          .digest('hex')
          .substring(0, 16)
    }

    const responseId = crypto.randomUUID()
    await drizzleDb.insert(pollResponse).values({
      responseId,
      pollId,
      studentId: pollRow.isAnonymous ? null : session.user.id,
      respondentHash,
      optionIds,
      rating: null,
      textAnswer: null,
    })

    const [response] = await drizzleDb
      .select()
      .from(pollResponse)
      .where(eq(pollResponse.responseId, responseId))
      .limit(1)

    const newTotal = (pollRow.totalResponses ?? 0) + 1
    await drizzleDb.update(poll).set({ totalResponses: newTotal }).where(eq(poll.pollId, pollId))

    return NextResponse.json({
      success: true,
      response: response ?? { id: responseId, pollId, optionIds, createdAt: new Date() },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', issues: error.issues }, { status: 400 })
    }
    console.error('Error submitting vote:', error)
    return handleApiError(error, 'Failed to submit vote', 'api/class/polls/[pollId]/vote/route.ts')
  }
})
