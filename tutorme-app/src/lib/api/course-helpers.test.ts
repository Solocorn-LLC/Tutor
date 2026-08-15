import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  courseRows: [] as Array<{
    courseId: string
    creatorId: string
    deletedAt: Date | null
  }>[],
}))

vi.mock('@/lib/db/drizzle', () => ({
  drizzleDb: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(mocks.courseRows)),
        })),
      })),
    })),
  },
}))

import { verifyCourseOwnership } from './course-helpers'

describe('verifyCourseOwnership', () => {
  beforeEach(() => {
    mocks.courseRows = []
  })

  it('returns true when the DB finds a matching non-deleted course owned by the user', async () => {
    mocks.courseRows = [{ courseId: 'course-1', creatorId: 'tutor-1', deletedAt: null }]
    const result = await verifyCourseOwnership('course-1', 'tutor-1')
    expect(result).toBe(true)
  })

  it('returns false when the DB finds no matching course (wrong owner, missing, or deleted)', async () => {
    mocks.courseRows = []
    const result = await verifyCourseOwnership('course-1', 'tutor-1')
    expect(result).toBe(false)
  })
})
