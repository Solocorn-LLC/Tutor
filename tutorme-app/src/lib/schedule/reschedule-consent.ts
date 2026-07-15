/**
 * Reschedule consent gate (Phase 2) — core service.
 *
 * A tutor's proposed time change to a 1-on-1/group/course session does not take
 * effect until every rostered (confirmed/paid) student agrees:
 *  - propose  → PENDING proposal + one PENDING vote per student; session stays
 *               at its old time; students are notified to agree/disagree.
 *  - agree    → when ALL have agreed, the change is APPLIED (session moved).
 *  - disagree → the proposal is REJECTED; the session keeps its old time.
 *  - cancel   → the tutor withdraws a pending proposal.
 * Non-responders leave it PENDING (no auto-expire). See [[tutorme-reschedule-consent]].
 *
 * The "who must agree" roster is confirmed/paid attendees only:
 *   course enrollees (variant-family-expanded) ∪ already-joined participants ∪
 *   RESERVED/PAID group-seat holders. See [[tutorme-template-vs-published-course-ids]].
 */

import crypto from 'crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  sessionRescheduleProposal,
  sessionRescheduleVote,
  liveSession,
  calendarEvent,
  courseEnrollment,
  sessionParticipant,
  groupSession,
  groupSessionParticipant,
  oneOnOneBookingRequest,
  profile,
  type RescheduleVoteResponse,
} from '@/lib/db/schema'
import { expandToCourseFamily } from '@/lib/courses/variant-family'
import { notify } from '@/lib/notifications/notify'
import { formatInZone } from '@/lib/notifications/reschedule'
import { findConflicts } from '@/lib/schedule/conflicts'

/**
 * Decide how a reschedule of this session must be handled:
 *  - 'one_on_one' — a confirmed 1-on-1 booking; it has its own propose/accept
 *    flow, so a direct calendar move is refused and the tutor is routed there.
 *  - 'consent'    — group/course session with a roster; a proposal is required.
 *  - 'direct'     — no audience (personal/solo event); move immediately.
 */
export async function classifySessionForReschedule(opts: {
  sessionId: string
  courseId: string | null
  calendarEventId?: string | null
}): Promise<{ kind: 'one_on_one' } | { kind: 'consent'; roster: string[] } | { kind: 'direct' }> {
  if (opts.calendarEventId) {
    const [booking] = await drizzleDb
      .select({ requestId: oneOnOneBookingRequest.requestId })
      .from(oneOnOneBookingRequest)
      .where(
        and(
          eq(oneOnOneBookingRequest.calendarEventId, opts.calendarEventId),
          inArray(oneOnOneBookingRequest.status, ['ACCEPTED', 'PAID'])
        )
      )
      .limit(1)
    if (booking) return { kind: 'one_on_one' }
  }
  const roster = await resolveVoterRoster(opts.sessionId, opts.courseId)
  return roster.length > 0 ? { kind: 'consent', roster } : { kind: 'direct' }
}

/** Confirmed/paid students who must agree to move this session. */
export async function resolveVoterRoster(
  sessionId: string,
  courseId?: string | null
): Promise<string[]> {
  const ids = new Set<string>()

  if (courseId) {
    const familyIds = await expandToCourseFamily([courseId])
    const enrolled = await drizzleDb
      .select({ studentId: courseEnrollment.studentId })
      .from(courseEnrollment)
      .where(inArray(courseEnrollment.courseId, familyIds))
    for (const r of enrolled) if (r.studentId) ids.add(r.studentId)
  }

  const joined = await drizzleDb
    .select({ studentId: sessionParticipant.studentId })
    .from(sessionParticipant)
    .where(eq(sessionParticipant.sessionId, sessionId))
  for (const r of joined) if (r.studentId) ids.add(r.studentId)

  // Group-seat holders — only confirmed/paid seats block a reschedule.
  const seats = await drizzleDb
    .select({ studentId: groupSessionParticipant.studentId })
    .from(groupSessionParticipant)
    .innerJoin(
      groupSession,
      eq(groupSession.groupSessionId, groupSessionParticipant.groupSessionId)
    )
    .where(
      and(
        eq(groupSession.liveSessionId, sessionId),
        inArray(groupSessionParticipant.status, ['RESERVED', 'PAID'])
      )
    )
  for (const r of seats) if (r.studentId) ids.add(r.studentId)

  return [...ids]
}

/** Per-user timezone map for localized notification copy. */
async function timezonesFor(userIds: string[]): Promise<Map<string, string | null>> {
  if (userIds.length === 0) return new Map()
  const rows = await drizzleDb
    .select({ userId: profile.userId, timezone: profile.timezone })
    .from(profile)
    .where(inArray(profile.userId, userIds))
  return new Map(rows.map(r => [r.userId, r.timezone]))
}

