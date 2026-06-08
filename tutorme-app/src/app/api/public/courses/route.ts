/**
 * Public API to search published courses
 * GET /api/public/courses?q=&page=&pageSize=
 */

import { NextRequest, NextResponse } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseVariant, profile } from '@/lib/db/schema'
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { ALL_COUNTRIES } from '@/lib/data/tutor-categories'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const searchQuery = searchParams.get('q')?.toLowerCase().trim() || ''
    const countryParam = searchParams.get('country')?.trim() || ''
    const countryName = countryParam && countryParam !== 'global'
      ? ALL_COUNTRIES.find(c => c.code === countryParam)?.name
      : undefined

    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Math.min(60, Math.max(1, Number(searchParams.get('pageSize')) || 12))
    const offset = (page - 1) * pageSize

    const searchPattern = searchQuery ? `%${searchQuery}%` : null

    const courseAggSubq = drizzleDb
      .select({
        courseId: course.courseId,
        creatorId: course.creatorId,
        latestUpdatedAt: sql<Date>`max(${course.updatedAt})`.as('latestUpdatedAt'),
        totalCount: sql<number>`count(*) over()::int`.as('totalCount'),
      })
      .from(course)
      .innerJoin(profile, eq(course.creatorId, profile.userId))
      .leftJoin(courseVariant, eq(courseVariant.publishedCourseId, course.courseId))
      .where(
        and(
          eq(course.isPublished, true),
          searchPattern
            ? or(
                ilike(course.name, searchPattern),
                ilike(course.description, searchPattern),
                ilike(profile.name, searchPattern),
                ilike(profile.username, searchPattern),
                ilike(profile.bio, searchPattern),
                ilike(courseVariant.category, searchPattern),
                ilike(courseVariant.nationality, searchPattern),
                sql`exists (
                  select 1
                  from jsonb_array_elements_text(${course.categories}) cat
                  where lower(cat) like ${searchPattern}
                )`
              )
            : undefined,
          countryName
            ? or(
                ilike(profile.countryOfResidence, countryName),
                ilike(profile.nationality, countryName)
              )
            : undefined
        )
      )
      .groupBy(course.courseId, course.creatorId)
      .orderBy(desc(sql`max(${course.updatedAt})`))
      .limit(pageSize)
      .offset(offset)
      .as('courseAgg')

    const paginated = await drizzleDb.select().from(courseAggSubq)
    const total = paginated[0]?.totalCount ?? 0
    const paginatedCourseIds = paginated.map(p => p.courseId).filter((id): id is string => !!id)

    if (paginatedCourseIds.length === 0) {
      return NextResponse.json({
        courses: [],
        source: 'db',
        pagination: { page, pageSize, total: 0, totalPages: 0 },
      })
    }

    const rows = await drizzleDb
      .select({
        courseId: course.courseId,
        name: course.name,
        description: course.description,
        price: course.price,
        currency: course.currency,
        isFree: course.isFree,
        updatedAt: course.updatedAt,
        categories: course.categories,
        creatorId: course.creatorId,

        tutorName: profile.name,
        tutorUsername: profile.username,
        tutorAvatarUrl: profile.avatarUrl,
        tutorCreatedAt: profile.createdAt,
        tutorCountryOfResidence: profile.countryOfResidence,
        tutorNationality: profile.nationality,
        tutorBio: profile.bio,

        templateCourseId: courseVariant.templateCourseId,
        variantCategory: courseVariant.category,
        variantNationality: courseVariant.nationality,
      })
      .from(course)
      .innerJoin(profile, eq(course.creatorId, profile.userId))
      .leftJoin(courseVariant, eq(courseVariant.publishedCourseId, course.courseId))
      .where(inArray(course.courseId, paginatedCourseIds))

    const byCourseId = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      if (!byCourseId.has(row.courseId)) byCourseId.set(row.courseId, row)
    }
    const ordered = paginatedCourseIds
      .map(id => byCourseId.get(id))
      .filter(Boolean) as (typeof rows)[number][]

    const templateCourseIds = Array.from(
      new Set(
        ordered
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

    const creatorIds = Array.from(new Set(ordered.map(c => c.creatorId).filter((id): id is string => !!id)))
    const activeCourseCounts =
      creatorIds.length > 0
        ? await drizzleDb
            .select({ creatorId: course.creatorId, count: sql<number>`count(*)::int` })
            .from(course)
            .where(and(eq(course.isPublished, true), inArray(course.creatorId, creatorIds)))
            .groupBy(course.creatorId)
        : []
    const activeCourseCountMap = activeCourseCounts.reduce(
      (acc, row) => {
        if (row.creatorId) acc[row.creatorId] = row.count
        return acc
      },
      {} as Record<string, number>
    )

    const coursesResponse = ordered.map(c => ({
      id: c.courseId,
      name: c.name,
      description:
        c.description && c.description.trim().length > 0
          ? c.description
          : c.templateCourseId
            ? (templateDescriptionMap[c.templateCourseId] ?? null)
            : null,
      categories: c.categories || [],
      variantCategory: c.variantCategory,
      variantNationality: c.variantNationality,
      price: c.isFree ? 0 : c.price,
      currency: c.currency || 'USD',
      isFree: c.isFree || c.price == null || c.price === 0,
      updatedAt: c.updatedAt?.toISOString() || null,
      tutor: {
        id: c.creatorId,
        name: c.tutorName || 'Anonymous Tutor',
        username: c.tutorUsername || (c.creatorId ? c.creatorId.slice(0, 8) : 'tutor'),
        avatarUrl: c.tutorAvatarUrl,
        createdAt: c.tutorCreatedAt?.toISOString() || null,
        country: c.tutorCountryOfResidence || c.tutorNationality || null,
        bio: c.tutorBio || null,
        activeCourses: activeCourseCountMap[c.creatorId || ''] ?? 0,
      },
    }))

    return NextResponse.json({
      courses: coursesResponse,
      source: 'db',
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('[GET /api/public/courses] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch courses', courses: [] }, { status: 500 })
  }
}
