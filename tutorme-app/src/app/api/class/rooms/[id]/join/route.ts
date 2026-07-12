/**
 * Join Class Room API
 * Generates a meeting token for a student (or the tutor) to join a class session.
 *
 * Gating, capacity enforcement, tutor-start promotion and participant creation all
 * happen inside a single row-locked transaction so concurrent joins cannot exceed
 * maxStudents and the session's status/startedAt stay consistent with who is in the
 * room (the tutor entering a scheduled session promotes it to active).
 */

import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { withAuth, withCsrf, ValidationError, NotFoundError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { dailyProvider } from '@/lib/video/daily-provider'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  liveSession,
  sessionParticipant,
  user,
  profile,
  course,
  courseSchedule,
  courseVariant,
  oneOnOneBookingRequest,
  calendarEvent,
} from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { formatScheduleName } from '@/lib/sessions/schedule-name'
import { formatCourseVariantName } from '@/lib/courses/variant-name'

const EARLY_ENTRY_MS = 20 * 60 * 1000 // students may enter 20 min before scheduledAt

export const POST = withCsrf(
  withAuth(async (req: NextRequest, session, context) => {
    const id = await getParamAsync(context?.params, 'id')
    if (!id) {
      throw new ValidationError('Session ID required')
    }
    const userId = session.user.id

    const classSessionRow = await drizzleDb.transaction(async tx => {
      const [row] = await tx
        .select()
        .from(liveSession)
        .where(eq(liveSession.sessionId, id))
        .limit(1)
        .for('update')

      if (!row) {
        throw new NotFoundError('Class session not found')
      }

      const isTutor = userId === row.tutorId

      // Status gate: must be active, or scheduled within the early-entry window.
      if (row.status !== 'active') {
        if (row.status === 'scheduled') {
          if (!row.scheduledAt) {
            throw new ValidationError('Scheduled session has no scheduled time')
          }
          const scheduledAtMs = new Date(row.scheduledAt as string | number | Date).getTime()
          const enterOpensAtMs = scheduledAtMs - EARLY_ENTRY_MS
          // The tutor may always enter (and thereby start) their session early.
          if (!isTutor && Date.now() < enterOpensAtMs) {
            throw new ValidationError(
              `This session starts at ${new Date(scheduledAtMs).toLocaleString()}. You can enter 20 minutes before. Please come back at ${new Date(enterOpensAtMs).toLocaleString()}.`
            )
          }
        } else {
          throw new ValidationError('Class session is not active')
        }
      }

      // The tutor entering a scheduled session starts it — keep status/startedAt
      // consistent with the room instead of relying on a separate "start" call.
      let effectiveStatus = row.status
      let effectiveStartedAt: Date | null = row.startedAt as Date | null
      if (isTutor && row.status === 'scheduled') {
        effectiveStartedAt = new Date()
        effectiveStatus = 'active'
        await tx
          .update(liveSession)
          .set({ status: 'active', startedAt: effectiveStartedAt })
          .where(eq(liveSession.sessionId, id))
      }

      // Students get an atomic, capacity-checked participant row.
      if (!isTutor) {
        const [existing] = await tx
          .select({ participantId: sessionParticipant.participantId })
          .from(sessionParticipant)
          .where(
            and(eq(sessionParticipant.sessionId, id), eq(sessionParticipant.studentId, userId))
          )
          .limit(1)

        if (!existing) {
          // If this session is a 1-on-1 (has 1-on-1 booking(s) linked to its
          // calendar event), it's private — only its booked student may take a
          // seat. Other session kinds (course classes, ad-hoc, group — where paid
          // seats already inserted a participant row above) keep their existing
          // join behaviour, so this can't lock anyone else out.
          const bookings = await tx
            .select({
              studentId: oneOnOneBookingRequest.studentId,
              status: oneOnOneBookingRequest.status,
            })
            .from(oneOnOneBookingRequest)
            .innerJoin(
              calendarEvent,
              eq(calendarEvent.eventId, oneOnOneBookingRequest.calendarEventId)
            )
            .where(eq(calendarEvent.externalId, id))
          if (bookings.length > 0) {
            const allowed = bookings.some(
              b => b.studentId === userId && ['ACCEPTED', 'PAID'].includes(b.status)
            )
            if (!allowed) {
              throw new ValidationError('You are not a participant in this session.')
            }
          }

          const [{ count }] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(sessionParticipant)
            .where(eq(sessionParticipant.sessionId, id))

          if (count >= row.maxStudents) {
            throw new ValidationError('Class session is full')
          }

          await tx.insert(sessionParticipant).values({
            participantId: crypto.randomUUID(),
            sessionId: id,
            studentId: userId,
            joinedAt: new Date(),
          })
        }
      }

      return { ...row, status: effectiveStatus, startedAt: effectiveStartedAt }
    })

    let token = null
    // Surfaced to the client so a video-token failure is visible (chat/whiteboard
    // still work) instead of being silently swallowed into a generic join failure.
    let videoError: string | null = null
    // The room URL handed to the client; refreshed below if the original room has
    // expired and we recreate it.
    let roomUrl = classSessionRow.roomUrl
    if (classSessionRow.roomId) {
      const isOwner = userId === classSessionRow.tutorId

      // Rooms expire (durationMinutes + 60m buffer). A session rejoined after that
      // would hit a dead room and fail every time. If the room is gone, recreate it
      // once and persist the new room on the session so everyone lands in the same
      // fresh room. The compare-and-set on roomId keeps concurrent joins from
      // recreating it more than once.
      let activeRoomId = classSessionRow.roomId
      try {
        const roomLive = await dailyProvider.isRoomActive(classSessionRow.roomId)
        if (!roomLive) {
          const fresh = await dailyProvider.createRoom(classSessionRow.tutorId, {
            maxParticipants: Math.min((classSessionRow.maxStudents ?? 9) + 1, 50),
            durationMinutes: classSessionRow.durationMinutes ?? 120,
          })
          const updated = await drizzleDb
            .update(liveSession)
            .set({ roomId: fresh.id, roomUrl: fresh.url })
            .where(
              and(eq(liveSession.sessionId, id), eq(liveSession.roomId, classSessionRow.roomId))
            )
            .returning({ roomId: liveSession.roomId, roomUrl: liveSession.roomUrl })

          if (updated.length > 0) {
            activeRoomId = fresh.id
            roomUrl = fresh.url
          } else {
            // A concurrent join already recreated the room — use theirs and drop the
            // extra room we just made so it doesn't linger.
            const [current] = await drizzleDb
              .select({ roomId: liveSession.roomId, roomUrl: liveSession.roomUrl })
              .from(liveSession)
              .where(eq(liveSession.sessionId, id))
              .limit(1)
            if (current?.roomId) {
              activeRoomId = current.roomId
              roomUrl = current.roomUrl
            }
            dailyProvider.deleteRoom(fresh.id).catch(() => {})
          }
        }
      } catch (err: any) {
        console.error('[Join] room re-check/recreate failed:', err?.message)
        Sentry.captureException(err instanceof Error ? err : new Error(String(err?.message)), {
          tags: { feature: 'live-video', phase: 'room-recreate' },
          extra: { sessionId: id, roomId: classSessionRow.roomId },
        })
        // Fall through with the existing room; the token step below surfaces errors.
      }

      try {
        token = await dailyProvider.createMeetingToken(activeRoomId, userId, {
          isOwner,
          durationMinutes: classSessionRow.durationMinutes ?? 120,
          // 1-on-1 sessions (capacity 2) are two-way: the student transmits too.
          twoWay: (classSessionRow.maxStudents ?? 0) <= 2,
        })
      } catch (err: any) {
        console.error('[Join] Daily.co token creation failed:', err?.message)
        Sentry.captureException(err instanceof Error ? err : new Error(String(err?.message)), {
          tags: { feature: 'live-video', phase: 'token-create' },
          extra: { sessionId: id },
        })
        videoError = 'Video is temporarily unavailable for this session.'
      }
    } else {
      videoError = 'No video room is configured for this session.'
    }

    const [tutorRow] = await drizzleDb
      .select()
      .from(user)
      .where(eq(user.userId, classSessionRow.tutorId))
      .limit(1)
    const [tutorProfile] = tutorRow
      ? await drizzleDb
          .select({ name: profile.name, avatarUrl: profile.avatarUrl })
          .from(profile)
          .where(eq(profile.userId, classSessionRow.tutorId))
          .limit(1)
      : [null]

    let courseName = null
    let variantName: string | null = null
    if (classSessionRow.courseId) {
      const [courseRow] = await drizzleDb
        .select({ name: course.name })
        .from(course)
        .where(eq(course.courseId, classSessionRow.courseId))
        .limit(1)
      if (courseRow) {
        courseName = courseRow.name
      }
      // The session's courseId is the published variant; resolve its
      // category × nationality label (e.g. "Mathematics — Hong Kong").
      const [variantRow] = await drizzleDb
        .select({ category: courseVariant.category, nationality: courseVariant.nationality })
        .from(courseVariant)
        .where(eq(courseVariant.publishedCourseId, classSessionRow.courseId))
        .limit(1)
      if (variantRow) {
        variantName = formatCourseVariantName(variantRow.category, variantRow.nationality)
      }
    }

    let scheduleName: string | null = null
    if (classSessionRow.scheduleId) {
      const [scheduleRow] = await drizzleDb
        .select({ name: courseSchedule.name, scheduleIndex: courseSchedule.scheduleIndex })
        .from(courseSchedule)
        .where(eq(courseSchedule.scheduleId, classSessionRow.scheduleId))
        .limit(1)
      if (scheduleRow) {
        scheduleName = formatScheduleName(scheduleRow.name, scheduleRow.scheduleIndex)
      }
    }

    const participants = await drizzleDb
      .select()
      .from(sessionParticipant)
      .where(eq(sessionParticipant.sessionId, id))

    const classSession = {
      ...classSessionRow,
      roomUrl,
      tutor: tutorRow ? { profile: tutorProfile } : null,
      course: courseName ? { name: courseName } : null,
      variantName,
      scheduleName,
      participants,
    }

    return NextResponse.json({
      session: classSession,
      token,
      roomUrl,
      videoError,
      // 1-on-1 (capacity 2) → the client renders two-way video.
      twoWay: (classSessionRow.maxStudents ?? 0) <= 2,
    })
  })
)
