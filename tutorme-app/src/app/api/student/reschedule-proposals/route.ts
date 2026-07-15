/**
 * GET /api/student/reschedule-proposals
 *
 * The pending session-reschedule proposals awaiting THIS student's response
 * (agree/disagree). Feeds the dashboard banner; the student acts via
 * POST /api/sessions/[id]/reschedule/respond. See the consent gate in
 * src/lib/schedule/reschedule-consent.ts.
 */

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  sessionRescheduleProposal,
  sessionRescheduleVote,
  liveSession,
  profile,
} from '@/lib/db/schema'
import { and, eq, ne } from 'drizzle-orm'

export const GET = withAuth(async (_req, session) => {
  const studentId = session.user.id

  const rows = await drizzleDb
    .select({
      proposalId: sessionRescheduleProposal.proposalId,
      sessionId: sessionRescheduleProposal.sessionId,
      currentStart: sessionRescheduleProposal.currentStart,
      proposedStart: sessionRescheduleProposal.proposedStart,
      proposedEnd: sessionRescheduleProposal.proposedEnd,
      title: liveSession.title,
      tutorName: profile.name,
      myVote: sessionRescheduleVote.response,
    })
    .from(sessionRescheduleVote)
    .innerJoin(
      sessionRescheduleProposal,
      eq(sessionRescheduleProposal.proposalId, sessionRescheduleVote.proposalId)
    )
    .leftJoin(liveSession, eq(liveSession.sessionId, sessionRescheduleProposal.sessionId))
    .leftJoin(profile, eq(profile.userId, sessionRescheduleProposal.proposedBy))
    .where(
      and(
        eq(sessionRescheduleVote.studentId, studentId),
        eq(sessionRescheduleProposal.status, 'PENDING'),
        // Hide proposals for a session that has since ended (it's moot).
        ne(liveSession.status, 'ended')
      )
    )

  return NextResponse.json({
    proposals: rows.map(r => ({
      proposalId: r.proposalId,
      sessionId: r.sessionId,
      title: r.title || 'Your session',
      tutorName: r.tutorName || 'Your tutor',
      currentStart: r.currentStart?.toISOString() ?? null,
      proposedStart: r.proposedStart?.toISOString() ?? null,
      proposedEnd: r.proposedEnd?.toISOString() ?? null,
      myVote: r.myVote,
    })),
  })
})
