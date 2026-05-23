import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { getPool } from '@/lib/db/drizzle'
import { user, course, courseEnrollment } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { notify } from '@/lib/notifications/notify'
import { dailyProvider } from '@/lib/video/daily-provider'
import { createSession } from '@/lib/sessions/create-session'
import { findConflicts } from '@/lib/schedule/conflicts'

const SPECIAL_TOKENS = ['kim.kon#26', 'stephen#26'] // fallback token, should match the one in landing page

export const POST = withAuth(
  async (req: NextRequest, { user: currentUser }) => {
    try {
      const { type, courseId, title, trainingToken, targetAudience, trainingCategory } =
        await req.json()

      if (type === 'training') {
        // Verify token
        if (!SPECIAL_TOKENS.includes(trainingToken)) {
          return NextResponse.json({ error: 'Invalid access token' }, { status: 403 })
        }

        let room
        try {
          room = await dailyProvider.createRoom(currentUser.id, {
            maxParticipants: 10,
            durationMinutes: 120,
          })
        } catch (error) {
          console.error('[Start Ad Hoc] Daily.co createRoom error:', error)
          return NextResponse.json(
            { error: 'Video service unavailable. Please try again later.' },
            { status: 503 }
          )
        }

        const { liveSession: created } = await createSession({
          tutorId: currentUser.id,
          title: title || 'Live Training Session',
          scheduledAt: new Date(),
          durationMinutes: 120,
          category: 'Training',
          type: 'ADHOC',
          description: 'Tutor training session',
          status: 'active',
          startedAt: new Date(),
          existingRoom: room,
        })
        const sessionId = created.sessionId

        // Notify tutors based on target audience
        const pool = getPool()
        let targetTutorIds: string[] = []

        if (targetAudience === 'new') {
          // Tutors who have NEVER attended a training session
          const result = await pool.query(
            `SELECT u."id" FROM "User" u
             WHERE u."role" = 'TUTOR'
             AND NOT EXISTS (
               SELECT 1 FROM "TrainingAttendance" ta
               WHERE ta."tutorId" = u."id"
             )`
          )
          targetTutorIds = result.rows.map((r: any) => r.id)
        } else if (targetAudience === 'math') {
          const result = await pool.query(
            `SELECT u."id" FROM "User" u
             JOIN "Profile" p ON u."id" = p."userId"
             WHERE u."role" = 'TUTOR'
             AND EXISTS (
               SELECT 1 FROM unnest(p."subjectsOfInterest") s
               WHERE LOWER(s) LIKE '%math%'
             )`
          )
          targetTutorIds = result.rows.map((r: any) => r.id)
        } else if (targetAudience === 'science') {
          const result = await pool.query(
            `SELECT u."id" FROM "User" u
             JOIN "Profile" p ON u."id" = p."userId"
             WHERE u."role" = 'TUTOR'
             AND EXISTS (
               SELECT 1 FROM unnest(p."subjectsOfInterest") s
               WHERE LOWER(s) LIKE '%science%'
                OR LOWER(s) LIKE '%physics%'
                OR LOWER(s) LIKE '%chemistry%'
                OR LOWER(s) LIKE '%biology%'
             )`
          )
          targetTutorIds = result.rows.map((r: any) => r.id)
        } else if (targetAudience === 'language') {
          const result = await pool.query(
            `SELECT u."id" FROM "User" u
             JOIN "Profile" p ON u."id" = p."userId"
             WHERE u."role" = 'TUTOR'
             AND EXISTS (
               SELECT 1 FROM unnest(p."subjectsOfInterest") s
               WHERE LOWER(s) LIKE '%english%'
                OR LOWER(s) LIKE '%language%'
                OR LOWER(s) LIKE '%literature%'
                OR LOWER(s) LIKE '%ielts%'
                OR LOWER(s) LIKE '%toefl%'
             )`
          )
          targetTutorIds = result.rows.map((r: any) => r.id)
        } else {
          // 'all' or any other value — notify all tutors
          const result = await drizzleDb
            .select({ id: user.userId })
            .from(user)
            .where(eq(user.role, 'TUTOR'))
          targetTutorIds = result.map(r => r.id)
        }

        const notifyPromises = targetTutorIds.map(tutorId =>
          notify({
            userId: tutorId,
            type: 'system',
            title: 'New Training Session Started',
            message: `A new ${trainingCategory || 'orientation'} training session has started!`,
            actionUrl: `/tutor/sessions/${sessionId}`,
          })
        )
        await Promise.allSettled(notifyPromises)

        return NextResponse.json({ success: true, sessionId })
      }

      if (type === 'teaching') {
        if (!courseId) {
          return NextResponse.json(
            { error: 'Course ID is required for teaching sessions' },
            { status: 400 }
          )
        }

        // Check if course is published and has students
        const [courseRecord] = await drizzleDb
          .select()
          .from(course)
          .where(eq(course.courseId, courseId))
          .limit(1)
        if (!courseRecord) {
          return NextResponse.json({ error: 'Course not found' }, { status: 404 })
        }

        const isPublished = courseRecord.isPublished

        // Check for conflicts before starting ad-hoc teaching session
        const sessionStart = new Date()
        const sessionEnd = new Date(sessionStart.getTime() + 120 * 60000) // 120 min default
        const conflicts = await findConflicts(currentUser.id, sessionStart, sessionEnd)
        if (conflicts.length > 0) {
          return NextResponse.json(
            {
              error: 'You have a scheduling conflict. Please end your current session or wait for it to finish before starting a new one.',
              conflicts: conflicts.map(c => ({
                type: c.type,
                title: c.title,
                startTime: c.startTime.toISOString(),
                endTime: c.endTime.toISOString(),
              })),
            },
            { status: 409 }
          )
        }

        let room
        try {
          room = await dailyProvider.createRoom(currentUser.id, {
            maxParticipants: 10,
            durationMinutes: 120,
          })
        } catch (error) {
          console.error('[Start Ad Hoc] Daily.co createRoom error:', error)
          return NextResponse.json(
            { error: 'Video service unavailable. Please try again later.' },
            { status: 503 }
          )
        }

        const { liveSession: created } = await createSession({
          tutorId: currentUser.id,
          title: title || `${courseRecord.name} - Live Session`,
          scheduledAt: new Date(),
          durationMinutes: 120,
          category: Array.isArray(courseRecord.categories)
            ? courseRecord.categories[0] || 'General'
            : 'General',
          type: 'ADHOC',
          courseId,
          status: 'active',
          startedAt: new Date(),
          existingRoom: room,
        })
        const sessionId = created.sessionId

        if (isPublished) {
          // Find enrolled students and notify them
          const enrollments = await drizzleDb
            .select({ studentId: courseEnrollment.studentId })
            .from(courseEnrollment)
            .where(eq(courseEnrollment.courseId, courseId))

          const studentIds = enrollments.map(e => e.studentId).filter(Boolean)
          if (studentIds.length > 0) {
            await Promise.all(
              studentIds.map(studentId =>
                notify({
                  userId: studentId,
                  type: 'class',
                  title: 'Your class is live!',
                  message: `${courseRecord.name} has started. Join now to participate in the live session.`,
                  data: { sessionId, courseId, type: 'session-live' },
                  actionUrl: `/student/feedback?sessionId=${sessionId}`,
                }).catch(() => {})
              )
            )
          }
        }

        return NextResponse.json({ success: true, sessionId })
      }

      return NextResponse.json({ error: 'Invalid session type' }, { status: 400 })
    } catch (error) {
      console.error('Failed to create session:', error)
      const errObj = error as any
      return NextResponse.json(
        { error: errObj?.message || 'Internal server error' },
        { status: 500 }
      )
    }
  },
  { role: 'TUTOR' }
)