function durationMinutes(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000))
}

export type ProposeResult =
  | { kind: 'applied'; reason: 'no_audience' }
  | { kind: 'proposed'; proposalId: string; voterCount: number }

/**
 * Tutor proposes a new time. With no rostered students the change is applied
 * immediately (nobody to consent); otherwise a PENDING proposal is created and
 * the session stays put until everyone agrees. Supersedes any prior pending
 * proposal for the same session.
 */
export async function proposeReschedule(opts: {
  session: { sessionId: string; courseId: string | null; tutorId: string; title: string | null }
  currentStart: Date | null
  currentEnd: Date | null
  proposedStart: Date
  proposedEnd: Date
  timezone?: string | null
}): Promise<ProposeResult> {
  const { session, currentStart, currentEnd, proposedStart, proposedEnd, timezone } = opts
  const roster = await resolveVoterRoster(session.sessionId, session.courseId)

  if (roster.length === 0) {
    await applySessionMove(session.sessionId, proposedStart, proposedEnd)
    return { kind: 'applied', reason: 'no_audience' }
  }

  // Supersede any still-pending proposal for this session.
  await drizzleDb
    .update(sessionRescheduleProposal)
    .set({ status: 'CANCELLED', resolvedReason: 'superseded', resolvedAt: new Date() })
    .where(
      and(
        eq(sessionRescheduleProposal.sessionId, session.sessionId),
        eq(sessionRescheduleProposal.status, 'PENDING')
      )
    )

  const proposalId = crypto.randomUUID()
  await drizzleDb.insert(sessionRescheduleProposal).values({
    proposalId,
    sessionId: session.sessionId,
    courseId: session.courseId,
    proposedBy: session.tutorId,
    currentStart,
    currentEnd,
    proposedStart,
    proposedEnd,
    status: 'PENDING',
  })
  await drizzleDb.insert(sessionRescheduleVote).values(
    roster.map(studentId => ({
      voteId: crypto.randomUUID(),
      proposalId,
      studentId,
      response: 'PENDING' as RescheduleVoteResponse,
    }))
  )

  // Notify each student to agree/disagree, in their own timezone.
  const tzByUser = await timezonesFor(roster)
  const fallbackTz = timezone || 'UTC'
  const name = session.title || 'your session'
  await Promise.allSettled(
    roster.map(userId => {
      const when = formatInZone(proposedStart, tzByUser.get(userId) || fallbackTz)
      return notify({
        userId,
        type: 'class',
        title: 'Reschedule needs your approval',
        message: `Your tutor proposed moving "${name}" to ${when}. It won't change until everyone agrees — please agree or disagree.`,
        data: {
          type: 'reschedule-proposed',
          proposalId,
          sessionId: session.sessionId,
          proposedStart: proposedStart.toISOString(),
        },
        actionUrl: '/student/dashboard',
      })
    })
  )

  return { kind: 'proposed', proposalId, voterCount: roster.length }
}

export type RespondResult =
  | { status: 'PENDING'; agreed: number; total: number }
  | { status: 'APPLIED' }
  | { status: 'REJECTED'; reason: 'student_disagreed' | 'slot_unavailable' | 'session_ended' }
  | { status: 'ERROR'; error: string }

/** A student agrees or disagrees. Applies the move on unanimous agreement;
 *  a single disagree rejects it and the session keeps its old time. */
export async function respondToProposal(opts: {
  proposalId: string
  studentId: string
  response: 'AGREE' | 'DISAGREE'
}): Promise<RespondResult> {
  const { proposalId, studentId, response } = opts

  const [proposal] = await drizzleDb
    .select()
    .from(sessionRescheduleProposal)
    .where(eq(sessionRescheduleProposal.proposalId, proposalId))
    .limit(1)
  if (!proposal) return { status: 'ERROR', error: 'Proposal not found' }
  if (proposal.status !== 'PENDING') return { status: 'ERROR', error: 'Proposal is no longer open' }

  const [vote] = await drizzleDb
    .select()
    .from(sessionRescheduleVote)
    .where(
      and(
        eq(sessionRescheduleVote.proposalId, proposalId),
        eq(sessionRescheduleVote.studentId, studentId)
      )
    )
    .limit(1)
  if (!vote) return { status: 'ERROR', error: 'You are not on this session roster' }

  await drizzleDb
    .update(sessionRescheduleVote)
    .set({ response, respondedAt: new Date() })
    .where(eq(sessionRescheduleVote.voteId, vote.voteId))

  if (response === 'DISAGREE') {
    await resolveProposal(proposal.proposalId, 'REJECTED', 'student_disagreed')
    await notifyOutcome(proposal, 'rejected')
    return { status: 'REJECTED', reason: 'student_disagreed' }
  }

  // AGREE recorded — re-evaluate against the CURRENT roster.
  return evaluatePendingProposal(proposal)
}

