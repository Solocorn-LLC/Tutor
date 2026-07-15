/**
 * Session reminder scheduler.
 *
 * Periodically finds upcoming live sessions entering a short lead window and
 * sends the tutor AND the course's enrolled students a `reminder` notification
 * via the central notify() service — which writes it to the notification table
 * (so it shows in the bell), pushes it over SSE, and optionally emails /
 * web-pushes.
 *
 * Runs in the long-running custom server (server.ts). It is:
 *  - Idempotent / race-safe: each session is "claimed" with an atomic
 *    `UPDATE ... SET reminderSentAt = now WHERE reminderSentAt IS NULL`, so only
 *    one tick (and one server instance) ever sends a given reminder.
 *  - Resilient to brief sleeps: the lead window is wide, so a session that was
 *    missed while the instance was scaled down is still picked up on the next
 *    tick as long as it hasn't started yet.
 */

import { and, eq, gte, lte, inArray, isNull } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  liveSession,
  courseEnrollment,
  course,
  profile,
  calendarEvent,
  oneOnOneBookingRequest,
  groupSession,
  groupSessionParticipant,
} from '@/lib/db/schema'
import { expandToCourseFamily } from '@/lib/courses/variant-family'
import { notify, notifyMany } from './notify'

/** How far ahead of a session's start to send the reminder. */
const REMINDER_LEAD_MINUTES = 60
/** How often to scan for due reminders. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000
/** Delay the first scan so it doesn't compete with cold-start work. */
const INITIAL_DELAY_MS = 30 * 1000
/** Cap per tick so a backlog can't fan out unbounded work. */
const MAX_PER_TICK = 100

let started = false

/**
 * One scan: claim + notify for every session entering the lead window. Exported
 * for tests; the scheduler calls it on each tick.
 */
