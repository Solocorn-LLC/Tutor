/**
 * Reschedule / schedule-change notifications.
 *
 * Shared by every path that can move a session or change a course's schedule, so
 * enrolled students are actually told. The audience is resolved through the
 * variant family (a session's `courseId` may be the template OR a published
 * variant, while students enrol under the published id) — without that
 * expansion the recipient lookup silently returns nobody. See
 * [[tutorme-template-vs-published-course-ids]].
 *
 * All functions are best-effort: they never throw into the caller's request.
 */

import { drizzleDb } from '@/lib/db/drizzle'
import { courseEnrollment, sessionParticipant, profile } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { expandToCourseFamily } from '@/lib/courses/variant-family'
import { notify } from '@/lib/notifications/notify'

/** Format an instant in a specific IANA timezone, with the zone labelled. */
export function formatInZone(date: Date, tz: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }
  try {
    return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz }).format(date)
  } catch {
    try {
      return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(date)
    } catch {
      return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`
    }
  }
}

interface Audience {
  userIds: string[]
  tzByUser: Map<string, string | null>
}

/**
 * Everyone who should hear about a change to this course/session: enrolled
 * students (across the whole variant family) plus anyone already added as a
 * session participant, with each user's own timezone for localized formatting.
 */
async function resolveAudience(
  courseId?: string | null,
  sessionId?: string | null
): Promise<Audience> {
  const ids = new Set<string>()

  if (courseId) {
    const familyIds = await expandToCourseFamily([courseId])
    const enrolled = await drizzleDb
      .select({ studentId: courseEnrollment.studentId })
      .from(courseEnrollment)
      .where(inArray(courseEnrollment.courseId, familyIds))
    for (const r of enrolled) if (r.studentId) ids.add(r.studentId)
  }

  if (sessionId) {
    const participants = await drizzleDb
      .select({ studentId: sessionParticipant.studentId })
      .from(sessionParticipant)
      .where(eq(sessionParticipant.sessionId, sessionId))
    for (const r of participants) if (r.studentId) ids.add(r.studentId)
  }

  const userIds = [...ids]
  if (userIds.length === 0) return { userIds, tzByUser: new Map() }

  const tzRows = await drizzleDb
    .select({ userId: profile.userId, timezone: profile.timezone })
    .from(profile)
    .where(inArray(profile.userId, userIds))
  return { userIds, tzByUser: new Map(tzRows.map(r => [r.userId, r.timezone])) }
}

/**
 * Notify every student that a specific session was moved to `newStart`.
 * Returns the number of students notified (0 = no roster / audience empty).
 */
export async function notifyStudentsOfReschedule(opts: {
  sessionId: string
  courseId?: string | null
  title: string | null
  newStart: Date
  timezone?: string | null
}): Promise<number> {
  try {
    const { sessionId, courseId, title, newStart, timezone } = opts
    const { userIds, tzByUser } = await resolveAudience(courseId, sessionId)
    if (userIds.length === 0) return 0

    const fallbackTz = timezone || 'UTC'
    const name = title || 'Your session'
    const actionUrl = courseId ? `/student/classroom/${courseId}` : '/student/schedule'

    await Promise.allSettled(
      userIds.map(userId => {
        const when = formatInZone(newStart, tzByUser.get(userId) || fallbackTz)
        return notify({
          userId,
          type: 'class',
          title: 'Session rescheduled',
          message: `"${name}" has been moved to ${when}.`,
          data: { sessionId, scheduledAt: newStart.toISOString() },
          actionUrl,
        })
      })
    )
    return userIds.length
  } catch (err) {
    console.warn('[reschedule] student notification failed (non-critical):', err)
    return 0
  }
}

/**
 * Notify every enrolled student that a course's recurring schedule changed.
 * Used by the course-schedule editor, which has no single "new time" to show —
 * it points students at their sessions to review the update.
 */
export async function notifyStudentsOfScheduleChange(opts: {
  courseId: string
  courseName?: string | null
}): Promise<number> {
  try {
    const { courseId, courseName } = opts
    const { userIds } = await resolveAudience(courseId)
    if (userIds.length === 0) return 0

    const name = courseName || 'your course'
    await Promise.allSettled(
      userIds.map(userId =>
        notify({
          userId,
          type: 'class',
          title: 'Class schedule updated',
          message: `The schedule for "${name}" has changed. Check your sessions for the new times.`,
          data: { courseId },
          actionUrl: `/student/classroom/${courseId}`,
        })
      )
    )
    return userIds.length
  } catch (err) {
    console.warn('[schedule-change] student notification failed (non-critical):', err)
    return 0
  }
}