/**
 * Decide a PENDING proposal against the CURRENT roster and apply it when every
 * still-enrolled voter has agreed. Votes from students who have since left
 * (unenrolled / seat cancelled) are ignored — otherwise a departed student's
 * unanswered vote would block unanimous agreement forever. Also closes the
 * proposal if its session has ended/been removed.
 */
async function evaluatePendingProposal(proposal: Proposal): Promise<RespondResult> {
  // Session gone or ended → the proposal is moot; close it.
  const [sess] = await drizzleDb
    .select({ status: liveSession.status })
    .from(liveSession)
    .where(eq(liveSession.sessionId, proposal.sessionId))
    .limit(1)
  if (!sess || sess.status === 'ended') {
    await resolveProposal(proposal.proposalId, 'CANCELLED', 'session_ended')
    return { status: 'REJECTED', reason: 'session_ended' }
  }

  const [votes, roster] = await Promise.all([
    drizzleDb
      .select({
        studentId: sessionRescheduleVote.studentId,
        response: sessionRescheduleVote.response,
      })
      .from(sessionRescheduleVote)
      .where(eq(sessionRescheduleVote.proposalId, proposal.proposalId)),
    resolveVoterRoster(proposal.sessionId, proposal.courseId),
  ])
  const rosterSet = new Set(roster)
  // Only votes from students still on the roster count toward the decision.
  const relevant = votes.filter(v => rosterSet.has(v.studentId))
  const agreed = relevant.filter(v => v.response === 'AGREE').length
  // Still someone left to hear from (or nobody valid remains) → stay pending.
  if (relevant.length === 0 || agreed < relevant.length) {
    return { status: 'PENDING', agreed, total: relevant.length }
  }

  // Everyone still enrolled agreed — re-check the slot is free, then move.
  const conflicts = await findConflicts(
    proposal.proposedBy,
    proposal.proposedStart,
    proposal.proposedEnd,
    { excludeSessionId: proposal.sessionId }
  )
  if (conflicts.length > 0) {
    await resolveProposal(proposal.proposalId, 'REJECTED', 'slot_unavailable')
    await notifyTutor(
      proposal.proposedBy,
      'Reschedule slot no longer available',
      'Everyone agreed, but the new time now conflicts with another session. Please propose a different time.'
    )
    return { status: 'REJECTED', reason: 'slot_unavailable' }
  }

  await applySessionMove(proposal.sessionId, proposal.proposedStart, proposal.proposedEnd)
  await resolveProposal(proposal.proposalId, 'APPLIED', 'all_agreed')
  await notifyOutcome(proposal, 'applied')
  return { status: 'APPLIED' }
}

/**
 * After a student leaves a course, drop their pending votes and re-evaluate any
 * affected proposals — so their departure can't leave a proposal stuck one vote
 * short of unanimous. Best-effort; never throws into the caller.
 */
export async function reconcileProposalsAfterDeparture(
  studentId: string,
  courseId: string
): Promise<void> {
  try {
    const familyIds = await expandToCourseFamily([courseId])
    const proposals = await drizzleDb
      .select()
      .from(sessionRescheduleProposal)
      .where(
        and(
          eq(sessionRescheduleProposal.status, 'PENDING'),
          inArray(sessionRescheduleProposal.courseId, familyIds)
        )
      )
    await dropVotesAndReevaluate(proposals, studentId)
  } catch (err) {
    console.warn('[reschedule] departure reconcile failed (non-critical):', err)
  }
}

/**
 * Same as above but keyed by session — for group-seat cancellations (an expired
 * or withdrawn seat), where the session may have no course. Best-effort.
 */
export async function reconcileProposalsForSession(
  studentId: string,
  sessionId: string
): Promise<void> {
  try {
    const proposals = await drizzleDb
      .select()
      .from(sessionRescheduleProposal)
      .where(
        and(
          eq(sessionRescheduleProposal.status, 'PENDING'),
          eq(sessionRescheduleProposal.sessionId, sessionId)
        )
      )
    await dropVotesAndReevaluate(proposals, studentId)
  } catch (err) {
    console.warn('[reschedule] session reconcile failed (non-critical):', err)
  }
}

/** Drop a departed student's votes from these proposals, then re-evaluate each. */
async function dropVotesAndReevaluate(proposals: Proposal[], studentId: string): Promise<void> {
  for (const proposal of proposals) {
    await drizzleDb
      .delete(sessionRescheduleVote)
      .where(
        and(
          eq(sessionRescheduleVote.proposalId, proposal.proposalId),
          eq(sessionRescheduleVote.studentId, studentId)
        )
      )
    await evaluatePendingProposal(proposal)
  }
}

