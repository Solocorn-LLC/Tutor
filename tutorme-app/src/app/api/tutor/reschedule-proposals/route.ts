/**
 * GET /api/tutor/reschedule-proposals
 *
 * The tutor's own PENDING reschedule proposals with a per-proposal agreement
 * tally, for the dashboard "pending — n/m agreed" badge. The tutor cancels via
 * DELETE /api/sessions/[id]/reschedule. See src/lib/schedule/reschedule-consent.ts.
 */

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { sessionRescheduleProposal, sessionRescheduleVote, liveSession } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'

export const GET = withAuth(
  async (_req, session) => {
    const tutorId = session.user.id

    const proposals = await drizzleDb
      .select({
        proposalId: sessionRescheduleProposal.proposalId,
        sessionId: sessionRescheduleProposal.sessionId,
        proposedStart: sessionRescheduleProposal.proposedStart,
        currentStart: sessionRescheduleProposal.currentStart,
        title: liveSession.title,
      })
      .from(sessionRescheduleProposal)
      .leftJoin(liveSession, eq(liveSession.sessionId, sessionRescheduleProposal.sessionId))
      .where(
        and(
          eq(sessionRescheduleProposal.proposedBy, tutorId),
          eq(sessionRescheduleProposal.status, 'PENDING')
        )
      )

    if (proposals.length === 0) return NextResponse.json({ proposals: [] })

    const votes = await drizzleDb
      .select({
        proposalId: sessionRescheduleVote.proposalId,
        response: sessionRescheduleVote.response,
      })
      .from(sessionRescheduleVote)
      .where(
        inArray(
          sessionRescheduleVote.proposalId,
          proposals.map(p => p.proposalId)
        )
      )

    const tally = new Map<string, { agreed: number; total: number }>()
    for (const v of votes) {
      const t = tally.get(v.proposalId) ?? { agreed: 0, total: 0 }
      t.total += 1
      if (v.response === 'AGREE') t.agreed += 1
      tally.set(v.proposalId, t)
    }

    return NextResponse.json({
      proposals: proposals.map(p => ({
        proposalId: p.proposalId,
        sessionId: p.sessionId,
        title: p.title || 'Your session',
        proposedStart: p.proposedStart?.toISOString() ?? null,
        currentStart: p.currentStart?.toISOString() ?? null,
        agreed: tally.get(p.proposalId)?.agreed ?? 0,
        total: tally.get(p.proposalId)?.total ?? 0,
      })),
    })
  },
  { role: 'TUTOR' }
)
