/**
 * Session reschedule consent — tutor endpoints.
 *
 *  POST   propose a new time  (tutor)  → creates a PENDING proposal (or applies
 *         immediately when the session has no rostered students)
 *  GET    read the open proposal + vote tally (tutor or a rostered student)
 *  DELETE cancel a pending proposal (tutor)
 *
 * The response layer for students lives at ./respond. See
 * src/lib/schedule/reschedule-consent.ts for the state machine.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, sessionRescheduleVote } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { findConflicts, findAlternativeSlots } from '@/lib/schedule/conflicts'
import {
  proposeReschedule,
  cancelProposal,
  getOpenProposal,
} from '@/lib/schedule/reschedule-consent'

const ProposeSchema = z.object({
  proposedStartTime: z.string().datetime(),
  durationMinutes: z.number().min(5).max(480).optional(),
})

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const tutorId = session.user.id
      const params = await context?.params
      const sessionId = params?.id
      if (!sessionId || typeof sessionId !== 'string') {
        return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
      }

      const parsed = ProposeSchema.safeParse(await req.json().catch(() => ({})))
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request body', details: parsed.error.issues },
          { status: 400 }
        )
      }

      const [sess] = await drizzleDb
        .select()
        .from(liveSession)
        .where(and(eq(liveSession.sessionId, sessionId), eq(liveSession.tutorId, tutorId)))
        .limit(1)
      if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

      const duration = parsed.data.durationMinutes ?? sess.durationMinutes ?? 60
      const proposedStart = new Date(parsed.data.proposedStartTime)
      const proposedEnd = new Date(proposedStart.getTime() + duration * 60000)
      const currentStart = sess.scheduledAt ?? null
      const currentEnd = currentStart
        ? new Date(currentStart.getTime() + (sess.durationMinutes ?? duration) * 60000)
        : null

      // Reject a proposal that already conflicts with the tutor's own calendar.
      const conflicts = await findConflicts(tutorId, proposedStart, proposedEnd, {
        excludeSessionId: sessionId,
      })
      if (conflicts.length > 0) {
        const suggestedTimes = await findAlternativeSlots(tutorId, proposedStart, duration, {
          maxSuggestions: 3,
          excludeSessionId: sessionId,
        })
        return NextResponse.json(
          {
            error: 'This time slot conflicts with an existing session.',
            conflicts: conflicts.map(c => ({
              type: c.type,
              title: c.title,
              startTime: c.startTime.toISOString(),
              endTime: c.endTime.toISOString(),
            })),
            suggestedTimes,
          },
          { status: 409 }
        )
      }

      const result = await proposeReschedule({
        session: {
          sessionId,
          courseId: sess.courseId,
          tutorId,
          title: sess.title,
        },
        currentStart,
        currentEnd,
        proposedStart,
        proposedEnd,
        timezone: null,
      })

      return NextResponse.json(
        result.kind === 'applied'
          ? { applied: true, reason: result.reason }
          : { pending: true, proposalId: result.proposalId, voterCount: result.voterCount }
      )
    },
    { role: 'TUTOR' }
  )
)

export const GET = withAuth(async (req: NextRequest, session, context) => {
  const params = await context?.params
  const sessionId = params?.id
  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
  }

  const open = await getOpenProposal(sessionId)
  if (!open) return NextResponse.json({ proposal: null })

  const [myVote] = await drizzleDb
    .select({ response: sessionRescheduleVote.response })
    .from(sessionRescheduleVote)
    .where(
      and(
        eq(sessionRescheduleVote.proposalId, open.proposal.proposalId),
        eq(sessionRescheduleVote.studentId, session.user.id)
      )
    )
    .limit(1)

  return NextResponse.json({
    proposal: {
      proposalId: open.proposal.proposalId,
      sessionId: open.proposal.sessionId,
      proposedStart: open.proposal.proposedStart,
      proposedEnd: open.proposal.proposedEnd,
      currentStart: open.proposal.currentStart,
      status: open.proposal.status,
    },
    tally: {
      agreed: open.agreed,
      disagreed: open.disagreed,
      pending: open.pending,
      total: open.total,
    },
    myVote: myVote?.response ?? null,
  })
})

const CancelSchema = z.object({ proposalId: z.string().min(1) })

export const DELETE = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
      const parsed = CancelSchema.safeParse(await req.json().catch(() => ({})))
      if (!parsed.success) {
        return NextResponse.json({ error: 'proposalId is required' }, { status: 400 })
      }
      const ok = await cancelProposal(parsed.data.proposalId, session.user.id)
      if (!ok) {
        return NextResponse.json(
          { error: 'No cancellable proposal found for you' },
          { status: 404 }
        )
      }
      return NextResponse.json({ cancelled: true })
    },
    { role: 'TUTOR' }
  )
)
