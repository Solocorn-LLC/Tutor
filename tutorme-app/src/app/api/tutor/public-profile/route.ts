import { NextRequest, NextResponse } from 'next/server'
import { eq, and, ne, desc } from 'drizzle-orm'
import { withAuth, withCsrf, ValidationError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, profile, course, tutorApplication } from '@/lib/db/schema'

function normalizeUsername(value: string): string {
  return value
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '')
    .slice(0, 30)
}

export const GET = withAuth(
  async (_req: NextRequest, session) => {
    const tutorId = session.user.id

    const [userRow] = await drizzleDb
      .select({ userId: user.userId, email: user.email, role: user.role })
      .from(user)
      .where(eq(user.userId, tutorId))
      .limit(1)

    if (!userRow) {
      return NextResponse.json({ error: 'Tutor not found' }, { status: 404 })
    }

    const [prof] = await drizzleDb
      .select({
        name: profile.name,
        username: profile.username,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
        credentials: profile.credentials,
        hourlyRate: profile.hourlyRate,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      })
      .from(profile)
      .where(eq(profile.userId, tutorId))
      .limit(1)

    const [application] = await drizzleDb
      .select({
        countryOfResidence: tutorApplication.countryOfResidence,
        socialLinks: tutorApplication.socialLinks,
        createdAt: tutorApplication.createdAt,
      })
      .from(tutorApplication)
      .where(eq(tutorApplication.userId, tutorId))
      .limit(1)

    const courses = await drizzleDb
      .select({
        courseId: course.courseId,
        name: course.name,
        description: course.description,
        categories: course.categories,
        updatedAt: course.updatedAt,
      })
      .from(course)
      .where(and(eq(course.creatorId, tutorId), eq(course.isPublished, true)))
      .orderBy(desc(course.updatedAt))
      .limit(50)

    // Derive specialties from published course categories
    const derivedSpecialties = Array.from(new Set(courses.flatMap(c => c.categories || [])))

    return NextResponse.json({
      profile: {
        name: prof?.name || userRow.email.split('@')[0],
        username: prof?.username ?? null,
        bio: prof?.bio ?? '',
        avatarUrl: prof?.avatarUrl ?? null,
        specialties: derivedSpecialties,
        credentials: prof?.credentials ?? '',
        hourlyRate: prof?.hourlyRate ?? null,
        createdAt: application?.createdAt ?? prof?.createdAt ?? null,
        updatedAt: prof?.updatedAt ?? null,
        country: application?.countryOfResidence ?? null,
        socialLinks: application?.socialLinks ?? null,
        activeCourses: courses.length,
      },
      courses,
    })
  },
  { role: 'TUTOR' }
)

