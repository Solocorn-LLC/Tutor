/**
 * API endpoint to get tutors by subject
 * GET /api/tutors/by-subject?subject=math
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { getServerSession, authOptions } from '@/lib/auth'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, profile, liveSession, sessionParticipant, tutorApplication } from '@/lib/db/schema'
import { eq, and, ilike, inArray, sql } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions, request)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const subjectCode = searchParams.get('subject')

    if (!subjectCode) {
      return NextResponse.json({ error: 'Subject code required' }, { status: 400 })
    }

    const tutorIdsWithSubject = await drizzleDb
      .selectDistinct({ tutorId: liveSession.tutorId })
      .from(liveSession)
      .where(ilike(liveSession.category, subjectCode))
      .limit(500)
    const tutorIds = tutorIdsWithSubject.map(r => r.tutorId).filter(Boolean)
    if (tutorIds.length === 0) {
      return NextResponse.json({ tutors: [] })
    }

    const users = await drizzleDb
      .select({ userId: user.userId, handle: user.handle })
      .from(user)
      .where(and(eq(user.role, 'TUTOR'), inArray(user.userId, tutorIds)))
      .limit(20)
    const userIds = users.map(u => u.userId)
    if (userIds.length === 0) {
      return NextResponse.json({ tutors: [] })
    }

    const profiles = await drizzleDb
      .select({
        userId: profile.userId,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        bio: profile.bio,
      })
      .from(profile)
      .where(inArray(profile.userId, userIds))
    const profileByUserId = new Map(profiles.map(p => [p.userId, p]))

    const tutorApps = await drizzleDb
      .select({
        userId: tutorApplication.userId,
        categories: tutorApplication.categories,
        tutoringCountries: tutorApplication.tutoringCountries,
      })
      .from(tutorApplication)
      .where(inArray(tutorApplication.userId, userIds))
    const tutorAppByUserId = new Map(tutorApps.map(a => [a.userId, a]))

    const completedSessions = await drizzleDb
      .select({ sessionId: liveSession.sessionId, tutorId: liveSession.tutorId })
      .from(liveSession)
      .where(and(ilike(liveSession.category, subjectCode), eq(liveSession.status, 'ended')))
    const sessionIds = completedSessions.map(s => s.sessionId)
    const participantCounts =
      sessionIds.length > 0
        ? await drizzleDb
            .select({
              sessionId: sessionParticipant.sessionId,
              count: sql<number>`count(*)::int`,
            })
            .from(sessionParticipant)
            .where(inArray(sessionParticipant.sessionId, sessionIds))
            .groupBy(sessionParticipant.sessionId)
        : []
    const countBySessionId = new Map(participantCounts.map(r => [r.sessionId, r.count]))
    const tutorTotalStudents = new Map<string, number>()
    for (const s of completedSessions) {
      const total = tutorTotalStudents.get(s.tutorId) ?? 0
      tutorTotalStudents.set(s.tutorId, total + (countBySessionId.get(s.sessionId) ?? 0))
    }
    const tutorSessionCount = new Map<string, number>()
    for (const s of completedSessions) {
      tutorSessionCount.set(s.tutorId, (tutorSessionCount.get(s.tutorId) ?? 0) + 1)
    }

    const userMap = new Map(users.map(u => [u.userId, u]))

    const formattedTutors = userIds.map(userId => {
      const p = profileByUserId.get(userId)
      const u = userMap.get(userId)
      const app = tutorAppByUserId.get(userId)
      const appCategories = Array.isArray(app?.categories) ? app.categories : []
      const appCountries = Array.isArray(app?.tutoringCountries) ? app.tutoringCountries : []
      return {
        id: userId,
        username: u?.handle ?? userId,
        name: p?.name ?? 'Unknown Tutor',
        avatar: p?.avatarUrl ?? null,
        bio: p?.bio ?? `Experienced ${subjectCode} tutor`,
        rating: 0,
        reviewCount: 0,
        hourlyRate: null,
        currency: 'SGD',
        nextAvailableSlot: null,
        totalStudents: tutorTotalStudents.get(userId) ?? 0,
        totalClasses: tutorSessionCount.get(userId) ?? 0,
        specialties: appCategories,
        countries: appCountries,
      }
    })

    formattedTutors.sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating
      return (b.totalStudents ?? 0) - (a.totalStudents ?? 0)
    })

    return NextResponse.json({ tutors: formattedTutors })
  } catch (error) {
    console.error('Error fetching tutors:', error)
    return handleApiError(error, 'Failed to fetch tutors', 'api/tutors/by-subject/route.ts')
  }
}
