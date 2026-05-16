/**
 * GET /api/tutor/courses/[id]/sessions
 * Returns all sessions (live classes) for a specific course,
 * merged with upcoming virtual sessions from the course schedule.
 */

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { eq, and, asc, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession as liveSessionTable, course } from '@/lib/db/schema'
import { generateUpcomingSessions, mergeSessions } from '@/lib/schedule-sessions'

export const GET = withAuth(
  async (req, session, context) => {
    const tutorId = session.user.id

    const courseId = await getParamAsync(context.params, 'id')

    if (!courseId || courseId === 'undefined' || courseId === 'null') {
      return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
    }

    const safeUrl = req.nextUrl?.href || req.url || ''
    const urlObj = new URL(safeUrl, 'http://localhost:3000')
    const statusParam = urlObj.searchParams.get('status')
    const allowedStatuses = statusParam
      ? statusParam
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : ['scheduled', 'active']

    try {
      // Get course schedule
      const [courseRow] = await drizzleDb
        .select({ name: course.name, category: course.categories, schedule: course.schedule })
        .from(course)
        .where(eq(course.courseId, courseId))
        .limit(1)

      const conditions = [
        eq(liveSessionTable.tutorId, tutorId),
        eq(liveSessionTable.courseId, courseId),
      ]

      if (allowedStatuses.length > 0) {
        conditions.push(inArray(liveSessionTable.status, allowedStatuses as any))
      }

      const sessions = await drizzleDb.query.liveSession.findMany({
        where: and(...conditions),
        with: {
          participants: {
            columns: {
              participantId: true,
            },
          },
        },
        orderBy: asc(liveSessionTable.scheduledAt),
      })

      const formattedReal = sessions.map(s => ({
        id: s.sessionId,
        title: s.title,
        category: s.category,
        description: s.description,
        scheduledAt: s.scheduledAt ? new Date(s.scheduledAt).toISOString() : null,
        startedAt: s.startedAt ? new Date(s.startedAt).toISOString() : null,
        endedAt: s.endedAt ? new Date(s.endedAt).toISOString() : null,
        maxStudents: s.maxStudents,
        enrolledStudents: s.participants?.length || 0,
        status: s.status,
        roomUrl: s.roomUrl,
        isVirtual: false,
        durationMinutes: s.durationMinutes ?? 120,
      }))

      // Generate virtual sessions from schedule
      const schedule = (courseRow?.schedule || []) as Array<{
        dayOfWeek: string
        startTime: string
        durationMinutes: number
      }>

      const virtualSessions = generateUpcomingSessions(
        schedule,
        courseRow?.name || 'Class',
        courseRow?.category?.[0] || 'General',
        { count: 12, maxStudents: 50 }
      )

      const merged = mergeSessions(formattedReal, virtualSessions)

      return NextResponse.json({ sessions: merged })
    } catch (err) {
      // Log full error details for debugging
      const errObj = err as any
      console.error('[Tutor Sessions API] Drizzle Error:', {
        message: errObj?.message,
        code: errObj?.code,
        detail: errObj?.detail,
        hint: errObj?.hint,
        position: errObj?.position,
        query: errObj?.query,
        parameters: errObj?.parameters,
        stack: errObj?.stack,
        constructor: err?.constructor?.name,
        allKeys: err ? Object.getOwnPropertyNames(err) : [],
      })

      // Extract the most useful error message
      const pgMessage = errObj?.detail || errObj?.message || 'Database query failed'
      return NextResponse.json({ error: pgMessage, code: errObj?.code || null }, { status: 500 })
    }
  },
  { role: 'TUTOR' }
)
