import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  course as courseTable,
  courseLesson,
  liveSession,
  courseEnrollment,
  courseVariant,
} from '@/lib/db/schema'
import { CreateCourseSchema } from '@/lib/validation/schemas'
import { ZodError } from 'zod'
import { sql, inArray, and, eq } from 'drizzle-orm'

export const GET = withAuth(
  async (req: NextRequest, session) => {
    try {
      const hideTemplatesWithPublishedVariants =
        req.nextUrl.searchParams.get('hideTemplatesWithPublishedVariants') !== 'false'
      const coursesData = await drizzleDb.query.course.findMany({
        where: (course, { eq }) => eq(course.creatorId, session.user.id),
        orderBy: (course, { desc }) => [desc(course.createdAt)],
        columns: {
          courseId: true,
          name: true,
          description: true,
          categories: true,
          isPublished: true,
          isLiveOnline: true,
          schedule: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      const courseIds = coursesData.map(c => c.courseId)
      const templateIdsWithPublishedVariants =
        hideTemplatesWithPublishedVariants && courseIds.length > 0
          ? new Set(
              (
                await drizzleDb
                  .select({ templateCourseId: courseVariant.templateCourseId })
                  .from(courseVariant)
                  .innerJoin(courseTable, eq(courseTable.courseId, courseVariant.publishedCourseId))
                  .where(
                    and(
                      inArray(courseVariant.templateCourseId, courseIds),
                      eq(courseTable.isPublished, true)
                    )
                  )
              ).map(r => r.templateCourseId)
            )
          : new Set<string>()

      const [sessionAgg, enrollmentAgg] = await Promise.all([
        courseIds.length > 0
          ? drizzleDb
              .select({
                courseId: liveSession.courseId,
                hasSessions: sql<boolean>`count(*) > 0`.as('hasSessions'),
                lastSessionDate: sql<Date | null>`max(${liveSession.scheduledAt})`.as(
                  'lastSessionDate'
                ),
                upcomingSessionsCount:
                  sql<number>`count(*) filter (where ${liveSession.scheduledAt} > now())`.as(
                    'upcomingSessionsCount'
                  ),
              })
              .from(liveSession)
              .where(inArray(liveSession.courseId, courseIds))
              .groupBy(liveSession.courseId)
          : Promise.resolve([]),
        courseIds.length > 0
          ? drizzleDb
              .select({
                courseId: courseEnrollment.courseId,
                studentCount: sql<number>`count(*)::int`.as('studentCount'),
              })
              .from(courseEnrollment)
              .where(inArray(courseEnrollment.courseId, courseIds))
              .groupBy(courseEnrollment.courseId)
          : Promise.resolve([]),
      ])

      const sessionMap = new Map(sessionAgg.map(s => [s.courseId, s]))
      const enrollmentMap = new Map(enrollmentAgg.map(e => [e.courseId, e]))

      // Map courseId to id for frontend compatibility
      const courses = coursesData
        .filter(c =>
          hideTemplatesWithPublishedVariants
            ? !(c.isPublished === false && templateIdsWithPublishedVariants.has(c.courseId))
            : true
        )
        .map(c => {
          const sessionMeta = sessionMap.get(c.courseId)
          const enrollmentMeta = enrollmentMap.get(c.courseId)
          return {
            id: c.courseId,
            name: c.name,
            description: c.description,
            categories: c.categories,
            isPublished: c.isPublished,
            isLiveOnline: c.isLiveOnline,
            schedule: c.schedule,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            hasSessions: sessionMeta?.hasSessions ?? false,
            studentCount: enrollmentMeta?.studentCount ?? 0,
            _count: {
              enrollments: enrollmentMeta?.studentCount ?? 0,
            },
            lastSessionDate: sessionMeta?.lastSessionDate ?? null,
            upcomingSessionsCount: sessionMeta?.upcomingSessionsCount ?? 0,
          }
        })

      return NextResponse.json({ courses })
    } catch (error) {
      console.error('Failed to fetch courses:', error)
      return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
    }
  },
  { role: 'TUTOR' }
)

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
      try {
        const body = await req.json()
        console.log('Course creation request:', JSON.stringify(body, null, 2))

        let data
        try {
          data = CreateCourseSchema.parse(body)
        } catch (parseError) {
          console.error('Schema validation error:', parseError)
          if (parseError instanceof ZodError) {
            return NextResponse.json(
              { error: 'Invalid request data', details: parseError.issues },
              { status: 400 }
            )
          }
          throw parseError
        }

        const userId = session.user.id
        const now = new Date()
        const courseId = crypto.randomUUID()

        const categories =
          Array.isArray(data.categories) && data.categories.length > 0 ? data.categories : []

        const schedule =
          Array.isArray(data.schedule) && data.schedule.length > 0 ? data.schedule : []

        const insertValues = {
          courseId,
          name: data.title,
          description: data.description || null,
          isPublished: false,
          isLiveOnline: data.isLiveOnline ?? false,
          isFree: false,
          categories,
          currency: 'USD',
          schedule,
          createdAt: now,
          updatedAt: now,
          creatorId: userId,
          languageOfInstruction: null,
          price: null,
        }

        console.log('[Course Create] Insert values:', JSON.stringify(insertValues, null, 2))

        const [newCourse] = await drizzleDb.insert(courseTable).values(insertValues).returning({
          courseId: courseTable.courseId,
          name: courseTable.name,
          description: courseTable.description,
          categories: courseTable.categories,
          isPublished: courseTable.isPublished,
          isLiveOnline: courseTable.isLiveOnline,
          createdAt: courseTable.createdAt,
          updatedAt: courseTable.updatedAt,
        })

        await drizzleDb.insert(courseLesson).values({
          lessonId: crypto.randomUUID(),
          courseId: newCourse.courseId,
          title: 'Lesson 1',
          description: 'Lesson 1 for this course.',
          duration: 60,
          order: 0,
          updatedAt: now,
          builderData: {
            isPublished: false,
            duration: 60,
            difficultyMode: 'all',
            variants: {},
            media: { videos: [], images: [] },
            docs: [],
            content: [],
            tasks: [],
            assessments: [],
            homework: [],
            quizzes: [],
            worksheets: [],
          },
        })

        const createdCourse = {
          id: newCourse.courseId,
          name: newCourse.name,
          description: newCourse.description,
          categories: newCourse.categories,
          isPublished: newCourse.isPublished,
          isLiveOnline: newCourse.isLiveOnline,
          createdAt: newCourse.createdAt?.toISOString?.() ?? newCourse.createdAt,
          updatedAt: newCourse.updatedAt?.toISOString?.() ?? newCourse.updatedAt,
        }

        console.log('Course created:', newCourse.courseId, '-', newCourse.name)

        return NextResponse.json({
          courses: [createdCourse],
          message: 'Course created successfully',
        })
      } catch (error) {
        // Unwrap DrizzleQueryError to get the real PostgreSQL error
        const rootError = (error as { cause?: Error }).cause ?? error

        console.error('Course creation error:', rootError)

        // Log detailed error for debugging
        if (rootError instanceof Error) {
          const pgError = rootError as {
            code?: string
            detail?: string
            hint?: string
            message?: string
          }
          console.error('PostgreSQL error details:', {
            code: pgError.code,
            message: pgError.message,
            detail: pgError.detail,
            hint: pgError.hint,
          })
        }

        return NextResponse.json(
          {
            error: 'Failed to create course',
            details: rootError instanceof Error ? rootError.message : String(rootError),
          },
          { status: 500 }
        )
      }
    },
    { role: 'TUTOR' }
  )
)
