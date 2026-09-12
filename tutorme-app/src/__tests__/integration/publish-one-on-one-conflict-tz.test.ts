/**
 * Integration test (regression): publish route 1-on-1 conflict window uses
 * midnight-UTC `requestedDate` instead of the booking's true UTC instant.
 *
 * BUG: src/app/api/tutor/courses/[id]/publish/route.ts fetches ACCEPTED/PAID
 * 1-on-1 bookings and computes the overlap window as
 * `requestedDate -> requestedDate + durationMinutes`. But per
 * src/lib/one-on-one/time.ts, `requestedDate` is midnight UTC of the picked
 * calendar date — the true instant is midnight UTC + HH:MM interpreted in the
 * booking's own timezone (see bookingInstants()). The correct math (as done by
 * slotInstants in src/lib/schedule/conflicts.ts) therefore disagrees with the
 * publish route whenever the booking timezone is not UTC.
 *
 * These tests assert the CORRECT behavior, so they FAIL while the bug exists:
 *
 *   1. TRUE OVERLAP MISSED: a Shanghai 15:00-16:00 booking on 2027-03-15 is
 *      truly 07:00-08:00 UTC. A course slot materializing a session at exactly
 *      07:00-08:00 UTC that day must make publish fail with 409
 *      SESSION_CONFLICTS (reason 'one_on_one'). Buggy code compares against
 *      [midnight, 01:00) UTC and lets the publish succeed (200).
 *
 *   2. FALSE OVERLAP FLAGGED: a course slot at 00:00-01:00 UTC does NOT truly
 *      overlap the same booking (true instant 07:00-08:00 UTC), so publish must
 *      succeed (200). Buggy code computes the booking window as
 *      [midnight, 01:00) UTC, which overlaps the 00:00-01:00 session, and
 *      wrongly rejects the publish with 409.
 *
 * The tutor is created with NO calendarAvailability rows, so the publish route
 * falls back to tutorTimeZone = 'UTC' and schedule slots are interpreted as UTC
 * wall clock. An earlier slot on 2027-03-08 in test 1 ensures the buggy fetch
 * filter (`requestedDate` between min/max session instant) actually returns the
 * booking.
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { eq, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  user,
  course,
  courseLesson,
  courseVariant,
  courseSchedule,
  liveSession,
  calendarEvent,
  oneOnOneBookingRequest,
} from '@/lib/db/schema'
import { bookingInstants, requestedDateFromString } from '@/lib/one-on-one/time'

const stamp = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`

const tutorId = crypto.randomUUID()
const studentId = crypto.randomUUID()
const tutorEmail = `puboo-tutor-${stamp}@example.com`
const studentEmail = `puboo-stu-${stamp}@example.com`

// Two independent template courses so each test publishes its own variant.
const TEMPLATE_A = `puboo_tpl_a_${stamp}`
const TEMPLATE_B = `puboo_tpl_b_${stamp}`
const LESSON_A = `puboo_lesson_a_${stamp}`
const LESSON_B = `puboo_lesson_b_${stamp}`

// Bookings: picked calendar date 2027-03-15, wall clock 15:00-16:00 in
// Asia/Shanghai (UTC+8, no DST) → true UTC instant 2027-03-15 07:00-08:00Z.
const BOOKING_DATE = '2027-03-15'
const BOOKING_REQ_A = `puboo_book_a_${stamp}`
const BOOKING_REQ_B = `puboo_book_b_${stamp}`

// Mock auth so the real route handlers run as our seeded tutor (user.id must
// equal the seeded tutor's id so verifyCourseOwnership passes). The Bearer
// header on POST makes requireCsrf short-circuit (server-to-server callers).
const mockSession = {
  user: { id: tutorId, email: tutorEmail, role: 'TUTOR' as const },
  expires: new Date(Date.now() + 86400 * 1000).toISOString(),
}
vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve(mockSession)),
  authOptions: {},
}))

// Imported after the mock is registered (hoisted by vitest anyway).
import { POST as publishVariants } from '@/app/api/tutor/courses/[id]/publish/route'

function makePostReq(templateCourseId: string, body: unknown): Request {
  return new Request(`http://localhost/api/tutor/courses/${templateCourseId}/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-integration',
    },
    body: JSON.stringify(body),
  })
}

function variantPayload(nationality: string, schedule: unknown[]) {
  return {
    category: 'math',
    nationality,
    isPublished: true,
    isFree: true,
    price: 0,
    currency: 'USD',
    languageOfInstruction: 'English',
    schedules: [
      {
        scheduleIndex: 1,
        name: `Schedule ${nationality}`,
        schedule,
        weeksToSchedule: 1,
        maxStudents: 50,
      },
    ],
  }
}

function bookingRow(requestId: string) {
  return {
    requestId,
    tutorId,
    studentId,
    requestedDate: requestedDateFromString(BOOKING_DATE), // midnight UTC of picked date
    startTime: '15:00',
    endTime: '16:00',
    timezone: 'Asia/Shanghai',
    durationMinutes: 60,
    costPerSession: 45,
    status: 'ACCEPTED' as const,
    paidAt: new Date(),
  }
}

describe('publish route 1-on-1 conflict window (timezone-aware instants)', () => {
  beforeAll(async () => {
    const now = new Date()
    await drizzleDb.insert(user).values([
      {
        userId: tutorId,
        email: tutorEmail,
        role: 'TUTOR',
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: studentId,
        email: studentEmail,
        role: 'STUDENT',
        createdAt: now,
        updatedAt: now,
      },
    ])
    await drizzleDb.insert(course).values([
      {
        courseId: TEMPLATE_A,
        name: `puboo Template A ${stamp}`,
        creatorId: tutorId,
        categories: ['math'],
      },
      {
        courseId: TEMPLATE_B,
        name: `puboo Template B ${stamp}`,
        creatorId: tutorId,
        categories: ['math'],
      },
    ])
    await drizzleDb.insert(courseLesson).values([
      { lessonId: LESSON_A, courseId: TEMPLATE_A, title: 'Lesson 1', order: 0 },
      { lessonId: LESSON_B, courseId: TEMPLATE_B, title: 'Lesson 1', order: 0 },
    ])
    await drizzleDb
      .insert(oneOnOneBookingRequest)
      .values([bookingRow(BOOKING_REQ_A), bookingRow(BOOKING_REQ_B)])

    // Sanity-check our fixture assumption: the true UTC instant of the booking
    // is 2027-03-15 07:00-08:00Z (15:00 Asia/Shanghai = UTC+8).
    const [{ requestedDate, startTime, endTime, timezone }] = await drizzleDb
      .select({
        requestedDate: oneOnOneBookingRequest.requestedDate,
        startTime: oneOnOneBookingRequest.startTime,
        endTime: oneOnOneBookingRequest.endTime,
        timezone: oneOnOneBookingRequest.timezone,
      })
      .from(oneOnOneBookingRequest)
      .where(eq(oneOnOneBookingRequest.requestId, BOOKING_REQ_A))
    const trueInstant = bookingInstants({ requestedDate, startTime, endTime, timezone })
    expect(trueInstant.start.toISOString()).toBe('2027-03-15T07:00:00.000Z')
    expect(trueInstant.end.toISOString()).toBe('2027-03-15T08:00:00.000Z')
  })

  afterAll(async () => {
    const t = async (fn: () => Promise<unknown>) => {
      try {
        await fn()
      } catch {}
    }

    const templateIds = [TEMPLATE_A, TEMPLATE_B]
    const publishedRows = await drizzleDb
      .select({ publishedCourseId: courseVariant.publishedCourseId })
      .from(courseVariant)
      .where(inArray(courseVariant.templateCourseId, templateIds))
    const publishedIds = publishedRows.map(r => r.publishedCourseId)
    const allCourseIds = [...templateIds, ...publishedIds]

    // Sessions + their calendar-event projections (scope to this tutor only).
    const sessionRows = await drizzleDb
      .select({ sessionId: liveSession.sessionId })
      .from(liveSession)
      .where(eq(liveSession.tutorId, tutorId))
    const sessionIds = sessionRows.map(r => r.sessionId)

    await t(() =>
      drizzleDb
        .delete(oneOnOneBookingRequest)
        .where(inArray(oneOnOneBookingRequest.requestId, [BOOKING_REQ_A, BOOKING_REQ_B]))
    )
    if (sessionIds.length > 0) {
      await t(() =>
        drizzleDb.delete(calendarEvent).where(inArray(calendarEvent.externalId, sessionIds))
      )
      await t(() => drizzleDb.delete(liveSession).where(inArray(liveSession.sessionId, sessionIds)))
    }
    if (publishedIds.length > 0) {
      await t(() =>
        drizzleDb.delete(courseSchedule).where(inArray(courseSchedule.courseId, publishedIds))
      )
      await t(() =>
        drizzleDb.delete(courseLesson).where(inArray(courseLesson.courseId, publishedIds))
      )
    }
    await t(() =>
      drizzleDb.delete(courseVariant).where(inArray(courseVariant.templateCourseId, templateIds))
    )
    await t(() => drizzleDb.delete(courseLesson).where(inArray(courseLesson.courseId, templateIds)))
    await t(() => drizzleDb.delete(course).where(inArray(course.courseId, allCourseIds)))
    await t(() => drizzleDb.delete(user).where(inArray(user.userId, [tutorId, studentId])))
  })

  it('flags a course session that truly overlaps the booking (true instant 07:00-08:00 UTC)', async () => {
    // Slot B materializes a session at exactly the booking's true instant
    // (2027-03-15 07:00-08:00 UTC). Slot A a week earlier only serves to widen
    // the fetch range so the buggy query returns the booking at all.
    const res = await publishVariants(
      makePostReq(TEMPLATE_A, {
        variants: [
          variantPayload('PubooA', [
            { dayOfWeek: 'Monday', startTime: '07:00', durationMinutes: 60, date: '2027-03-08' },
            { dayOfWeek: 'Monday', startTime: '07:00', durationMinutes: 60, date: '2027-03-15' },
          ]),
        ],
      }) as never,
      { params: Promise.resolve({ id: TEMPLATE_A }) } as never
    )

    const data = await res.json().catch(() => ({}))
    // CORRECT: the 2027-03-15 07:00Z session truly overlaps the booking, so the
    // publish must fail atomically with a 1-on-1 conflict.
    expect(
      res.status,
      `expected 409 SESSION_CONFLICTS (slot at 2027-03-15T07:00Z overlaps the ` +
        `Shanghai 15:00 booking), got ${res.status}: ${JSON.stringify(data)}`
    ).toBe(409)
    expect(data.code).toBe('SESSION_CONFLICTS')
    expect(
      (data.skippedSessions ?? []).some((s: { reason: string }) => s.reason === 'one_on_one'),
      `expected a skipped session with reason 'one_on_one', got ${JSON.stringify(data.skippedSessions)}`
    ).toBe(true)

    // And the conflicting session must NOT have been materialized (rollback).
    const materialized = await drizzleDb
      .select({ sessionId: liveSession.sessionId })
      .from(liveSession)
      .where(eq(liveSession.tutorId, tutorId))
    expect(materialized).toHaveLength(0)
  })

  it('allows a course session that only overlaps the buggy midnight-UTC window (00:00-01:00 UTC)', async () => {
    // The 2027-03-15 00:00-01:00 UTC session does NOT overlap the booking's true
    // instant (07:00-08:00 UTC). Only the buggy math (requestedDate midnight +
    // durationMinutes) "overlaps" it.
    const res = await publishVariants(
      makePostReq(TEMPLATE_B, {
        variants: [
          variantPayload('PubooB', [
            { dayOfWeek: 'Monday', startTime: '00:00', durationMinutes: 60, date: '2027-03-15' },
          ]),
        ],
      }) as never,
      { params: Promise.resolve({ id: TEMPLATE_B }) } as never
    )

    const data = await res.json().catch(() => ({}))
    // CORRECT: no true overlap → publish succeeds and materializes the session.
    expect(
      res.status,
      `expected 200 (session 2027-03-15T00:00Z does not overlap the true booking ` +
        `instant 07:00-08:00Z), got ${res.status}: ${JSON.stringify(data)}`
    ).toBe(200)
    expect(data.success).toBe(true)

    const materialized = await drizzleDb
      .select({ sessionId: liveSession.sessionId, scheduledAt: liveSession.scheduledAt })
      .from(liveSession)
      .where(eq(liveSession.tutorId, tutorId))
    expect(materialized).toHaveLength(1)
    expect(materialized[0].scheduledAt.toISOString()).toBe('2027-03-15T00:00:00.000Z')
  })
})
