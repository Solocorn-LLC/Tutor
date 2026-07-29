/**
 * Integration test: multi-country course publish flow end-to-end.
 *
 * A tutor configures a template course with several published "variants" — one
 * per (category × nationality) combination — on the course details page. The
 * publish route (`/api/tutor/courses/[id]/publish`) then materializes, for each
 * variant, a published `course` row plus a `courseVariant` link row that ties it
 * back to the template. Published courses keep the bare template name (no
 * nationality/flag suffix).
 *
 * This test drives that exact route against a real Postgres:
 *   1. Seed a tutor + a template course (with a lesson) owned by the tutor.
 *   2. POST two variants (same category, nationalities Singapore + Korea) and
 *      assert the route reports 2 created variants.
 *   3. Assert the DB has exactly 2 CourseVariant rows + 2 published, isPublished
 *      Course rows with the correctly suffixed names.
 *   4. Assert the GET handler surfaces both variants for the template.
 *   5. Assert a Global-only variant publishes to a single course named exactly
 *      the template name (no " — Global" suffix).
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { eq, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, course, courseLesson, courseVariant } from '@/lib/db/schema'

const stamp = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
const tutorEmail = `claude-publish-tutor-${stamp}@example.com`

const tutorId = crypto.randomUUID()
const templateCourseId = `c_${stamp}`
const templateLessonId = `l_${stamp}`
const templateName = `AP Biology ${stamp}`

const globalTemplateCourseId = `cg_${stamp}`
const globalTemplateLessonId = `lg_${stamp}`
const globalTemplateName = `AP Chemistry ${stamp}`

const CATEGORY = 'AP Biology'

// Mock auth so the real route handlers run as our seeded tutor. The user.id must
// equal the seeded tutor's id so verifyCourseOwnership passes.
const mockSession = {
  user: { id: tutorId, email: tutorEmail, role: 'TUTOR' as const },
  expires: new Date(Date.now() + 86400 * 1000).toISOString(),
}
vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve(mockSession)),
  authOptions: {},
}))

// Imported after the mock is registered (hoisted by vitest anyway).
import {
  POST as publishVariants,
  GET as getVariants,
} from '@/app/api/tutor/courses/[id]/publish/route'

// Build a POST request. An `Authorization: Bearer` header makes requireCsrf
// short-circuit (it treats Bearer-auth callers as server-to-server), so the
// withCsrf gate passes without needing the double-submit cookie/header pair —
// the minimal correct way to satisfy CSRF in this test env.
function makePostReq(body: unknown): Request {
  return new Request(`http://localhost/api/tutor/courses/${templateCourseId}/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-integration',
    },
    body: JSON.stringify(body),
  })
}

function makeGetReq(id: string): Request {
  return new Request(`http://localhost/api/tutor/courses/${id}/publish`, {
    headers: { 'Content-Type': 'application/json' },
  })
}

function variant(nationality: string, overrides: Record<string, unknown> = {}) {
  return {
    category: CATEGORY,
    nationality,
    isPublished: true,
    isFree: false,
    price: 100,
    currency: 'USD',
    languageOfInstruction: 'English',
    schedules: [],
    ...overrides,
  }
}

// Collects every course row this test creates (template + published variants) so
// teardown is FK-safe and reruns stay idempotent.
async function publishedCourseIdsFor(templateId: string): Promise<string[]> {
  const rows = await drizzleDb
    .select({ publishedCourseId: courseVariant.publishedCourseId })
    .from(courseVariant)
    .where(eq(courseVariant.templateCourseId, templateId))
  return rows.map(r => r.publishedCourseId)
}

describe('Multi-country course publish end-to-end', () => {
  beforeAll(async () => {
    const now = new Date()
    await drizzleDb.insert(user).values({
      userId: tutorId,
      email: tutorEmail,
      role: 'TUTOR',
      createdAt: now,
      updatedAt: now,
    })
    await drizzleDb.insert(course).values([
      { courseId: templateCourseId, name: templateName, creatorId: tutorId },
      { courseId: globalTemplateCourseId, name: globalTemplateName, creatorId: tutorId },
    ])
    await drizzleDb.insert(courseLesson).values([
      { lessonId: templateLessonId, courseId: templateCourseId, title: 'Lesson 1', order: 0 },
      {
        lessonId: globalTemplateLessonId,
        courseId: globalTemplateCourseId,
        title: 'Lesson 1',
        order: 0,
      },
    ])
  })

  afterAll(async () => {
    // FK-safe teardown (children first). Delete copied + published courses, then
    // variant links, then template lessons/courses, then the tutor.
    const t = async (fn: () => Promise<unknown>) => {
      try {
        await fn()
      } catch {}
    }

    const publishedIds = [
      ...(await publishedCourseIdsFor(templateCourseId)),
      ...(await publishedCourseIdsFor(globalTemplateCourseId)),
    ]

    await t(() =>
      drizzleDb
        .delete(courseVariant)
        .where(inArray(courseVariant.templateCourseId, [templateCourseId, globalTemplateCourseId]))
    )
    if (publishedIds.length > 0) {
      await t(() =>
        drizzleDb.delete(courseLesson).where(inArray(courseLesson.courseId, publishedIds))
      )
      await t(() => drizzleDb.delete(course).where(inArray(course.courseId, publishedIds)))
    }
    await t(() =>
      drizzleDb
        .delete(courseLesson)
        .where(inArray(courseLesson.courseId, [templateCourseId, globalTemplateCourseId]))
    )
    await t(() =>
      drizzleDb
        .delete(course)
        .where(inArray(course.courseId, [templateCourseId, globalTemplateCourseId]))
    )
    await t(() => drizzleDb.delete(user).where(eq(user.userId, tutorId)))
  })

  it('publishes two nationality variants of one category to distinct published courses', async () => {
    const res = await publishVariants(
      makePostReq({ variants: [variant('Singapore'), variant('Korea')] }) as never,
      { params: Promise.resolve({ id: templateCourseId }) } as never
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.count).toBe(2)
    expect(data.variants).toHaveLength(2)
    expect(data.variants.every((v: { action: string }) => v.action === 'created')).toBe(true)

    // Exactly 2 CourseVariant rows exist for the template, one per nationality,
    // both sharing the requested category.
    const variantRows = await drizzleDb
      .select({
        category: courseVariant.category,
        nationality: courseVariant.nationality,
        publishedCourseId: courseVariant.publishedCourseId,
      })
      .from(courseVariant)
      .where(eq(courseVariant.templateCourseId, templateCourseId))

    expect(variantRows).toHaveLength(2)
    expect(new Set(variantRows.map(r => r.nationality))).toEqual(new Set(['Singapore', 'Korea']))
    expect(variantRows.every(r => r.category === CATEGORY)).toBe(true)

    // The 2 linked published courses exist, are published, and keep the bare
    // template name (no nationality suffix).
    const publishedRows = await drizzleDb
      .select({
        courseId: course.courseId,
        name: course.name,
        isPublished: course.isPublished,
      })
      .from(course)
      .where(
        inArray(
          course.courseId,
          variantRows.map(r => r.publishedCourseId)
        )
      )

    expect(publishedRows).toHaveLength(2)
    expect(publishedRows.every(r => r.isPublished === true)).toBe(true)
    expect(new Set(publishedRows.map(r => r.name))).toEqual(new Set([templateName]))
  })

  it('surfaces both variants via the GET handler', async () => {
    const res = await getVariants(
      makeGetReq(templateCourseId) as never,
      {
        params: Promise.resolve({ id: templateCourseId }),
      } as never
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.variants).toHaveLength(2)
    expect(new Set(data.variants.map((v: { nationality: string }) => v.nationality))).toEqual(
      new Set(['Singapore', 'Korea'])
    )
    expect(
      data.variants.every((v: { category: string; publishedCourseId: string }) => {
        return v.category === CATEGORY && typeof v.publishedCourseId === 'string'
      })
    ).toBe(true)
  })

  it('publishes a Global variant to a single course with the bare template name', async () => {
    const res = await publishVariants(
      makePostReq({ variants: [variant('Global')] }) as never,
      { params: Promise.resolve({ id: globalTemplateCourseId }) } as never
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.count).toBe(1)

    const variantRows = await drizzleDb
      .select({
        nationality: courseVariant.nationality,
        publishedCourseId: courseVariant.publishedCourseId,
      })
      .from(courseVariant)
      .where(eq(courseVariant.templateCourseId, globalTemplateCourseId))
    expect(variantRows).toHaveLength(1)
    expect(variantRows[0].nationality).toBe('Global')

    const [publishedRow] = await drizzleDb
      .select({ name: course.name, isPublished: course.isPublished })
      .from(course)
      .where(eq(course.courseId, variantRows[0].publishedCourseId))
    // Global keeps the bare template name — no " — Global" suffix.
    expect(publishedRow.name).toBe(globalTemplateName)
    expect(publishedRow.isPublished).toBe(true)
  })
})
