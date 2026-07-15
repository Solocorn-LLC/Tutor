/**
 * Enroll in a Subject API
 * Add a new subject to student's course
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, ValidationError, withRateLimitPreset } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { course, courseEnrollment, courseLesson } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { enrollStudentInCourse } from '@/lib/api/enrollments'

const subjectCourseMap: Record<string, { name: string; description: string }> = {
  english: {
    name: 'English Language Arts',
    description: 'Language arts, writing, grammar, and literature analysis',
  },
  math: {
    name: 'Mathematics',
    description: 'Algebra, geometry, and foundational problem solving',
  },
  precalculus: {
    name: 'Pre-calculus',
    description: 'Functions, trigonometry, and preparation for calculus',
  },
  'ap-calculus-ab': {
    name: 'AP Calculus AB',
    description: 'Limits, derivatives, integrals, and the Fundamental Theorem',
  },
  'ap-calculus-bc': {
    name: 'AP Calculus BC',
    description: 'All AB topics plus series, parametric, and polar calculus',
  },
  'ap-statistics': {
    name: 'AP Statistics',
    description: 'Data analysis, probability, and statistical inference',
  },
  physics: {
    name: 'Physics',
    description: 'Mechanics, thermodynamics, electricity, and magnetism',
  },
  chemistry: {
    name: 'Chemistry',
    description: 'Organic, inorganic, and physical chemistry fundamentals',
  },
  biology: {
    name: 'Biology',
    description: 'Cell biology, genetics, ecology, and evolution',
  },
  ielts: {
    name: 'IELTS',
    description: 'International English Language Testing System preparation',
  },
  toefl: {
    name: 'TOEFL',
    description: 'Test of English as a Foreign Language preparation',
  },
  cs: {
    name: 'Computer Science',
    description: 'Programming, algorithms, and software development',
  },
}

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
      const { response: rateLimitResponse } = await withRateLimitPreset(req, 'enroll')
      if (rateLimitResponse) return rateLimitResponse

      const { subjectCode } = await req.json()

      if (!subjectCode) {
        throw new ValidationError('Subject code required')
      }

      const subjectKey = subjectCode.toLowerCase()
      const subjectInfo = subjectCourseMap[subjectKey]
      if (!subjectInfo) {
        throw new ValidationError('Invalid subject code')
      }

      const [courseByCategory] = await drizzleDb
        .select()
        .from(course)
        .where(
          sql`${course.categories} IS NOT NULL AND ${course.categories} @> ARRAY[${subjectKey}]::text[]`
        )
        .limit(1)

      if (courseByCategory) {
        const [existingEnrollment] = await drizzleDb
          .select()
          .from(courseEnrollment)
          .where(
            and(
              eq(courseEnrollment.studentId, session.user.id),
              // eslint-disable-next-line no-restricted-syntax -- exact match: dedup for THIS resolved course, not a session-derived id
              eq(courseEnrollment.courseId, courseByCategory.courseId)
            )
          )
          .limit(1)
        if (existingEnrollment) {
          throw new ValidationError('Already enrolled in this subject')
        }
      }

      let courseId: string
      if (courseByCategory) {
        courseId = courseByCategory.courseId
      } else {
        courseId = crypto.randomUUID()
        const now = new Date()

        // Insert with accurate schema defaults
        const courseValues: Record<string, unknown> = {
          courseId,
          name: subjectInfo.name,
          categories: [subjectKey],
          description: subjectInfo.description,
          isPublished: true,
          isLiveOnline: true,
          isFree: false,
          createdAt: now,
          updatedAt: now,
        }

        await drizzleDb.insert(course).values(courseValues as typeof course.$inferInsert)
        await createDefaultLessons(courseId, subjectCode)
      }

      // Route through the canonical enrollment helper so capacity, progress
      // seeding, and (future) schedule handling stay consistent across all
      // enrollment entry points.
      const result = await enrollStudentInCourse(session.user.id, courseId)

      return NextResponse.json({
        success: true,
        enrollment: result.enrollment,
        message: `Enrolled in ${subjectInfo.name}`,
      })
    },
    { role: 'STUDENT' }
  )
)

async function createDefaultLessons(courseId: string, subjectCode: string) {
  const lessonData = getDefaultLessons(subjectCode)
  for (let i = 0; i < lessonData.length; i++) {
    const lesson = lessonData[i]
    const lessonId = crypto.randomUUID()
    await drizzleDb.insert(courseLesson).values({
      lessonId,
      courseId,
      title: lesson.title,
      description: lesson.description,
      order: i,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }
}

function getDefaultLessons(subjectCode: string) {
  const lessons: Record<string, any[]> = {
    precalculus: [
      {
        title: 'Functions and Graphs',
        description: 'Understanding functions, domain, range, and transformations',
      },
      {
        title: 'Trigonometry',
        description: 'Trigonometric functions, identities, and equations',
      },
      {
        title: 'Analytic Geometry',
        description: 'Conic sections and parametric equations',
      },
      {
        title: 'Sequences and Series',
        description: 'Arithmetic, geometric sequences and series',
      },
    ],
    'ap-calculus-ab': [
      {
        title: 'Limits and Continuity',
        description: 'Understanding limits and continuity',
      },
      {
        title: 'Derivatives',
        description: 'Definition, rules, and applications of derivatives',
      },
      {
        title: 'Integrals',
        description: 'Definite and indefinite integrals',
      },
    ],
    'ap-calculus-bc': [
      {
        title: 'Limits and Continuity',
        description: 'Understanding limits and continuity',
      },
      {
        title: 'Derivatives',
        description: 'Definition, rules, and applications',
      },
      {
        title: 'Integrals',
        description: 'Definite and indefinite integrals',
      },
      {
        title: 'Series',
        description: 'Infinite series and convergence',
      },
      {
        title: 'Parametric and Polar',
        description: 'Parametric equations and polar coordinates',
      },
    ],
    'ap-statistics': [
      {
        title: 'Exploring Data',
        description: 'Describing and analyzing data patterns',
      },
      {
        title: 'Sampling and Experimentation',
        description: 'Data collection methods',
      },
      {
        title: 'Probability',
        description: 'Randomness and probability',
      },
      {
        title: 'Inference',
        description: 'Statistical inference and testing',
      },
    ],
  }

  return (
    lessons[subjectCode.toLowerCase()] || [
      {
        title: 'Introduction',
        description: 'Getting started with the subject',
      },
      {
        title: 'Core Concepts',
        description: 'Fundamental principles',
      },
      {
        title: 'Advanced Topics',
        description: 'Deeper exploration',
      },
    ]
  )
}
