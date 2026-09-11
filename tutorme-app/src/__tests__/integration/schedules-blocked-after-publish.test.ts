/**
 * Integration tests — BUG #2:
 * "PUT/POST/DELETE /api/tutor/courses/[id]/schedules stays operational after publish".
 *
 * The schedules endpoint is keyed by TEMPLATE course ids, but the old guard only
 * checked `course.isPublished` of the passed id — and templates are never
 * published (their variants are). So after publishing, the endpoint happily
 * rewrote live published-course sessions via template-id schedule
 * materialization (template-level sessions with no lessonId, drifting from the
 * variant's own CourseSchedule rows).
 *
 * Correct behavior: once a template has ANY published variant — or a published
 * variant id is passed directly — POST/PUT/DELETE return 409. Templates with
 * only draft variants and plain legacy unpublished courses stay editable.
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 * All entities use the `fix24g_` prefix.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, course, courseVariant, courseSchedule, liveSession, calendarEvent } from '@/lib/db/schema'

const stamp = Date.now()
const tutorId = crypto.randomUUID()

const TEMPLATE_PUB = `fix24g_template_pub_${stamp}`
const PUB_VARIANT = `fix24g_pub_variant_${stamp}`
const TEMPLATE_DRAFT = `fix24g_template_draft_${stamp}`
const DRAFT_VARIANT = `fix24g_draft_variant_${stamp}`
const LEGACY = `fix24g_legacy_${stamp}`

const SCHED_PUB = `fix24g_sched_pub_${stamp}`
const SCHED_DRAFT = `fix24g_sched_draft_${stamp}`
const SCHED_LEGACY = `fix24g_sched_legacy_${stamp}`

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

function utcDayString(msFromNow: number): string {
  return new Date(Date.now() + msFromNow).toISOString().slice(0, 10)
}

function slotFor(dateStr: string, time: string, durationMinutes: number) {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  return {
    dayOfWeek: DAY_NAMES[d.getUTCDay()],
    date: dateStr,
    startTime: time,
    durationMinutes,
  }
}

const SLOT_FUTURE = [slotFor(utcDayString(3 * 86_400_000), '10:00', 60)]
const SLOT_FUTURE_B = [slotFor(utcDayString(4 * 86_400_000), '11:00', 60)]

const GUARD_MESSAGE = 'Schedules cannot be changed after publishing'

// Middleware: pass-through with a fixed TUTOR session.
vi.mock('@/lib/api/middleware', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    withCsrf: (h: unknown) => h,
    withAuth:
      (h: (req: unknown, session: unknown, context: unknown) => unknown) =>
      (req: unknown, context: unknown) =>
        h(req, { user: { id: tutorId, role: 'TUTOR' } }, context),
  }
})

// Import route handlers AFTER middleware is mocked.
import {
  POST as postSchedule,
  PUT as putSchedule,
  DELETE as deleteSchedule,
} from '@/app/api/tutor/courses/[id]/schedules/route'

function postReq(courseId: string, body: unknown) {
  return new NextRequest(`http://localhost/api/tutor/courses/${courseId}/schedules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function putReq(courseId: string, body: unknown) {
  return new NextRequest(`http://localhost/api/tutor/courses/${courseId}/schedules`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deleteReq(courseId: string, scheduleId: string) {
  return new NextRequest(
    `http://localhost/api/tutor/courses/${courseId}/schedules?scheduleId=${encodeURIComponent(scheduleId)}`,
    { method: 'DELETE' }
  )
}

function ctx(courseId: string) {
  return { params: Promise.resolve({ id: courseId }) } as any
}

describe('BUG #2: schedules endpoint is blocked once a course is published', () => {
  beforeAll(async () => {
    const now = new Date()

    await drizzleDb.insert(user).values({
      userId: tutorId,
      email: `fix24g-tutor-${stamp}@example.com`,
      role: 'TUTOR',
      createdAt: now,
      updatedAt: now,
    })

    await drizzleDb.insert(course).values([
      {
        courseId: TEMPLATE_PUB,
        name: `fix24g_template_pub_${stamp}`,
        creatorId: tutorId,
        categories: ['math'],
        isPublished: false,
      },
      {
        courseId: PUB_VARIANT,
        name: `fix24g_pub_variant_${stamp}`,
        creatorId: tutorId,
        categories: ['math'],
        isPublished: true,
      },
      {
        courseId: TEMPLATE_DRAFT,
        name: `fix24g_template_draft_${stamp}`,
        creatorId: tutorId,
        categories: ['math'],
        isPublished: false,
      },
      {
        courseId: DRAFT_VARIANT,
        name: `fix24g_draft_variant_${stamp}`,
        creatorId: tutorId,
        categories: ['math'],
        isPublished: false,
      },
      {
        courseId: LEGACY,
        name: `fix24g_legacy_${stamp}`,
        creatorId: tutorId,
        categories: ['math'],
        isPublished: false,
      },
    ])

    await drizzleDb.insert(courseVariant).values([
      {
        variantId: `fix24g_var_pub_${stamp}`,
        templateCourseId: TEMPLATE_PUB,
        publishedCourseId: PUB_VARIANT,
        nationality: 'Any',
        category: 'math',
        createdAt: now,
        updatedAt: now,
      },
      {
        variantId: `fix24g_var_draft_${stamp}`,
        templateCourseId: TEMPLATE_DRAFT,
        publishedCourseId: DRAFT_VARIANT,
        nationality: 'Any',
        category: 'math',
        createdAt: now,
        updatedAt: now,
      },
    ])

    await drizzleDb.insert(courseSchedule).values([
      {
        scheduleId: SCHED_PUB,
        courseId: TEMPLATE_PUB,
        scheduleIndex: 1,
        schedule: SLOT_FUTURE,
        weeksToSchedule: 8,
        enrolledCount: 0,
      },
      {
        scheduleId: SCHED_DRAFT,
        courseId: TEMPLATE_DRAFT,
        scheduleIndex: 1,
        schedule: [],
        weeksToSchedule: 8,
        enrolledCount: 0,
      },
      {
        scheduleId: SCHED_LEGACY,
        courseId: LEGACY,
        scheduleIndex: 1,
        schedule: SLOT_FUTURE,
        weeksToSchedule: 8,
        enrolledCount: 0,
      },
    ])
  })

  afterAll(async () => {
    const scheduleRows = await drizzleDb
      .select({ scheduleId: courseSchedule.scheduleId })
      .from(courseSchedule)
      .where(
        inArray(courseSchedule.courseId, [TEMPLATE_PUB, TEMPLATE_DRAFT, LEGACY, PUB_VARIANT, DRAFT_VARIANT])
      )
    const scheduleIds = [SCHED_PUB, SCHED_DRAFT, ...scheduleRows.map(r => r.scheduleId)]

    const sessionRows = await drizzleDb
      .select({ sessionId: liveSession.sessionId })
      .from(liveSession)
      .where(inArray(liveSession.scheduleId, scheduleIds))
    const sessionIds = sessionRows.map(r => r.sessionId)

    await drizzleDb.delete(calendarEvent).where(inArray(calendarEvent.externalId, sessionIds))
    await drizzleDb.delete(liveSession).where(inArray(liveSession.sessionId, sessionIds))
    await drizzleDb.delete(courseSchedule).where(inArray(courseSchedule.scheduleId, scheduleIds))
    await drizzleDb
      .delete(courseVariant)
      .where(inArray(courseVariant.templateCourseId, [TEMPLATE_PUB, TEMPLATE_DRAFT]))
    await drizzleDb
      .delete(course)
      .where(
        inArray(course.courseId, [TEMPLATE_PUB, PUB_VARIANT, TEMPLATE_DRAFT, DRAFT_VARIANT, LEGACY])
      )
    await drizzleDb.delete(user).where(eq(user.userId, tutorId))
  })

  it('POST is rejected (409) for a template that has a published variant', async () => {
    const res = await postSchedule(postReq(TEMPLATE_PUB, { schedule: SLOT_FUTURE_B }) as unknown as NextRequest, ctx(TEMPLATE_PUB))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain(GUARD_MESSAGE)

    // Nothing was created.
    const rows = await drizzleDb
      .select({ scheduleId: courseSchedule.scheduleId })
      .from(courseSchedule)
      .where(eq(courseSchedule.courseId, TEMPLATE_PUB))
    expect(rows).toHaveLength(1) // only the pre-seeded schedule
  })

  it('PUT is rejected (409) for a template that has a published variant', async () => {
    const res = await putSchedule(
      putReq(TEMPLATE_PUB, { scheduleId: SCHED_PUB, schedule: SLOT_FUTURE_B }) as unknown as NextRequest,
      ctx(TEMPLATE_PUB)
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain(GUARD_MESSAGE)
  })

  it('DELETE is rejected (409) for a template that has a published variant', async () => {
    const res = await deleteSchedule(
      deleteReq(TEMPLATE_PUB, SCHED_PUB) as unknown as NextRequest,
      ctx(TEMPLATE_PUB)
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain(GUARD_MESSAGE)

    const [row] = await drizzleDb
      .select({ scheduleId: courseSchedule.scheduleId })
      .from(courseSchedule)
      .where(eq(courseSchedule.scheduleId, SCHED_PUB))
    expect(row).toBeDefined()
  })

  it('POST is rejected (409) when the published variant id is passed directly', async () => {
    const res = await postSchedule(postReq(PUB_VARIANT, { schedule: SLOT_FUTURE_B }) as unknown as NextRequest, ctx(PUB_VARIANT))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain(GUARD_MESSAGE)
  })

  it('PUT is rejected (409) when the published variant id is passed directly', async () => {
    const res = await putSchedule(
      putReq(PUB_VARIANT, { scheduleId: `fix24g_nope_${stamp}`, schedule: SLOT_FUTURE_B }) as unknown as NextRequest,
      ctx(PUB_VARIANT)
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain(GUARD_MESSAGE)
  })

  it('POST still works for a template whose variants are all drafts', async () => {
    const res = await postSchedule(
      postReq(TEMPLATE_DRAFT, { schedule: SLOT_FUTURE, weeksToSchedule: 8 }) as unknown as NextRequest,
      ctx(TEMPLATE_DRAFT)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.schedule.courseId).toBe(TEMPLATE_DRAFT)
    expect(body.sessionsCreated).toBe(1)
  })

  it('PUT still works for a template whose variants are all drafts', async () => {
    const res = await putSchedule(
      putReq(TEMPLATE_DRAFT, { scheduleId: SCHED_DRAFT, schedule: SLOT_FUTURE_B }) as unknown as NextRequest,
      ctx(TEMPLATE_DRAFT)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.schedule.scheduleId).toBe(SCHED_DRAFT)
    expect(body.sessionsCreated).toBe(1)
  })

  it('DELETE still works for a plain legacy unpublished course', async () => {
    const res = await deleteSchedule(
      deleteReq(LEGACY, SCHED_LEGACY) as unknown as NextRequest,
      ctx(LEGACY)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    const [row] = await drizzleDb
      .select({ scheduleId: courseSchedule.scheduleId })
      .from(courseSchedule)
      .where(eq(courseSchedule.scheduleId, SCHED_LEGACY))
    expect(row).toBeUndefined()
  })
})
