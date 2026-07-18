import { and, eq, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, courseEnrollment, sessionParticipant } from '@/lib/db/schema'
import { expandToCourseFamily } from '@/lib/courses/variant-family'

/**
 * May this student be a live participant of `sessionId`?
 *
 * Mirrors the HTTP room-join authorization so the socket layer and the HTTP layer
 * never disagree:
 *  - a course-linked session accepts an ENROLLED student — matched across the whole
 *    template↔published variant family (a raw courseId match would wrongly reject a
 *    student enrolled under a sibling variant) — OR a booking-seat holder
 *    (`SessionParticipant`, how 1-on-1/group attendees join);
 *  - a course-less session gates on neither.
 *
 * The participant branch is what lets a 1-on-1/group attendee appear in the tutor's
 * roster and submit tasks — without it a legitimate participant is left in the socket
 * room (whiteboard works) but never tracked in `room.students`.
 */
export async function authorizeSessionStudent(userId: string, sessionId: string): Promise<boolean> {
  if (!userId || !sessionId) return false

  const [ls] = await drizzleDb
    .select({ courseId: liveSession.courseId })
    .from(liveSession)
    .where(eq(liveSession.sessionId, sessionId))
    .limit(1)
  // No course to gate on (course-less session, or no such session) → not rejected,
  // matching the original join gate. Course-linked sessions fall through to the
  // enrollment / participant checks below.
  if (!ls?.courseId) return true

  const family = await expandToCourseFamily([ls.courseId])
  const [enrolled] = await drizzleDb
    .select({ studentId: courseEnrollment.studentId })
    .from(courseEnrollment)
    .where(and(eq(courseEnrollment.studentId, userId), inArray(courseEnrollment.courseId, family)))
    .limit(1)
  if (enrolled) return true

  const [participant] = await drizzleDb
    .select({ id: sessionParticipant.participantId })
    .from(sessionParticipant)
    .where(
      and(eq(sessionParticipant.sessionId, sessionId), eq(sessionParticipant.studentId, userId))
    )
    .limit(1)
  return !!participant
}
