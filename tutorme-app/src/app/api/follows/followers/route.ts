import { NextResponse } from 'next/server'
import { and, eq, ne } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { tutorFollow, user, profile } from '@/lib/db/schema'

/**
 * GET /api/follows/followers — the people who follow the current user (i.e. a tutor's
 * followers). Mirror of /api/follows/list (which returns who the current user follows).
 * Students are excluded: the Followers menu is a tutor↔tutor surface.
 */
export const GET = withAuth(async (_req, session) => {
  const tutorId = session.user.id

  const followers = await drizzleDb
    .select({
      id: user.userId,
      name: profile.name,
      handle: user.handle,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
    })
    .from(tutorFollow)
    .innerJoin(user, eq(tutorFollow.followerId, user.userId))
    .leftJoin(profile, eq(user.userId, profile.userId))
    .where(and(eq(tutorFollow.tutorId, tutorId), ne(user.role, 'STUDENT')))
    .orderBy(tutorFollow.createdAt)

  return NextResponse.json({ followers, count: followers.length })
})
