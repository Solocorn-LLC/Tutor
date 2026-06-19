/**
 * Public API to get a single tutor by username
 * GET /api/public/tutors/[username]
 */

import { NextRequest, NextResponse } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  course,
  user,
  profile,
  courseLesson,
  courseVariant,
  tutorApplication,
} from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params
    const normalizedUsername = username.toLowerCase().trim()

    if (!normalizedUsername) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }

    // Find tutor by username (from profile)
    let profileData = await drizzleDb
      .select({
        userId: profile.userId,
        name: profile.name,
        username: profile.username,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
        hourlyRate: profile.hourlyRate,
        oneOnOneEnabled: profile.oneOnOneEnabled,
        credentials: profile.credentials,
      })
      .from(profile)
      .where(eq(profile.username, normalizedUsername))
      .limit(1)
      .then(rows => rows[0] || null)

    // If not found by username, try by userId
    if (!profileData) {
      profileData = await drizzleDb
        .select({
          userId: profile.userId,
          name: profile.name,
          username: profile.username,
          bio: profile.bio,
          avatarUrl: profile.avatarUrl,
          hourlyRate: profile.hourlyRate,
          oneOnOneEnabled: profile.oneOnOneEnabled,
          credentials: profile.credentials,
        })
        .from(profile)
        .where(eq(profile.userId, normalizedUsername))
        .limit(1)
        .then(rows => rows[0] || null)
    }

    if (!profileData) {
      return NextResponse.json({ error: 'Tutor not found' }, { status: 404 })
    }

    const tutorId = profileData.userId

    // Verify the user is a tutor
    const tutorUser = await drizzleDb
      .select({
        userId: user.userId,
        email: user.email,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(and(eq(user.userId, tutorId), eq(user.role, 'TUTOR')))
      .limit(1)

    if (tutorUser.length === 0) {
      return NextResponse.json({ error: 'Tutor not found' }, { status: 404 })
    }

    // Get tutor application data (country + social links)
    const [tutorApp] = await drizzleDb
      .select({
        countryOfResidence: tutorApplication.countryOfResidence,
        socialLinks: tutorApplication.socialLinks,
      })
      .from(tutorApplication)
      .where(eq(tutorApplication.userId, tutorId))
      .limit(1)

    // Get published courses for this tutor
    const publishedCoursesRows = await drizzleDb
      .select({
        courseId: course.courseId,
        name: course.name,
        description: course.description,
        price: course.price,
        currency: course.currency,
        isFree: course.isFree,
        schedule: course.schedule,
        updatedAt: course.updatedAt,
        categories: course.categories,
        country: courseVariant.nationality,
        variantCategory: courseVariant.category,
        templateCourseId: courseVariant.templateCourseId,
      })
      .from(course)
      .leftJoin(courseVariant, eq(courseVariant.publishedCourseId, course.courseId))
      .where(and(eq(course.creatorId, tutorId), eq(course.isPublished, true)))

    const publishedCourses = Array.from(
      new Map(publishedCoursesRows.map(row => [row.courseId, row])).values()
    )

    const templateCourseIds = Array.from(
      new Set(
        publishedCourses
          .filter(c => (c.description ?? '').trim().length === 0)
          .map(c => c.templateCourseId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    )

    const templateDescriptions =
      templateCourseIds.length > 0
        ? await drizzleDb
            .select({ courseId: course.courseId, description: course.description })
            .from(course)
            .where(inArray(course.courseId, templateCourseIds))
        : []

    const templateDescriptionMap = templateDescriptions.reduce(
      (acc, row) => {
        if (!row.courseId) return acc
        acc[row.courseId] = row.description ?? null
        return acc
      },
      {} as Record<string, string | null>
    )

    // Derive specialties from published course categories
    const derivedSpecialties = Array.from(
      new Set(publishedCourses.flatMap(c => c.categories || []))
    )

    // Fetch lesson counts
    const courseIds = publishedCourses.map(c => c.courseId)
    const lessons =
      courseIds.length > 0
        ? await drizzleDb
            .select({ courseId: courseLesson.courseId })
            .from(courseLesson)
            .where(inArray(courseLesson.courseId, courseIds))
        : []

    const lessonCounts = lessons.reduce(
      (acc, l) => {
        if (!l.courseId) return acc
        acc[l.courseId] = (acc[l.courseId] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    // Normalize social links from tutor application
    const rawSocial =
      tutorApp?.socialLinks && typeof tutorApp.socialLinks === 'object'
        ? (tutorApp.socialLinks as Record<string, unknown>)
        : {}
    const getSocial = (key: string): string | null => {
      const val = rawSocial[key]
      if (typeof val === 'string' && val.trim().length > 0) return val.trim()
      return null
    }

    // Build tutor response
    const tutorResponse = {
      id: tutorId,
      name: profileData.name || 'Anonymous Tutor',
      username: profileData.username || normalizedUsername,
      bio: profileData.bio || 'Experienced tutor ready to help you improve quickly.',
      avatarUrl: profileData.avatarUrl,
      specialties: derivedSpecialties,
      credentials: profileData.credentials || '',
      hourlyRate: profileData.hourlyRate,
      oneOnOneEnabled: profileData.oneOnOneEnabled ?? true,
      tutorSince: tutorUser[0].createdAt?.toISOString() || null,
      country: tutorApp?.countryOfResidence || null,
      activeCourses: publishedCourses.length,
      socialLinks: {
        tiktok: getSocial('tiktok'),
        youtube: getSocial('youtube'),
        instagram: getSocial('instagram'),
        facebook: getSocial('facebook'),
        x: getSocial('x'),
        kakaoTalk: getSocial('kakaoTalk'),
      },
    }

    // Transform courses to expected format
    const coursesResponse = publishedCourses.map(c => {
      const scheduleArray = Array.isArray(c.schedule) ? c.schedule : []
      const scheduleSummary =
        scheduleArray.length > 0 ? `${scheduleArray.length} time slot(s)` : null

      return {
        id: c.courseId,
        name: c.name,
        description:
          c.description && c.description.trim().length > 0
            ? c.description
            : c.templateCourseId
              ? (templateDescriptionMap[c.templateCourseId] ?? null)
              : null,
        categories: c.categories || [],

        enrollmentCount: 0, // Placeholder
        lessonCount: lessonCounts[c.courseId] || 0,
        price: c.isFree ? 0 : c.price,
        isFree: c.isFree || c.price == null || c.price === 0,
        currency: c.currency || 'USD',
        schedule: c.schedule || [],
        scheduleSummary,
        country: c.country,
        variantCategory: c.variantCategory,
        liveSessionsTotal: 0,
        liveSessionsCompleted: 0,
        enrollmentStatus: 'ongoing' as const,
      }
    })

    return NextResponse.json({
      tutor: tutorResponse,
      courses: coursesResponse,
      source: 'db',
    })
  } catch (error) {
    console.error('[GET /api/public/tutors/[username]] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tutor', tutor: null, courses: [] },
      { status: 500 }
    )
  }
}
