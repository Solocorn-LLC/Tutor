/**
 * Join Class Room API
 * Generates meeting token for students to join a class session
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, ValidationError, NotFoundError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { dailyProvider } from '@/lib/video/daily-provider'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, sessionParticipant, user, profile, course } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export const POST = withCsrf(
  withAuth(async (req: NextRequest, session, context) => {
    const id = await getParamAsync(context?.params, 'id')
    if (!id) {
      throw new ValidationError('Session ID required')
    }

    const [classSessionRow] = await drizzleDb
      .select()
      .from(liveSession)
      .where(eq(liveSession.sessionId, id))
      .limit(1)

    if (!classSessionRow) {
      throw new NotFoundError('Class session not found')
    }

    if (classSessionRow.status !== 'active') {
      if (classSessionRow.status === 'scheduled') {
        if (!classSessionRow.scheduledAt) {
          throw new ValidationError('Scheduled session has no scheduled time')
        }
        const scheduledAtMs = new Date(
          classSessionRow.scheduledAt as string | number | Date
        ).getTime()
        const enterOpensAtMs = scheduledAtMs - 20 * 60 * 1000
        const nowMs = Date.now()
        if (nowMs < enterOpensAtMs) {
          throw new ValidationError(
            `This session starts at ${new Date(scheduledAtMs).toLocaleString()}. You can enter 20 minutes before. Please come back at ${new Date(enterOpensAtMs).toLocaleString()}.`
          )
        }
      } else {
        throw new ValidationError('Class session is not active')
      }
    }

    const participants = await drizzleDb
      .select()
      .from(sessionParticipant)
      .where(eq(sessionParticipant.sessionId, id))

    if (participants.length >= classSessionRow.maxStudents) {
      throw new ValidationError('Class session is full')
    }

    let token = null
    if (classSessionRow.roomId) {
      const isOwner = session.user.id === classSessionRow.tutorId
      const sessionDuration = classSessionRow.durationMinutes ?? 120
      try {
        token = await dailyProvider.createMeetingToken(classSessionRow.roomId, session.user.id, {
          isOwner,
          durationMinutes: sessionDuration,
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

    const classSession = {
      ...classSessionRow,
      tutor: tutorRow ? { profile: tutorProfile } : null,
      course: courseName ? { name: courseName } : null,
      participants,
    }

    // Prevent tutors from joining as students
    if (session.user.id === classSessionRow.tutorId) {
      return NextResponse.json({
        session: classSession,
        token,
        roomUrl: classSessionRow.roomUrl,
      })
    }

    const [existingParticipant] = await drizzleDb
      .select()
      .from(sessionParticipant)
      .where(
        and(eq(sessionParticipant.sessionId, id), eq(sessionParticipant.studentId, session.user.id))
      )
      .limit(1)

    if (!existingParticipant) {
      await drizzleDb.insert(sessionParticipant).values({
        participantId: crypto.randomUUID(),
        sessionId: id,
        studentId: session.user.id,
        joinedAt: new Date(),
      })
    }

    return NextResponse.json({
      session: classSession,
      token,
      roomUrl: classSessionRow.roomUrl,
    })
  })
)
