import { NextRequest, NextResponse } from 'next/server'
import { eq, and, ne, desc } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, profile, course, tutorApplication } from '@/lib/db/schema'
import { nanoid } from 'nanoid'

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

async function generateUniqueUsername(preferredSeed: string, tutorId: string): Promise<string> {
  const seed = normalizeUsername(preferredSeed) || `tutor${nanoid(6).toLowerCase()}`
  const base = seed.slice(0, 24)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = attempt === 0 ? '' : String(Math.floor(Math.random() * 9000) + 1000)
    const candidate = `${base}${suffix}`.slice(0, 30)
    const [existing] = await drizzleDb
      .select({ profileId: profile.profileId })
      .from(profile)
      .where(and(eq(profile.username, candidate), ne(profile.userId, tutorId)))
      .limit(1)
    if (!existing) return candidate
  }
  return `tutor${nanoid(8).toLowerCase()}`
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
        country: application?.countryOfResidence ?? null,
        categories: derivedSpecialties,
        socialLinks: application?.socialLinks ?? null,
        activeCourses: courses.length,
      },
      courses,
    })
  },
  { role: 'TUTOR' }
)

export const PATCH = withAuth(
  async (req: NextRequest, session) => {
    const tutorId = session.user.id
    const body = await req.json().catch(() => ({}))
    const requestedUsername = typeof body?.username === 'string' ? body.username : ''
    const bio = typeof body?.bio === 'string' ? body.bio.trim().slice(0, 500) : undefined
    const socialLinks =
      body?.socialLinks && typeof body.socialLinks === 'object' ? body.socialLinks : undefined
    const categories = Array.isArray(body?.categories)
      ? body.categories.filter((c: unknown) => typeof c === 'string')
      : undefined
    const specialties = Array.isArray(body?.specialties)
      ? body.specialties
          .filter((c: unknown) => typeof c === 'string')
          .map((s: string) => s.trim())
          .filter(Boolean)
          .slice(0, 40)
      : undefined
    const credentials =
      typeof body?.credentials === 'string' ? body.credentials.trim().slice(0, 5000) : undefined
    let normalized = normalizeUsername(requestedUsername)

    const [prof] = await drizzleDb
      .select({
        profileId: profile.profileId,
        userId: profile.userId,
        name: profile.name,
        username: profile.username,
      })
      .from(profile)
      .where(eq(profile.userId, tutorId))
      .limit(1)

    if (!prof) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (requestedUsername) {
      if (!normalized || normalized.length < 3) {
        normalized = await generateUniqueUsername(
          prof.name || session.user.email || 'tutor',
          tutorId
        )
      }

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

    let updated: { username: string | null; bio: string | null } | undefined
    if (Object.keys(setPayload).length > 0) {
      const [row] = await drizzleDb
        .update(profile)
        .set(setPayload)
        .where(eq(profile.userId, tutorId))
        .returning()
      updated = row
    }

    if (socialLinks || categories) {
      await drizzleDb
        .update(tutorApplication)
        .set({
          ...(socialLinks ? { socialLinks } : {}),
          ...(categories ? { categories } : {}),
        })
        .where(eq(tutorApplication.userId, tutorId))
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
      profile: updated
        ? {
            username: updated.username,
            bio: updated.bio,
            categories,
            ...(specialties !== undefined ? { specialties } : {}),
            ...(credentials !== undefined ? { credentials } : {}),
          }
        : {
            username: prof?.username ?? normalized,
            bio: bio ?? null,
            categories,
            ...(specialties !== undefined ? { specialties } : {}),
            ...(credentials !== undefined ? { credentials } : {}),
          },
    })
  },
  { role: 'TUTOR' }
)
