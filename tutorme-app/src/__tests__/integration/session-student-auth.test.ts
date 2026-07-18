import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import crypto from 'crypto'
import { eq, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, course, liveSession, courseEnrollment, sessionParticipant } from '@/lib/db/schema'
import { authorizeSessionStudent } from '@/lib/live/session-student-auth'

/**
 * Regression guard for #1197/#1198: a 1-on-1/group attendee joins a session via a
 * SessionParticipant seat, NOT courseEnrollment. The socket join gate must accept
 * that seat — otherwise the participant is silently dropped from the room roster
 * (empty Monitor/Boards) AND cannot submit tasks (task:complete gates on being in
 * room.students). This locks the enrolled-OR-participant authorization.
 */
const sfx = crypto.randomUUID().slice(0, 8)
const tutorId = `t-auth-${sfx}`
const enrolledStudent = `s-enr-${sfx}`
const participantStudent = `s-part-${sfx}`
const outsiderStudent = `s-out-${sfx}`
const courseId = `c-auth-${sfx}`
const courseSession = `sess-course-${sfx}`
const courselessSession = `sess-none-${sfx}`

describe('authorizeSessionStudent (integration)', () => {
  beforeAll(async () => {
    const now = new Date()
    await drizzleDb.insert(user).values(
      [tutorId, enrolledStudent, participantStudent, outsiderStudent].map((id, i) => ({
        userId: id,
        email: `${id}@example.test`,
        role: i === 0 ? ('TUTOR' as const) : ('STUDENT' as const),
        createdAt: now,
        updatedAt: now,
      }))
    )
    await drizzleDb
      .insert(course)
      .values({ courseId, name: `Auth Course ${sfx}`, creatorId: tutorId })
    await drizzleDb.insert(liveSession).values([
      {
        sessionId: courseSession,
        tutorId,
        courseId,
        title: 'Course-linked',
        category: 'general',
        status: 'active',
        scheduledAt: now,
      },
      {
        sessionId: courselessSession,
        tutorId,
        courseId: null,
        title: 'Course-less',
        category: 'general',
        status: 'active',
        scheduledAt: now,
      },
    ])
    await drizzleDb.insert(courseEnrollment).values({
      enrollmentId: `enr-${sfx}`,
      studentId: enrolledStudent,
      courseId,
    })
    await drizzleDb.insert(sessionParticipant).values({
      participantId: `part-${sfx}`,
      sessionId: courseSession,
      studentId: participantStudent,
    })
  })

  afterAll(async () => {
    await drizzleDb
      .delete(sessionParticipant)
      .where(eq(sessionParticipant.sessionId, courseSession))
    await drizzleDb.delete(courseEnrollment).where(eq(courseEnrollment.courseId, courseId))
    await drizzleDb
      .delete(liveSession)
      .where(inArray(liveSession.sessionId, [courseSession, courselessSession]))
    await drizzleDb.delete(course).where(eq(course.courseId, courseId))
    await drizzleDb
      .delete(user)
      .where(inArray(user.userId, [tutorId, enrolledStudent, participantStudent, outsiderStudent]))
  })

  it('authorizes an ENROLLED student on a course-linked session', async () => {
    expect(await authorizeSessionStudent(enrolledStudent, courseSession)).toBe(true)
  })

  it('authorizes a SessionParticipant (booking seat) who is NOT enrolled', async () => {
    expect(await authorizeSessionStudent(participantStudent, courseSession)).toBe(true)
  })

  it('rejects a student who is neither enrolled nor a participant', async () => {
    expect(await authorizeSessionStudent(outsiderStudent, courseSession)).toBe(false)
  })

  it('authorizes anyone on a course-less session (no enrollment gate)', async () => {
    expect(await authorizeSessionStudent(outsiderStudent, courselessSession)).toBe(true)
  })

  it('rejects empty inputs', async () => {
    expect(await authorizeSessionStudent('', courseSession)).toBe(false)
    expect(await authorizeSessionStudent(enrolledStudent, '')).toBe(false)
  })
})
