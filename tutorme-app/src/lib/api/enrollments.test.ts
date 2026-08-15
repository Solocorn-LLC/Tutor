import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  courseRow: null as {
    courseId: string
    isFree: boolean
    price: number | null
    currency: string | null
    isPublished: boolean
    deletedAt: Date | null
  } | null,
}))

vi.mock('@/lib/db/drizzle', () => ({
  drizzleDb: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(mocks.courseRow ? [mocks.courseRow] : [])),
        })),
      })),
    })),
  },
}))

import { enrollStudentInCourse } from './enrollments'

describe('enrollStudentInCourse', () => {
  beforeEach(() => {
    mocks.courseRow = {
      courseId: 'course-1',
      isFree: true,
      price: null,
      currency: null,
      isPublished: true,
      deletedAt: null,
    }
  })

  it('throws NotFoundError when course does not exist', async () => {
    mocks.courseRow = null

    await expect(enrollStudentInCourse('student-1', 'missing-course')).rejects.toThrow(
      'Course not found'
    )
  })

  it('throws ValidationError when course is deleted', async () => {
    mocks.courseRow = {
      courseId: 'course-1',
      isFree: true,
      price: null,
      currency: null,
      isPublished: true,
      deletedAt: new Date(),
    }

    await expect(enrollStudentInCourse('student-1', 'course-1')).rejects.toThrow(
      'Course is no longer available'
    )
  })

  it('throws ValidationError when course is unpublished', async () => {
    mocks.courseRow = {
      courseId: 'course-1',
      isFree: true,
      price: null,
      currency: null,
      isPublished: false,
      deletedAt: null,
    }

    await expect(enrollStudentInCourse('student-1', 'course-1')).rejects.toThrow(
      'Course is not available for enrollment'
    )
  })

  it('throws ValidationError for unpublished course even when payment is confirmed', async () => {
    mocks.courseRow = {
      courseId: 'course-1',
      isFree: false,
      price: 100,
      currency: 'USD',
      isPublished: false,
      deletedAt: null,
    }

    await expect(
      enrollStudentInCourse('student-1', 'course-1', null, null, true)
    ).rejects.toThrow('Course is not available for enrollment')
  })
})
