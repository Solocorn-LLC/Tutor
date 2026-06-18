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
import { withAuth, withCsrf, ValidationError, NotFoundError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { dailyProvider } from '@/lib/video/daily-provider'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, sessionParticipant, user, profile, course } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'

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
    if (classSessionRow.roomId) {
      const isOwner = userId === classSessionRow.tutorId
      try {
        token = await dailyProvider.createMeetingToken(classSessionRow.roomId, userId, {
          isOwner,
          durationMinutes: classSessionRow.durationMinutes ?? 120,
        })
      } catch (err: any) {
        console.error('[Join] Daily.co token creation failed:', err?.message)
        // Continue without video token — student can still use directory / chat / whiteboard
      }
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
    if (classSessionRow.courseId) {
      const [courseRow] = await drizzleDb
        .select({ name: course.name })
        .from(course)
        .where(eq(course.courseId, classSessionRow.courseId))
        .limit(1)
      if (courseRow) {
        courseName = courseRow.name
      }
    }

    const participants = await drizzleDb
      .select()
      .from(sessionParticipant)
      .where(eq(sessionParticipant.sessionId, id))

    const classSession = {
      ...classSessionRow,
      tutor: tutorRow ? { profile: tutorProfile } : null,
      course: courseName ? { name: courseName } : null,
      participants,
    }

    return NextResponse.json({
      session: classSession,
      token,
      roomUrl: classSessionRow.roomUrl,
    })
  })
)