export const PATCH = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
      const tutorId = session.user.id
      const body = await req.json().catch(() => ({}))
      const requestedUsername = typeof body?.username === 'string' ? body.username : ''

      // Bio limit matches the editor's maxLength/counter (800 chars) — reject
      // instead of silently truncating so the tutor knows what was stored.
      const rawBio = typeof body?.bio === 'string' ? body.bio.trim() : undefined
      if (rawBio !== undefined && rawBio.length > 800) {
        throw new ValidationError('Bio must be 800 characters or fewer.')
      }
      const bio = rawBio

      // socialLinks is stored as jsonb and rendered on the public page — bound
      // its shape and size instead of accepting arbitrary blobs.
      let socialLinks: Record<string, string> | undefined
      if (body?.socialLinks !== undefined && body?.socialLinks !== null) {
        if (
          typeof body.socialLinks !== 'object' ||
          Array.isArray(body.socialLinks) ||
          Object.keys(body.socialLinks).length > 10
        ) {
          throw new ValidationError('Invalid social links (max 10 platforms).')
        }
        socialLinks = {}
        for (const [key, value] of Object.entries(body.socialLinks as Record<string, unknown>)) {
          if (typeof value !== 'string') {
            throw new ValidationError('Invalid social link value.')
          }
          socialLinks[String(key).slice(0, 30)] = value.trim().slice(0, 300)
        }
        if (JSON.stringify(socialLinks).length > 4000) {
          throw new ValidationError('Social links are too long.')
        }
      }

      const specialties = Array.isArray(body?.specialties)
        ? body.specialties
            .filter((c: unknown) => typeof c === 'string')
            .map((s: string) => s.trim())
            .filter(Boolean)
            .slice(0, 40)
        : undefined
      const credentials =
        typeof body?.credentials === 'string' ? body.credentials.trim().slice(0, 5000) : undefined
      const normalized = normalizeUsername(requestedUsername)

      const [prof] = await drizzleDb
        .select({
          profileId: profile.profileId,
          userId: profile.userId,
          name: profile.name,
          username: profile.username,
          updatedAt: profile.updatedAt,
        })
        .from(profile)
        .where(eq(profile.userId, tutorId))
        .limit(1)

      if (!prof) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
      }

      // Stale-write guard: the client sends the updatedAt it loaded; if another
      // save landed in between, refuse so one editor's changes aren't silently
      // overwritten by an older form state.
      const expectedUpdatedAt =
        typeof body?.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : null
      if (
        expectedUpdatedAt &&
        prof.updatedAt &&
        expectedUpdatedAt !== prof.updatedAt.toISOString()
      ) {
        return NextResponse.json(
          { error: 'Your profile changed since you loaded it. Refresh and try again.' },
          { status: 409 }
        )
      }

      if (requestedUsername && (!normalized || normalized.length < 3)) {
        return NextResponse.json(
          {
            error: 'Username must be at least 3 characters (letters, numbers, dots, underscores).',
          },
          { status: 400 }
        )
      }

      if (requestedUsername && normalized !== prof.username) {
        const [existing] = await drizzleDb
          .select({ profileId: profile.profileId })
          .from(profile)
          .where(and(eq(profile.username, normalized), ne(profile.userId, tutorId)))
          .limit(1)
        if (existing) {
          return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
        }
      }

      const setPayload: { username?: string; bio?: string } = {}
      if (requestedUsername) setPayload.username = normalized
      if (bio !== undefined) setPayload.bio = bio

      let updated: { username: string | null; bio: string | null; updatedAt: Date } | undefined
      if (Object.keys(setPayload).length > 0) {
        try {
          const [row] = await drizzleDb
            .update(profile)
            .set(setPayload)
            .where(eq(profile.userId, tutorId))
            .returning()
          updated = row
        } catch (err) {
          // A concurrent request may grab the same username between our check
          // and the write — the unique constraint converts that into a clean
          // 409 instead of an unhandled 500.
          if (
            typeof err === 'object' &&
            err !== null &&
            (err as { code?: string }).code === '23505'
          ) {
            return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
          }
          throw err
        }
      }

      if (socialLinks !== undefined) {
        // The row-count is checked so a tutor without an application row gets a
        // real error instead of a success toast that persisted nothing.
        const [appRow] = await drizzleDb
          .update(tutorApplication)
          .set({ socialLinks })
          .where(eq(tutorApplication.userId, tutorId))
          .returning({ userId: tutorApplication.userId })
        if (!appRow) {
          return NextResponse.json(
            { error: 'No tutor application on file — social links cannot be saved.' },
            { status: 400 }
          )
        }
      }

      if (specialties !== undefined || credentials !== undefined) {
        await drizzleDb
          .update(profile)
          .set({
            ...(specialties !== undefined ? { specialties } : {}),
            ...(credentials !== undefined ? { credentials } : {}),
          })
          .where(eq(profile.userId, tutorId))
      }

      return NextResponse.json({
        success: true,
        profile: {
          username: updated?.username ?? prof.username,
          bio: updated?.bio ?? bio ?? null,
          // Echo the row's new updatedAt so the client can keep sending the
          // stale-write guard on subsequent saves.
          updatedAt: updated?.updatedAt ? updated.updatedAt.toISOString() : null,
          ...(specialties !== undefined ? { specialties } : {}),
          ...(credentials !== undefined ? { credentials } : {}),
        },
      })
    },
    { role: 'TUTOR' }
  )
)
