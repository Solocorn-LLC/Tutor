/**
 * Public API to get tutors with published courses
 * GET /api/public/tutors?q=&subject=&sort=&combination=&page=&pageSize=
 */

import { NextRequest, NextResponse } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, user, profile, courseVariant, tutorApplication } from '@/lib/db/schema'
import { eq, and, or, inArray, isNull, sql, desc, ilike } from 'drizzle-orm'
import { ALL_COUNTRIES } from '@/lib/data/tutor-categories'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const idsParam = searchParams.get('ids')?.trim() || ''
    const requestedIds = idsParam
      ? Array.from(
          new Set(
            idsParam
              .split(',')
              .map(id => id.trim())
              .filter(Boolean)
          )
        )
      : []

    // Fast path for favorites/bookmarks: fetch specific tutors by ids.
    if (requestedIds.length > 0) {
      const [tutorProfiles, publishedCourseRows, tutorApps] = await Promise.all([
        drizzleDb
          .select({
            userId: profile.userId,
            name: profile.name,
            username: profile.username,
            bio: profile.bio,
            avatarUrl: profile.avatarUrl,
            hourlyRate: profile.hourlyRate,
            oneOnOneEnabled: profile.oneOnOneEnabled,
            countryOfResidence: profile.countryOfResidence,
            nationality: profile.nationality,
          })
          .from(profile)
          .innerJoin(user, eq(profile.userId, user.userId))
          .where(and(inArray(profile.userId, requestedIds), eq(user.role, 'TUTOR'))),
        drizzleDb
          .select({
            creatorId: course.creatorId,
            courseId: course.courseId,
            categories: course.categories,
          })
          .from(course)
          .where(
            and(
              eq(course.isPublished, true),
              isNull(course.deletedAt),
              inArray(course.creatorId, requestedIds)
            )
          ),
        drizzleDb
          .select({
            userId: tutorApplication.userId,
            countryOfResidence: tutorApplication.countryOfResidence,
          })
          .from(tutorApplication)
          .where(inArray(tutorApplication.userId, requestedIds)),
      ])

      const coursesByTutor = new Map<string, { courseId: string; categories: string[] | null }[]>()
      for (const row of publishedCourseRows) {
        if (!row.creatorId || !row.courseId) continue
        const list = coursesByTutor.get(row.creatorId) || []
        list.push({ courseId: row.courseId, categories: row.categories || [] })
        coursesByTutor.set(row.creatorId, list)
      }

      const profileById = new Map(tutorProfiles.map(p => [p.userId, p]))
      const tutorAppById = new Map(tutorApps.map(a => [a.userId, a]))
      const tutors = requestedIds
        .map(tutorId => {
          const profileData = profileById.get(tutorId)
          if (!profileData) return null
          const tutorCourses = coursesByTutor.get(tutorId) || []
          const categories = Array.from(
            new Set(tutorCourses.flatMap(c => (Array.isArray(c.categories) ? c.categories : [])))
          )
          const tutorApp = tutorAppById.get(tutorId)
          const countryFromProfile =
            profileData.countryOfResidence || profileData.nationality || null
          const countryFromApp = tutorApp?.countryOfResidence || null
          const country = countryFromProfile || countryFromApp
          const tutorNationalities = [
            ...new Set(
              [
                profileData.nationality,
                profileData.countryOfResidence,
                tutorApp?.countryOfResidence,
              ].filter(Boolean)
            ),
          ]
          return {
            id: tutorId,
            name: profileData.name || 'Anonymous Tutor',
            username: profileData.username || tutorId.slice(0, 8),
            bio: profileData.bio || 'Experienced tutor ready to help you improve quickly.',
            avatarUrl: profileData.avatarUrl,
            country,
            specialties: categories,
            hourlyRate: profileData.hourlyRate,
            oneOnOneEnabled: profileData.oneOnOneEnabled ?? true,
            tutorNationalities,
            categoryNationalityCombinations: [],
            courseCount: tutorCourses.length,
            totalEnrollments: 0,
            categories,
            latestCourseUpdatedAt: null,
            coursePreview: [],
            averageRating: 0,
            totalReviewCount: 0,
          }
        })
        .filter((tutor): tutor is NonNullable<typeof tutor> => !!tutor)

      return NextResponse.json({
        tutors,
        availableCategories: [],
        availableCombinations: [],
        availableNationalities: [],
        source: 'db',
        pagination: {
          page: 1,
          pageSize: tutors.length,
          total: tutors.length,
          totalPages: tutors.length > 0 ? 1 : 0,
        },
      })
    }

    const searchQuery = searchParams.get('q')?.toLowerCase().trim().replace(/^@/, '') || ''
    const categoryFilter = searchParams.get('subject')?.toLowerCase().trim() || ''
    const combinationFilter = searchParams.get('combination')?.toLowerCase().trim() || ''
    const nationalityFilter = searchParams.get('nationality')?.toLowerCase().trim() || ''
    const countryParam = searchParams.get('country')?.trim() || ''
    const countryName =
      countryParam && countryParam !== 'global'
        ? ALL_COUNTRIES.find(c => c.code === countryParam)?.name
        : undefined
    const sortBy = searchParams.get('sort') || 'popular'

    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize')) || 20))
    const offset = (page - 1) * pageSize

    const searchPattern = searchQuery ? `%${searchQuery}%` : null
    const categoryPattern =
      categoryFilter && categoryFilter !== 'all' ? `%${categoryFilter}%` : null
    const combinationPattern =
      combinationFilter && combinationFilter !== 'all' ? `%${combinationFilter}%` : null
    const nationalityPattern =
      nationalityFilter && nationalityFilter !== 'all' ? `%${nationalityFilter}%` : null

    const orderByClause =
      sortBy === 'newest'
        ? desc(sql`max(${course.updatedAt})`)
        : sortBy === 'courses'
          ? desc(sql`count(distinct ${course.courseId})`)
          : sortBy === 'rate'
            ? desc(sql`max(${profile.hourlyRate})`)
            : desc(sql`count(distinct ${course.courseId})`)

    // Root the directory on tutors (user/profile), LEFT JOINing their published
    // courses, so EVERY tutor is discoverable — not only those who have published
    // a course. The published/not-deleted filter lives on the JOIN condition (not
    // the WHERE) so a course-less tutor isn't filtered out. Course-derived
    // filters (subject/combination/nationality) still naturally restrict to
    // tutors who have matching courses.
    const tutorAggSubq = drizzleDb
      .select({
        creatorId: user.userId,
        latestUpdatedAt: sql<Date>`max(${course.updatedAt})`.as('latestUpdatedAt'),
        courseCount: sql<number>`count(distinct ${course.courseId})::int`.as('courseCount'),
        hourlyRate: sql<number>`max(${profile.hourlyRate})`.as('hourlyRate'),
        totalCount: sql<number>`count(*) over()::int`.as('totalCount'),
      })
      .from(user)
      .innerJoin(profile, eq(user.userId, profile.userId))
      .leftJoin(
        course,
        and(
          eq(course.creatorId, user.userId),
          eq(course.isPublished, true),
          isNull(course.deletedAt)
        )
      )
      .leftJoin(courseVariant, eq(course.courseId, courseVariant.publishedCourseId))
      .where(
        and(
          eq(user.role, 'TUTOR'),
          // Don't surface half-finished / test signups on the public directory:
          // a discoverable tutor must at least have a real name on their profile.
          // (Publishing a course is NOT required — every named tutor appears.)
          sql`coalesce(trim(${profile.name}), '') <> ''`,
          searchPattern
            ? or(
                ilike(profile.name, searchPattern),
                ilike(profile.username, searchPattern),
                ilike(profile.bio, searchPattern),
                ilike(course.name, searchPattern),
                ilike(courseVariant.category, searchPattern),
                ilike(courseVariant.nationality, searchPattern),
                sql`exists (
                  select 1
                  from unnest(${course.categories}) cat
                  where lower(cat) like ${searchPattern}
                )`
              )
            : undefined,
          categoryPattern
            ? sql`exists (
                select 1
                from unnest(${course.categories}) cat
                where lower(cat) like ${categoryPattern}
              )`
            : undefined,
          combinationPattern
            ? sql`lower(${courseVariant.category} || ' - ' || ${courseVariant.nationality}) like ${combinationPattern}`
            : undefined,
          nationalityPattern ? ilike(courseVariant.nationality, nationalityPattern) : undefined,
          countryName
            ? or(
                ilike(profile.countryOfResidence, countryName),
                ilike(profile.nationality, countryName)
              )
            : undefined
        )
      )
      .groupBy(user.userId)
      // Stable tiebreaker so pagination is deterministic when the primary metric
      // ties (e.g. all the course-less tutors with 0 courses).
      .orderBy(orderByClause, sql`${user.userId} asc`)
      .limit(pageSize)
      .offset(offset)
      .as('tutorAgg')

    const paginated = await drizzleDb.select().from(tutorAggSubq)
    const total = paginated[0]?.totalCount ?? 0
    const paginatedIds = paginated.map(p => p.creatorId).filter((id): id is string => !!id)

    if (paginatedIds.length === 0) {
      return NextResponse.json({
        tutors: [],
        availableCategories: [],
        availableCombinations: [],
        availableNationalities: [],
        source: 'db',
        pagination: { page, pageSize, total: 0, totalPages: 0 },
      })
    }

    // Fetch profiles, courses, variants, and tutor applications for paginated tutors only
    const [tutorProfiles, publishedCourses, variants, tutorApps] = await Promise.all([
      drizzleDb
        .select({
          userId: profile.userId,
          name: profile.name,
          username: profile.username,
          bio: profile.bio,
          avatarUrl: profile.avatarUrl,
          hourlyRate: profile.hourlyRate,
          oneOnOneEnabled: profile.oneOnOneEnabled,
          countryOfResidence: profile.countryOfResidence,
          nationality: profile.nationality,
        })
        .from(profile)
        .where(inArray(profile.userId, paginatedIds)),
      drizzleDb
        .select({
          courseId: course.courseId,
          name: course.name,
          description: course.description,
          price: course.price,
          currency: course.currency,
          isFree: course.isFree,
          updatedAt: course.updatedAt,
          creatorId: course.creatorId,
          categories: course.categories,
        })
        .from(course)
        .where(
          and(
            eq(course.isPublished, true),
            isNull(course.deletedAt),
            inArray(course.creatorId, paginatedIds)
          )
        ),
      drizzleDb
        .select({
          publishedCourseId: courseVariant.publishedCourseId,
          nationality: courseVariant.nationality,
          category: courseVariant.category,
        })
        .from(courseVariant)
        .where(
          inArray(
            courseVariant.publishedCourseId,
            drizzleDb
              .select({ courseId: course.courseId })
              .from(course)
              .where(
                and(
                  eq(course.isPublished, true),
                  isNull(course.deletedAt),
                  inArray(course.creatorId, paginatedIds)
                )
              )
          )
        ),
      drizzleDb
        .select({
          userId: tutorApplication.userId,
          countryOfResidence: tutorApplication.countryOfResidence,
        })
        .from(tutorApplication)
        .where(inArray(tutorApplication.userId, paginatedIds)),
    ])

    const variantsByCourseId = new Map<string, { nationality: string; category: string }[]>()
    for (const v of variants) {
      const list = variantsByCourseId.get(v.publishedCourseId) || []
      list.push(v)
      variantsByCourseId.set(v.publishedCourseId, list)
    }

    const profileById = new Map(tutorProfiles.map(p => [p.userId, p]))
    const tutorAppById = new Map(tutorApps.map(a => [a.userId, a]))
    const coursesByTutorId = new Map<string, typeof publishedCourses>()
    for (const c of publishedCourses) {
      const list = coursesByTutorId.get(c.creatorId!) || []
      list.push(c)
      coursesByTutorId.set(c.creatorId!, list)
    }

    const tutors = paginatedIds.map(tutorId => {
      const profileData = profileById.get(tutorId)
      const tutorApp = tutorAppById.get(tutorId)
      const tutorCourses = coursesByTutorId.get(tutorId) || []
      const tutorVariants = tutorCourses.flatMap(c => variantsByCourseId.get(c.courseId) || [])
      const tutorCombinations = [
        ...new Set(tutorVariants.map(v => `${v.category} - ${v.nationality}`)),
      ]
      const tutorNationalities = [
        ...new Set(
          [
            ...tutorVariants.map(v => v.nationality),
            profileData?.nationality,
            profileData?.countryOfResidence,
            tutorApp?.countryOfResidence,
          ].filter(Boolean)
        ),
      ]
      const allCategories = [...new Set(tutorCourses.flatMap(c => c.categories || []))]

      const latestCourse = tutorCourses.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0]

      const countryFromProfile = profileData?.countryOfResidence || profileData?.nationality || null
      const countryFromApp = tutorApp?.countryOfResidence || null
      const country = countryFromProfile || countryFromApp

      return {
        id: tutorId,
        name: profileData?.name || 'Anonymous Tutor',
        username: profileData?.username || tutorId.slice(0, 8),
        bio: profileData?.bio || 'Experienced tutor ready to help you improve quickly.',
        avatarUrl: profileData?.avatarUrl,
        country,
        specialties: allCategories,
        hourlyRate: profileData?.hourlyRate,
        oneOnOneEnabled: profileData?.oneOnOneEnabled ?? true,
        tutorNationalities,
        categoryNationalityCombinations: tutorCombinations,
        courseCount: tutorCourses.length,
        totalEnrollments: 0,
        categories: allCategories,
        latestCourseUpdatedAt: latestCourse?.updatedAt?.toISOString() || null,
        coursePreview: tutorCourses.map(c => ({
          id: c.courseId,
          name: c.name,
          categories: c.categories || [],
          enrollmentCount: 0,
          moduleCount: 1,
          lessonCount: 1,
          updatedAt: c.updatedAt?.toISOString() || new Date().toISOString(),
          price: c.isFree ? 0 : c.price,
          currency: c.currency || 'USD',
          rating: 0,
          reviewCount: 0,
        })),
        averageRating: 0,
        totalReviewCount: 0,
      }
    })

    // Global filter options (from all published courses/variants)
    const [allCategoriesResult, allCombinationsResult, allNationalitiesResult] = await Promise.all([
      drizzleDb
        .select({ categories: course.categories })
        .from(course)
        .where(and(eq(course.isPublished, true), isNull(course.deletedAt))),
      drizzleDb
        .select({ category: courseVariant.category, nationality: courseVariant.nationality })
        .from(courseVariant),
      drizzleDb.select({ nationality: courseVariant.nationality }).from(courseVariant),
    ])

    const allCategories = [...new Set(allCategoriesResult.flatMap(r => r.categories || []))].filter(
      Boolean
    )
    const allCombinations = [
      ...new Set(allCombinationsResult.map(v => `${v.category} - ${v.nationality}`)),
    ].filter(Boolean)
    const allTutorNationalities = [
      ...new Set(allNationalitiesResult.map(v => v.nationality)),
    ].filter(Boolean)

    return NextResponse.json({
      tutors,
      availableCategories: allCategories,
      availableCombinations: allCombinations,
      availableNationalities: allTutorNationalities,
      source: 'db',
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('[GET /api/public/tutors] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tutors', tutors: [], availableCategories: [] },
      { status: 500 }
    )
  }
}
