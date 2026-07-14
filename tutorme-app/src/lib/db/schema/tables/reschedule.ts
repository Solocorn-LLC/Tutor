/**
 * Reschedule consent gate (Phase 2).
 *
 * A tutor's proposed time change to a session does NOT take effect until every
 * rostered (confirmed/paid) student agrees. Any disagree cancels it; the session
 * stays at its original time until then. See [[tutorme-reschedule-consent]].
 *
 * NOTE: the Drizzle migration journal is frozen at 0068, so these tables are
 * ALSO created at boot via ENSURE_TABLES_SQL in src/lib/db/startup-schema-fix.ts
 * — keep the two definitions in sync. See [[tutorme-migration-journal-frozen]].
 */

import { pgTable, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { course } from './course'
import { liveSession } from './live'

/** Status of a proposed session-time change. */
export type RescheduleProposalStatus = 'PENDING' | 'APPLIED' | 'REJECTED' | 'CANCELLED'
/** A single student's response to a proposal. */
export type RescheduleVoteResponse = 'PENDING' | 'AGREE' | 'DISAGREE'

export const sessionRescheduleProposal = pgTable(
  'SessionRescheduleProposal',
  {
    proposalId: text('id').primaryKey().notNull(),
    /** The live session being moved. */
    sessionId: text('sessionId')
      .notNull()
      .references(() => liveSession.sessionId, { onDelete: 'cascade' }),
    /** Course the session belongs to (nullable for course-less sessions). */
    courseId: text('courseId').references(() => course.courseId, { onDelete: 'set null' }),
    /** The tutor who proposed the change. */
    proposedBy: text('proposedBy')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    /** The session's time when the proposal was made (preserved while pending). */
    currentStart: timestamp('currentStart', { withTimezone: true }),
    currentEnd: timestamp('currentEnd', { withTimezone: true }),
    /** The proposed new time. */
    proposedStart: timestamp('proposedStart', { withTimezone: true }).notNull(),
    proposedEnd: timestamp('proposedEnd', { withTimezone: true }).notNull(),
    /** PENDING → APPLIED (all agreed) | REJECTED (a disagree) | CANCELLED (tutor). */
    status: text('status').notNull().default('PENDING').$type<RescheduleProposalStatus>(),
    /** Why it resolved — e.g. 'all_agreed', 'student_disagreed', 'superseded'. */
    resolvedReason: text('resolvedReason'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    resolvedAt: timestamp('resolvedAt', { withTimezone: true }),
  },
  table => ({
    SessionRescheduleProposal_sessionId_idx: index('SessionRescheduleProposal_sessionId_idx').on(
      table.sessionId
    ),
    SessionRescheduleProposal_status_idx: index('SessionRescheduleProposal_status_idx').on(
      table.status
    ),
  })
)

export const sessionRescheduleVote = pgTable(
  'SessionRescheduleVote',
  {
    voteId: text('id').primaryKey().notNull(),
    proposalId: text('proposalId')
      .notNull()
      .references(() => sessionRescheduleProposal.proposalId, { onDelete: 'cascade' }),
    studentId: text('studentId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    response: text('response').notNull().default('PENDING').$type<RescheduleVoteResponse>(),
    respondedAt: timestamp('respondedAt', { withTimezone: true }),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    // One vote per student per proposal.
    SessionRescheduleVote_proposal_student_key: uniqueIndex(
      'SessionRescheduleVote_proposal_student_key'
    ).on(table.proposalId, table.studentId),
    SessionRescheduleVote_proposalId_idx: index('SessionRescheduleVote_proposalId_idx').on(
      table.proposalId
    ),
  })
)
