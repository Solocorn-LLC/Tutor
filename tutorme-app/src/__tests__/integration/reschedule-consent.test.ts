/**
 * Integration test: reschedule consent gate (see [[tutorme-reschedule-consent]]).
 *
 * Locks in the state machine the feature depends on:
 *  - propose keeps the session at its OLD time (a PENDING proposal);
 *  - it only moves once EVERY rostered student agrees;
 *  - a single disagree rejects it (session keeps its time);
 *  - a student who leaves without voting can't stall it (departure reconcile).
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import crypto from 'crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  user,
  profile,
  course,
  courseEnrollment,
  liveSession,
  calendarEvent,
  sessionRescheduleProposal,
} from '@/lib/db/schema'
import {
  proposeReschedule,
  respondToProposal,
  reconcileProposalsAfterDeparture,
} from '@/lib/schedule/reschedule-consent'

const stamp = Date.now()
const tutorId = crypto.randomUUID()
const s1 = crypto.randomUUID()
const s2 = crypto.randomUUID()
const s3 = crypto.randomUUID()
const userIds = [tutorId, s1, s2, s3]
const COURSE = `rc_course_${stamp}`
const T0 = new Date('2027-03-01T14:00:00.000Z')
// Distinct proposed time per session so the tutor-level conflict check never collides.
const proposedFor = (n: number) => new Date(Date.UTC(2027, 3, n, 16, 0, 0))

let sc = 0
async function makeSession(): Promise<string> {
  const id = `rc_sess_${stamp}_${++sc}`
  await drizzleDb.insert(liveSession).values({
    sessionId: id,
    tutorId,
    courseId: COURSE,
    title: 'Session',
    category: 'General',
    status: 'scheduled',
    scheduledAt: T0,
    durationMinutes: 60,
  } as never)
  await drizzleDb.insert(calendarEvent).values({
    eventId: `rc_ce_${id}`,
    tutorId,
    title: 'Session',
    type: 'LESSON',
    status: 'CONFIRMED',
    startTime: T0,
    endTime: new Date(T0.getTime() + 3_600_000),
    timezone: 'UTC',
    isAllDay: false,
    isRecurring: false,
    isVirtual: true,
    maxAttendees: 50,
    createdBy: tutorId,
    externalId: id,
    courseId: COURSE,
    isCancelled: false,
  } as never)
  return id
}
const sessionTime = (id: string) =>
  drizzleDb
    .select({ at: liveSession.scheduledAt })
    .from(liveSession)
    .where(eq(liveSession.sessionId, id))
    .then(r => r[0]?.at?.toISOString())
const propStatus = (pid: string) =>
  drizzleDb
    .select({ s: sessionRescheduleProposal.status })
    .from(sessionRescheduleProposal)
    .where(eq(sessionRescheduleProposal.proposalId, pid))
    .then(r => r[0]?.s)

async function propose(sessionId: string, at: Date) {
  const r = await proposeReschedule({
    session: { sessionId, courseId: COURSE, tutorId, title: 'Session' },
    currentStart: T0,
    currentEnd: new Date(T0.getTime() + 3_600_000),
    proposedStart: at,
    proposedEnd: new Date(at.getTime() + 3_600_000),
  })
  return r.kind === 'proposed' ? r.proposalId : ''
}

describe('reschedule consent gate', () => {
  beforeAll(async () => {
    await drizzleDb.insert(user).values(
      userIds.map((id, i) => ({
        userId: id,
        email: `rc-${i}-${stamp}@ex.com`,
        role: i === 0 ? ('TUTOR' as const) : ('STUDENT' as const),
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as never
    )
    await drizzleDb
      .insert(profile)
      .values(
        [s1, s2, s3].map(id => ({ profileId: `rc_p_${id}`, userId: id, timezone: 'UTC' })) as never
      )
    await drizzleDb
      .insert(course)
      .values({ courseId: COURSE, name: 'RC', isPublished: true, creatorId: tutorId } as never)
    await drizzleDb.insert(courseEnrollment).values(
      [s1, s2, s3].map(id => ({
        enrollmentId: `rc_e_${id}`,
        studentId: id,
        courseId: COURSE,
      })) as never
    )
  })

  afterAll(async () => {
    const sessions = (
      await drizzleDb
        .select({ id: liveSession.sessionId })
        .from(liveSession)
        .where(eq(liveSession.tutorId, tutorId))
    ).map(r => r.id)
    if (sessions.length) {
      // proposals cascade to votes on delete
      await drizzleDb
        .delete(sessionRescheduleProposal)
        .where(inArray(sessionRescheduleProposal.sessionId, sessions))
      await drizzleDb.delete(calendarEvent).where(inArray(calendarEvent.externalId, sessions))
      await drizzleDb.delete(liveSession).where(inArray(liveSession.sessionId, sessions))
    }
    await drizzleDb.delete(courseEnrollment).where(eq(courseEnrollment.courseId, COURSE))
    await drizzleDb.delete(course).where(eq(course.courseId, COURSE))
    await drizzleDb.delete(profile).where(inArray(profile.userId, [s1, s2, s3]))
    await drizzleDb.delete(user).where(inArray(user.userId, userIds))
  })

  it('propose keeps the old time; unanimous agreement applies the move', async () => {
    const sess = await makeSession()
    const at = proposedFor(5)
    const pid = await propose(sess, at)
    expect(pid).toBeTruthy()
    expect(await sessionTime(sess)).toBe(T0.toISOString()) // still old while pending

    expect(
      (await respondToProposal({ proposalId: pid, studentId: s1, response: 'AGREE' })).status
    ).toBe('PENDING')
    await respondToProposal({ proposalId: pid, studentId: s2, response: 'AGREE' })
    expect(await sessionTime(sess)).toBe(T0.toISOString()) // still old at 2/3

    expect(
      (await respondToProposal({ proposalId: pid, studentId: s3, response: 'AGREE' })).status
    ).toBe('APPLIED')
    expect(await sessionTime(sess)).toBe(at.toISOString()) // moved
    expect(await propStatus(pid)).toBe('APPLIED')
  })

  it('a single disagree rejects it; the session keeps its time', async () => {
    const sess = await makeSession()
    const pid = await propose(sess, proposedFor(7))
    await respondToProposal({ proposalId: pid, studentId: s1, response: 'AGREE' })
    expect(
      (await respondToProposal({ proposalId: pid, studentId: s2, response: 'DISAGREE' })).status
    ).toBe('REJECTED')
    expect(await sessionTime(sess)).toBe(T0.toISOString())
    expect(await propStatus(pid)).toBe('REJECTED')
    // A closed proposal rejects further votes.
    expect(
      (await respondToProposal({ proposalId: pid, studentId: s3, response: 'AGREE' })).status
    ).toBe('ERROR')
  })

  it("a departed non-voter can't stall it — a later agree reconciles and applies", async () => {
    const sess = await makeSession()
    const at = proposedFor(9)
    const pid = await propose(sess, at) // roster s1,s2,s3
    await respondToProposal({ proposalId: pid, studentId: s1, response: 'AGREE' })
    // s2 leaves without voting; a raw all-agreed check would count its PENDING vote forever.
    await drizzleDb
      .delete(courseEnrollment)
      .where(and(eq(courseEnrollment.studentId, s2), eq(courseEnrollment.courseId, COURSE)))
    const r = await respondToProposal({ proposalId: pid, studentId: s3, response: 'AGREE' })
    expect(r.status).toBe('APPLIED') // s2's stale vote ignored (roster-reconciled)
    expect(await sessionTime(sess)).toBe(at.toISOString())
    // restore s2 for other tests / cleanup symmetry
    await drizzleDb
      .insert(courseEnrollment)
      .values({ enrollmentId: `rc_e2_${s2}`, studentId: s2, courseId: COURSE } as never)
  })

  it('reconcileProposalsAfterDeparture applies a proposal everyone-remaining already agreed to', async () => {
    const sess = await makeSession()
    const at = proposedFor(11)
    const pid = await propose(sess, at)
    await respondToProposal({ proposalId: pid, studentId: s1, response: 'AGREE' })
    await respondToProposal({ proposalId: pid, studentId: s3, response: 'AGREE' }) // s2 still pending
    expect(await propStatus(pid)).toBe('PENDING')
    await drizzleDb
      .delete(courseEnrollment)
      .where(and(eq(courseEnrollment.studentId, s2), eq(courseEnrollment.courseId, COURSE)))
    await reconcileProposalsAfterDeparture(s2, COURSE)
    expect(await propStatus(pid)).toBe('APPLIED')
    expect(await sessionTime(sess)).toBe(at.toISOString())
  })
})