/** Tutor withdraws a pending proposal; the session keeps its current time. */
export async function cancelProposal(proposalId: string, tutorId: string): Promise<boolean> {
  const [proposal] = await drizzleDb
    .select()
    .from(sessionRescheduleProposal)
    .where(
      and(
        eq(sessionRescheduleProposal.proposalId, proposalId),
        eq(sessionRescheduleProposal.proposedBy, tutorId),
        eq(sessionRescheduleProposal.status, 'PENDING')
      )
    )
    .limit(1)
  if (!proposal) return false
  await resolveProposal(proposalId, 'CANCELLED', 'tutor_cancelled')
  await notifyOutcome(proposal, 'cancelled')
  return true
}

// ── internals ────────────────────────────────────────────────────────────────

async function resolveProposal(
  proposalId: string,
  status: 'APPLIED' | 'REJECTED' | 'CANCELLED',
  reason: string
): Promise<void> {
  await drizzleDb
    .update(sessionRescheduleProposal)
    .set({ status, resolvedReason: reason, resolvedAt: new Date() })
    .where(eq(sessionRescheduleProposal.proposalId, proposalId))
}

/** Move the live session + its calendar projection to the new time. */
async function applySessionMove(sessionId: string, start: Date, end: Date): Promise<void> {
  await drizzleDb
    .update(liveSession)
    .set({ scheduledAt: start, durationMinutes: durationMinutes(start, end), reminderSentAt: null })
    .where(eq(liveSession.sessionId, sessionId))
  await drizzleDb
    .update(calendarEvent)
    .set({ startTime: start, endTime: end, updatedAt: new Date() })
    .where(eq(calendarEvent.externalId, sessionId))
}

type Proposal = typeof sessionRescheduleProposal.$inferSelect

async function notifyOutcome(
  proposal: Proposal,
  outcome: 'applied' | 'rejected' | 'cancelled'
): Promise<void> {
  const roster = await drizzleDb
    .select({ studentId: sessionRescheduleVote.studentId })
    .from(sessionRescheduleVote)
    .where(eq(sessionRescheduleVote.proposalId, proposal.proposalId))
  const userIds = roster.map(r => r.studentId)
  if (userIds.length === 0) return
  const tzByUser = await timezonesFor(userIds)

  const copy = {
    applied: {
      title: 'Session rescheduled',
      body: (when: string) => `Everyone agreed — the session has been moved to ${when}.`,
    },
    rejected: {
      title: 'Reschedule declined',
      body: () => `A student declined the new time, so the session keeps its current time.`,
    },
    cancelled: {
      title: 'Reschedule withdrawn',
      body: () => `The tutor withdrew the proposed time change; the current time stands.`,
    },
  }[outcome]

  await Promise.allSettled(
    userIds.map(userId => {
      const when = formatInZone(proposal.proposedStart, tzByUser.get(userId) || 'UTC')
      return notify({
        userId,
        type: 'class',
        title: copy.title,
        message: copy.body(when),
        data: { type: `reschedule-${outcome}`, sessionId: proposal.sessionId },
        actionUrl: '/student/dashboard',
      })
    })
  )
}

async function notifyTutor(tutorId: string, title: string, message: string): Promise<void> {
  await notify({ userId: tutorId, type: 'class', title, message, actionUrl: '/tutor/dashboard' })
}

/** Read the open proposal for a session (if any) with its vote tally. */
export async function getOpenProposal(sessionId: string): Promise<{
  proposal: Proposal
  agreed: number
  disagreed: number
  pending: number
  total: number
} | null> {
  const [proposal] = await drizzleDb
    .select()
    .from(sessionRescheduleProposal)
    .where(
      and(
        eq(sessionRescheduleProposal.sessionId, sessionId),
        eq(sessionRescheduleProposal.status, 'PENDING')
      )
    )
    .limit(1)
  if (!proposal) return null
  // A proposal for a session that has since ended is moot — treat it as none.
  const [sess] = await drizzleDb
    .select({ status: liveSession.status })
    .from(liveSession)
    .where(eq(liveSession.sessionId, sessionId))
    .limit(1)
  if (!sess || sess.status === 'ended') return null
  const votes = await drizzleDb
    .select({ response: sessionRescheduleVote.response })
    .from(sessionRescheduleVote)
    .where(eq(sessionRescheduleVote.proposalId, proposal.proposalId))
  return {
    proposal,
    agreed: votes.filter(v => v.response === 'AGREE').length,
    disagreed: votes.filter(v => v.response === 'DISAGREE').length,
    pending: votes.filter(v => v.response === 'PENDING').length,
    total: votes.length,
  }
}
