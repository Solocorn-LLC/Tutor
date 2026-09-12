/**
 * Integration tests — BUG #4:
 * "Re-publishing an unpublished variant with edited times keeps stale sessions".
 *
 * In the publish route's same-course branch, ANY overlap between a desired slot
 * and an existing session of the (still-unpublished) variant was treated as
 * "session already exists": the session kept its stale scheduledAt and the new
 * slot was silently dropped.
 *
 * Correct behavior:
 *  (a) exact instant+duration match  → keep as-is (idempotent, no duplicate);
 *  (b) overlap with a different instant/duration on a future session of this
 *      unpublished variant → MOVE the session (preserving id, room,
 *      participants and lesson), unless the move would overlap the tutor's
 *      other commitments;
 *  (c) move-into-conflict → keep the session as-is (the publish-level 409
 *      conflict protection stays authoritative).
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 * All entities use the `fix24p_` prefix.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  user,
  course,
  courseLesson,
  courseVariant,
  courseSchedule,
  liveSession,
  calendarEvent,
} from '@/lib/db/schema'

const stamp = Date.now()
const tutorId = crypto.randomUUID()

const TEMPLATE = `fix24p_template_${stamp}`
const TEMPLATE_LESSON = `fix24p_lesson_${stamp}`
const ADHOC = `fix24p_adhoc_${stamp}`

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

const DATE_A = utcDayString(3 * 86_400_000)
const INSTANT_1000 = new Date(`${DATE_A}T10:00:00.000Z`)
const INSTANT_0930 = new Date(`${DATE_A}T09:30:00.000Z`)
const INSTANT_0900 = new Date(`${DATE_A}T09:00:00.000Z`)
const INSTANT_0915 = new Date(`${DATE_A}T09:15:00.000Z`)

function slotFor(dateStr: string, time: string, durationMinutes: number) {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  return {
    dayOfWeek: DAY_NAMES[d.getUTCDay()],
    date: dateStr,
    startTime: time,
    durationMinutes,
  }
}

function publishBody(time: string) {
  return {
    variants: [
      {
        category: 'math',
        nationality: 'Any',
        isPublished: true,
        isFree: true,
        price: 0,
        currency: 'USD',
        languageOfInstruction: 'English',
        schedules: [
          { scheduleIndex: 1, schedule: [slotFor(DATE_A, time, 60)], weeksToSchedule: 8 },
        ],
      },
    ],
  }
}

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
import { POST as publishVariants } from '@/app/api/tutor/courses/[id]/publish/route'

function publishReq(body: unknown) {
  return new NextRequest(`http://localhost/api/tutor/courses/${TEMPLATE}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const publishCtx = { params: Promise.resolve({ id: TEMPLATE }) } as any

async function variantCourseId(): Promise<string> {
  const [row] = await drizzleDb
    .select({ publishedCourseId: courseVariant.publishedCourseId })
    .from(courseVariant)
    .where(eq(courseVariant.templateCourseId, TEMPLATE))
    .limit(1)
  if (!row) throw new Error('variant course not found')
  return row.publishedCourseId
}

async function variantSessions() {
  const courseId = await variantCourseId()
  return drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      scheduledAt: liveSession.scheduledAt,
      durationMinutes: liveSession.durationMinutes,
      status: liveSession.status,
      lessonId: liveSession.lessonId,
      roomUrl: liveSession.roomUrl,
    })
    .from(liveSession)
    .where(eq(liveSession.courseId, courseId))
}

/**
 * The publish route only re-materializes sessions for NEW or STILL-UNPUBLISHED
 * variants ("published variants keep their existing schedule and sessions") —
 * which is exactly the contract bug #4 is about. Simulating the tutor's real
 * flow (publish → unpublish to edit the draft → re-publish) means flipping the
 * variant back to a draft before each re-publish.
 */
async function unpublishVariant() {
  const courseId = await variantCourseId()
  await drizzleDb
    .update(course)
    .set({ isPublished: false, updatedAt: new Date() })
    .where(eq(course.courseId, courseId))
}

