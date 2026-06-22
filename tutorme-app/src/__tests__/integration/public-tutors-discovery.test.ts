/**
 * Integration test: every tutor is discoverable on the Book-a-Tutor directory,
 * regardless of whether they've published a course.
 *
 * Seeds a tutor with NO courses and a tutor WITH a published course, then calls
 * the real GET /api/public/tutors handler and asserts BOTH are returned.
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { eq, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, profile, course } from '@/lib/db/schema'
import { GET as getTutors } from '@/app/api/public/tutors/route'

const stamp = Date.now()
const courselessTutorId = crypto.randomUUID()
const courseTutorId = crypto.randomUUID()
const allUserIds = [courselessTutorId, courseTutorId]
const courseId = `course_disc_${stamp}`

function req() {
  return new NextRequest('http://localhost/api/public/tutors?pageSize=100')
}

describe('public tutors discovery', () => {
  beforeAll(async () => {
    const now = new Date()
    await drizzleDb.insert(user).values([
      {
        userId: courselessTutorId,
        email: `claude-disc-nocourse-${stamp}@example.com`,
        role: 'TUTOR',
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: courseTutorId,
        email: `claude-disc-course-${stamp}@example.com`,
        role: 'TUTOR',
        createdAt: now,
        updatedAt: now,
      },
    ])
    await drizzleDb.insert(profile).values([
      { profileId: `prof_nc_${stamp}`, userId: courselessTutorId, name: 'Course-less Tutor' },
      { profileId: `prof_c_${stamp}`, userId: courseTutorId, name: 'Course Tutor' },
    ])
    // Only the second tutor has a published course.
    await drizzleDb
      .insert(course)
      .values({ courseId, name: 'Published Course', creatorId: courseTutorId, isPublished: true })
  })

  afterAll(async () => {
    const t = async (fn: () => Promise<unknown>) => {
      try {
        await fn()
      } catch {}
    }
    await t(() => drizzleDb.delete(course).where(eq(course.courseId, courseId)))
    await t(() => drizzleDb.delete(profile).where(inArray(profile.userId, allUserIds)))
    await t(() => drizzleDb.delete(user).where(inArray(user.userId, allUserIds)))
  })

  it('returns tutors with and without published courses', async () => {
    const res = await getTutors(req())
    expect(res.status).toBe(200)
    const data = await res.json()
    const ids: string[] = (data.tutors || []).map((t: { id: string }) => t.id)

    // The course-less tutor must be discoverable (the requirement).
    expect(ids).toContain(courselessTutorId)
    // The tutor with a published course is still listed.
    expect(ids).toContain(courseTutorId)

    // The course-less tutor renders sensibly: zero courses, no crash.
    const courseless = data.tutors.find((t: { id: string }) => t.id === courselessTutorId)
    expect(courseless.courseCount).toBe(0)
    expect(Array.isArray(courseless.specialties)).toBe(true)
  })
})
