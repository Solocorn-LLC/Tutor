/**
 * Relationship gate for direct-message conversations.
 *
 * Rules:
 *
 * - student ↔ tutor: requires a completed 1-on-1 booking between them
 *   (a PAID/COMPLETED booking whose scheduled end + grace period has passed)
 *   — enforced at conversation creation; threads opened automatically by the
 *   booking flow keep working
 * - tutor ↔ tutor: requires that they follow each other (mutual TutorFollow)
 *   — enforced at conversation creation AND re-checked on every message send
 *   (api/conversations/[id]/messages), so unfollowing cuts off existing
 *   threads; tutors' conversation lists are also filtered by
 *   canTutorChatWith (confirmed-booking students and mutual follows only)
 * - all other role pairs allowed by the matrix: no extra requirement
 */

import { and, eq, inArray, isNotNull, or } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneBookingRequest, tutorFollow } from '@/lib/db/schema'
import { bookingInstants } from '@/lib/one-on-one/time'
import { canSendDirectMessage, type AppRole } from './permissions'

/** Mirror of the completion grace in lib/one-on-one/complete.ts */
const COMPLETION_GRACE_MS = 60 * 60 * 1000

async function hasCompletedOneOnOneBooking(studentId: string, tutorId: string): Promise<boolean> {
  const now = Date.now()
  const rows = await drizzleDb
    .select({
      requestedDate: oneOnOneBookingRequest.requestedDate,
      startTime: oneOnOneBookingRequest.startTime,
      endTime: oneOnOneBookingRequest.endTime,
      timezone: oneOnOneBookingRequest.timezone,
    })
    .from(oneOnOneBookingRequest)
    .where(
      and(
        eq(oneOnOneBookingRequest.studentId, studentId),
        eq(oneOnOneBookingRequest.tutorId, tutorId),
        inArray(oneOnOneBookingRequest.status, ['PAID', 'COMPLETED']),
        isNotNull(oneOnOneBookingRequest.paidAt)
      )
    )

  // "Completed" is time-based, not attendance-based (same definition the
  // review flow uses): a PAID booking counts once its scheduled end + grace
  // has passed, even if the COMPLETED sweep hasn't flipped the row yet.
  return rows.some(b => {
    const { end } = bookingInstants(b)
    return Number.isFinite(end.getTime()) && end.getTime() + COMPLETION_GRACE_MS < now
  })
}

export async function followEachOther(userAId: string, userBId: string): Promise<boolean> {
  const rows = await drizzleDb
    .select({ followerId: tutorFollow.followerId })
    .from(tutorFollow)
    .where(
      or(
        and(eq(tutorFollow.followerId, userAId), eq(tutorFollow.tutorId, userBId)),
        and(eq(tutorFollow.followerId, userBId), eq(tutorFollow.tutorId, userAId))
      )
    )
  return rows.length === 2
}

/**
 * Any confirmed 1-on-1 booking between the student and tutor (ACCEPTED,
 * PAID, or COMPLETED). Used for chat-list eligibility: a tutor's Chats menu
 * shows students with whom a booking has been agreed, regardless of whether
 * the session has already taken place.
 */
async function hasBookedOneOnOne(studentId: string, tutorId: string): Promise<boolean> {
  const rows = await drizzleDb
    .select({ requestId: oneOnOneBookingRequest.requestId })
    .from(oneOnOneBookingRequest)
    .where(
      and(
        eq(oneOnOneBookingRequest.studentId, studentId),
        eq(oneOnOneBookingRequest.tutorId, tutorId),
        inArray(oneOnOneBookingRequest.status, ['ACCEPTED', 'PAID', 'COMPLETED'])
      )
    )
    .limit(1)
  return rows.length > 0
}

/**
 * Whether a tutor is allowed to see/chat with an existing conversation
 * counterpart: tutors require a mutual follow, students require a confirmed
 * 1-on-1 booking, all other roles pass through.
 */
export async function canTutorChatWith(
  tutorId: string,
  counterpart: { id: string; role: AppRole }
): Promise<boolean> {
  if (counterpart.role === 'TUTOR') return followEachOther(tutorId, counterpart.id)
  if (counterpart.role === 'STUDENT') return hasBookedOneOnOne(counterpart.id, tutorId)
  return true
}

export type ConversationGateResult = { allowed: true } | { allowed: false; reason: string }

export async function canCreateConversation(
  userA: { id: string; role: AppRole },
  userB: { id: string; role: AppRole }
): Promise<ConversationGateResult> {
  if (!canSendDirectMessage(userA.role, userB.role)) {
    return { allowed: false, reason: 'Messaging is not allowed between these roles' }
  }

  const isStudentTutorPair =
    (userA.role === 'STUDENT' && userB.role === 'TUTOR') ||
    (userA.role === 'TUTOR' && userB.role === 'STUDENT')
  if (isStudentTutorPair) {
    const student = userA.role === 'STUDENT' ? userA : userB
    const tutor = userA.role === 'STUDENT' ? userB : userA
    if (!(await hasCompletedOneOnOneBooking(student.id, tutor.id))) {
      return {
        allowed: false,
        reason: 'You can message this tutor once you have completed a 1-on-1 session together',
      }
    }
  } else if (userA.role === 'TUTOR' && userB.role === 'TUTOR') {
    if (!(await followEachOther(userA.id, userB.id))) {
      return {
        allowed: false,
        reason: 'Tutors can message each other only after following each other',
      }
    }
  }

  return { allowed: true }
}