export async function runSessionReminderScan(): Promise<void> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60 * 1000)

  const due = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      tutorId: liveSession.tutorId,
      courseId: liveSession.courseId,
      title: liveSession.title,
      scheduledAt: liveSession.scheduledAt,
    })
    .from(liveSession)
    .where(
      and(
        inArray(liveSession.status, ['scheduled', 'preparing']),
        isNull(liveSession.reminderSentAt),
        gte(liveSession.scheduledAt, now),
        lte(liveSession.scheduledAt, windowEnd)
      )
    )
    .limit(MAX_PER_TICK)

  for (const s of due) {
    if (!s.scheduledAt) continue

    // Atomically claim the reminder. Only the worker that flips reminderSentAt
    // from NULL gets to send — prevents duplicates across ticks and instances.
    const claimed = await drizzleDb
      .update(liveSession)
      .set({ reminderSentAt: now })
      .where(and(eq(liveSession.sessionId, s.sessionId), isNull(liveSession.reminderSentAt)))
      .returning({ id: liveSession.sessionId })
    if (claimed.length === 0) continue

    const minutes = Math.max(1, Math.round((s.scheduledAt.getTime() - Date.now()) / 60000))
    const message = `"${s.title}" starts in about ${minutes} minute${minutes === 1 ? '' : 's'}.`

    // Fetch course name and tutor profile for enriched notification data
    const [courseRow] = s.courseId
      ? await drizzleDb
          .select({ name: course.name })
          .from(course)
          .where(eq(course.courseId, s.courseId))
          .limit(1)
      : [null]

    const [tutorProfile] = await drizzleDb
      .select({ name: profile.name, username: profile.username })
      .from(profile)
      .where(eq(profile.userId, s.tutorId))
      .limit(1)

    const data = {
      sessionId: s.sessionId,
      scheduledAt: s.scheduledAt.toISOString(),
      kind: 'session-reminder',
      courseName: courseRow?.name || null,
      tutorName: tutorProfile?.name || null,
      tutorUsername: tutorProfile?.username || null,
    }

    // Tutor reminder.
    try {
      await notify({
        userId: s.tutorId,
        type: 'reminder',
        title: 'Upcoming session',
        message,
        // Course sessions open the course classroom; a course-less session
        // (1-on-1 or group) opens the shared two-way call room, since the course
        // classroom can't host it.
        actionUrl: s.courseId
          ? `/tutor/insights?sessionId=${encodeURIComponent(s.sessionId)}&view=classroom`
          : `/call/${encodeURIComponent(s.sessionId)}`,
        data,
      })
    } catch (err) {
      console.error('[session-reminders] tutor notify failed for session', s.sessionId, err)
    }

    // Enrolled-student reminders (course sessions only). Excludes the tutor in
    // case they're also enrolled, so they don't get two reminders.
    if (s.courseId) {
      try {
        // Expand to the variant family: a session's courseId can be the template
        // while students enrol under the published variant, so a raw match would
        // find nobody and silently skip everyone's reminder.
        const familyIds = await expandToCourseFamily([s.courseId])
        const enrolled = await drizzleDb
          .select({ studentId: courseEnrollment.studentId })
          .from(courseEnrollment)
          .where(inArray(courseEnrollment.courseId, familyIds))
        const studentIds = Array.from(
          new Set(enrolled.map(e => e.studentId).filter(id => id && id !== s.tutorId))
        )
        if (studentIds.length > 0) {
          await notifyMany({
            userIds: studentIds,
            type: 'reminder',
            title: 'Upcoming session',
            message,
            actionUrl: `/student/live/${encodeURIComponent(s.sessionId)}`,
            data,
          })
        }
      } catch (err) {
        console.error('[session-reminders] student notify failed for session', s.sessionId, err)
      }
    } else {
      // 1-on-1 session (no course): remind the PAID student, linked via the
      // calendar event that projects this live session. Only paid bookings are
      // reminded — an accepted-but-unpaid session isn't confirmed.
      try {
        const [oneOnOne] = await drizzleDb
          .select({ studentId: calendarEvent.studentId })
          .from(calendarEvent)
          .innerJoin(
            oneOnOneBookingRequest,
            eq(oneOnOneBookingRequest.calendarEventId, calendarEvent.eventId)
          )
          .where(
            and(
              eq(calendarEvent.externalId, s.sessionId),
              eq(oneOnOneBookingRequest.status, 'PAID')
            )
          )
          .limit(1)
        if (oneOnOne?.studentId && oneOnOne.studentId !== s.tutorId) {
          await notify({
            userId: oneOnOne.studentId,
            type: 'reminder',
            title: 'Upcoming session',
            message,
            // Two-way call room (not the course classroom).
            actionUrl: `/call/${encodeURIComponent(s.sessionId)}`,
            data,
          })
        }
      } catch (err) {
        console.error(
          '[session-reminders] 1-on-1 student notify failed for session',
          s.sessionId,
          err
        )
      }

      // Group session (no course): remind every paid participant.
      try {
        const [gs] = await drizzleDb
          .select({ groupSessionId: groupSession.groupSessionId })
          .from(groupSession)
          .where(eq(groupSession.liveSessionId, s.sessionId))
          .limit(1)
        if (gs) {
          const seats = await drizzleDb
            .select({ studentId: groupSessionParticipant.studentId })
            .from(groupSessionParticipant)
            .where(
              and(
                eq(groupSessionParticipant.groupSessionId, gs.groupSessionId),
                eq(groupSessionParticipant.status, 'PAID')
              )
            )
          const studentIds = Array.from(
            new Set(seats.map(x => x.studentId).filter(id => id && id !== s.tutorId))
          )
          if (studentIds.length > 0) {
            await notifyMany({
              userIds: studentIds,
              type: 'reminder',
              title: 'Upcoming session',
              message,
              actionUrl: `/call/${encodeURIComponent(s.sessionId)}`,
              data,
            })
          }
        }
      } catch (err) {
        console.error('[session-reminders] group notify failed for session', s.sessionId, err)
      }
    }
  }
}

/** Idempotent — starts the periodic scan once per process. */
export function startSessionReminderScheduler(): void {
  if (started) return
  started = true

  const tick = () => {
    void runSessionReminderScan().catch(err =>
      console.error('[session-reminders] tick error:', err)
    )
  }

  setTimeout(tick, INITIAL_DELAY_MS)
  const handle = setInterval(tick, CHECK_INTERVAL_MS)
  // Don't keep the process alive solely for this timer.
  if (typeof handle.unref === 'function') handle.unref()

  console.log('[session-reminders] scheduler started')
}