describe('BUG #4: re-publishing a draft variant with edited times updates its sessions', () => {
  beforeAll(async () => {
    const now = new Date()
    await drizzleDb.insert(user).values({
      userId: tutorId,
      email: `fix24p-tutor-${stamp}@example.com`,
      role: 'TUTOR',
      createdAt: now,
      updatedAt: now,
    })
    await drizzleDb.insert(course).values({
      courseId: TEMPLATE,
      name: `fix24p_template_${stamp}`,
      creatorId: tutorId,
      categories: ['math'],
      isPublished: false,
    })
    await drizzleDb.insert(courseLesson).values({
      lessonId: TEMPLATE_LESSON,
      courseId: TEMPLATE,
      title: 'fix24p lesson 1',
      order: 1,
    })
  })

  afterAll(async () => {
    const t = async (fn: () => Promise<unknown>) => {
      try {
        await fn()
      } catch {}
    }
    const [variantRow] = await drizzleDb
      .select({ publishedCourseId: courseVariant.publishedCourseId })
      .from(courseVariant)
      .where(eq(courseVariant.templateCourseId, TEMPLATE))
      .limit(1)
    const courseIds = [TEMPLATE, ...(variantRow ? [variantRow.publishedCourseId] : [])]

    const sessionRows = await drizzleDb
      .select({ sessionId: liveSession.sessionId })
      .from(liveSession)
      .where(
        inArray(liveSession.sessionId, [
          ADHOC,
          ...(
            await drizzleDb
              .select({ sessionId: liveSession.sessionId })
              .from(liveSession)
              .where(inArray(liveSession.courseId, courseIds))
          ).map(r => r.sessionId),
        ])
      )
    const sessionIds = sessionRows.map(r => r.sessionId)

    await t(() =>
      drizzleDb.delete(calendarEvent).where(inArray(calendarEvent.externalId, sessionIds))
    )
    await t(() => drizzleDb.delete(liveSession).where(inArray(liveSession.sessionId, sessionIds)))
    await t(() =>
      drizzleDb.delete(courseSchedule).where(inArray(courseSchedule.courseId, courseIds))
    )
    await t(() => drizzleDb.delete(courseLesson).where(inArray(courseLesson.courseId, courseIds)))
    await t(() =>
      drizzleDb.delete(courseVariant).where(eq(courseVariant.templateCourseId, TEMPLATE))
    )
    await t(() => drizzleDb.delete(course).where(inArray(course.courseId, courseIds)))
    await t(() => drizzleDb.delete(user).where(eq(user.userId, tutorId)))
  })

  it('first publish materializes one session at the requested slot with a lesson', async () => {
    const res = await publishVariants(
      publishReq(publishBody('10:00')) as unknown as NextRequest,
      publishCtx
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    const sessions = await variantSessions()
    expect(sessions).toHaveLength(1)
    expect(Math.abs(sessions[0].scheduledAt.getTime() - INSTANT_1000.getTime())).toBeLessThan(1000)
    expect(sessions[0].status).toBe('scheduled')
    // The published lesson copy is assigned to the session.
    const courseId = await variantCourseId()
    const [publishedLesson] = await drizzleDb
      .select({ lessonId: courseLesson.lessonId })
      .from(courseLesson)
      .where(and(eq(courseLesson.courseId, courseId), isNull(courseLesson.deletedAt)))
    expect(publishedLesson).toBeDefined()
    expect(sessions[0].lessonId).toBe(publishedLesson.lessonId)
  })

  it('exact-match re-publish is idempotent (no duplicate, no change)', async () => {
    const before = await variantSessions()
    expect(before).toHaveLength(1)

    await unpublishVariant()
    const res = await publishVariants(
      publishReq(publishBody('10:00')) as unknown as NextRequest,
      publishCtx
    )
    expect(res.status).toBe(200)

    const after = await variantSessions()
    expect(after).toHaveLength(1)
    expect(after[0].sessionId).toBe(before[0].sessionId)
    expect(Math.abs(after[0].scheduledAt.getTime() - INSTANT_1000.getTime())).toBeLessThan(1000)
    expect(after[0].lessonId).toBe(before[0].lessonId)
  })

  it('re-publish with an edited time MOVES the existing session in place', async () => {
    const before = await variantSessions()
    expect(before).toHaveLength(1)

    await unpublishVariant()
    const res = await publishVariants(
      publishReq(publishBody('09:30')) as unknown as NextRequest,
      publishCtx
    )
    expect(res.status).toBe(200)

    const after = await variantSessions()
    expect(after).toHaveLength(1)
    // Same session row (id, room, participants) — only the time changed.
    expect(after[0].sessionId).toBe(before[0].sessionId)
    expect(after[0].roomUrl).toBe(before[0].roomUrl)
    expect(Math.abs(after[0].scheduledAt.getTime() - INSTANT_0930.getTime())).toBeLessThan(1000)
    // Lesson assignment survives the move.
    expect(after[0].lessonId).toBe(before[0].lessonId)
    // Nothing is left at the old instant.
    expect(
      after.every(s => Math.abs(s.scheduledAt.getTime() - INSTANT_1000.getTime()) > 1000)
    ).toBe(true)
    // The CalendarEvent projection follows the session.
    const [ce] = await drizzleDb
      .select({ startTime: calendarEvent.startTime, endTime: calendarEvent.endTime })
      .from(calendarEvent)
      .where(and(eq(calendarEvent.externalId, after[0].sessionId), isNull(calendarEvent.deletedAt)))
    expect(ce).toBeDefined()
    expect(Math.abs(ce.startTime.getTime() - INSTANT_0930.getTime())).toBeLessThan(1000)
  })

  it('re-publish at the moved time is idempotent (no duplicate)', async () => {
    const before = await variantSessions()
    expect(before).toHaveLength(1)

    await unpublishVariant()
    const res = await publishVariants(
      publishReq(publishBody('09:30')) as unknown as NextRequest,
      publishCtx
    )
    expect(res.status).toBe(200)

    const after = await variantSessions()
    expect(after).toHaveLength(1)
    expect(after[0].sessionId).toBe(before[0].sessionId)
  })

  it('re-publish moving into another commitment fails with 409 and keeps the session put', async () => {
    // Another of the tutor's sessions occupies 09:15–10:15, overlapping the
    // desired 09:00–10:00 slot.
    await drizzleDb.insert(liveSession).values({
      sessionId: ADHOC,
      tutorId,
      title: `fix24p_adhoc_${stamp}`,
      category: 'math',
      status: 'scheduled',
      sessionType: 'ADHOC',
      scheduledAt: INSTANT_0915,
      durationMinutes: 60,
      maxStudents: 50,
    })

    const before = await variantSessions()
    expect(before).toHaveLength(1)

    await unpublishVariant()
    const res = await publishVariants(
      publishReq(publishBody('09:00')) as unknown as NextRequest,
      publishCtx
    )
    // The existing 409 conflict protection stays authoritative: the publish
    // fails, reports the skipped slot, and the session keeps its 09:30 time.
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('SESSION_CONFLICTS')
    expect(Array.isArray(body.skippedSessions)).toBe(true)
    expect(body.skippedSessions.length).toBeGreaterThan(0)

    const after = await variantSessions()
    expect(after).toHaveLength(1)
    expect(after[0].sessionId).toBe(before[0].sessionId)
    expect(Math.abs(after[0].scheduledAt.getTime() - INSTANT_0930.getTime())).toBeLessThan(1000)
    // No new session was created at the conflicting 09:00 slot.
    expect(
      after.every(s => Math.abs(s.scheduledAt.getTime() - INSTANT_0900.getTime()) > 1000)
    ).toBe(true)
    // The other commitment is untouched.
    const [adhoc] = await drizzleDb
      .select({ status: liveSession.status, scheduledAt: liveSession.scheduledAt })
      .from(liveSession)
      .where(eq(liveSession.sessionId, ADHOC))
    expect(adhoc?.status).toBe('scheduled')
  })
})
