import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse, type NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  // Drizzle state
  courseRows: [] as Array<{
    courseId: string
    categories: string[] | null
    creatorId: string | null
    isPublished: boolean
    deletedAt: Date | null
  }>,
  enrollmentRows: [] as Array<{ courseId: string; studentId: string }>,
  insertedRows: [] as Array<Record<string, unknown>>,
  selectIndex: 0,
  enrollStudentInCourse: vi.fn(),
  withRateLimitPreset: vi.fn(),
}))

vi.mock('@/lib/db/drizzle', () => ({
  drizzleDb: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn((n: number) => {
            mocks.selectIndex += 1
            if (mocks.selectIndex === 1) {
              return Promise.resolve(mocks.courseRows.slice(0, n))
            }
            return Promise.resolve(mocks.enrollmentRows.slice(0, n))
          }),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        mocks.insertedRows.push(values)
        return Promise.resolve(undefined)
      }),
    })),
  },
}))

vi.mock('@/lib/api/enrollments', () => ({
  enrollStudentInCourse: mocks.enrollStudentInCourse,
}))

vi.mock('@/lib/api/middleware', () => ({
  withAuth: (handler: any) => handler,
  withCsrf:
    (handler: any) =>
    async (req: any, ...args: any[]) => {
      try {
        return await handler(req, ...args)
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
    },
  withRateLimitPreset: mocks.withRateLimitPreset,
  ValidationError: class extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'ValidationError'
    }
  },
}))

import { POST } from './route'

function makeReq(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest
}

const session = { user: { id: 'student-1', role: 'STUDENT' } }

function insertedCourses() {
  return mocks.insertedRows.filter(r => 'categories' in r && 'name' in r)
}

function insertedLessons() {
  return mocks.insertedRows.filter(r => 'order' in r && 'title' in r)
}

describe('POST /api/student/subjects/enroll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.courseRows = []
    mocks.enrollmentRows = []
    mocks.insertedRows = []
    mocks.selectIndex = 0
    mocks.withRateLimitPreset.mockResolvedValue({ response: null, remaining: 10 })
    mocks.enrollStudentInCourse.mockResolvedValue({
      success: true,
      enrollment: { enrollmentId: 'enr-1' },
    })
  })

  it('returns 400 if subjectCode is missing', async () => {
    const res = await POST(makeReq({}), session)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Subject code required' })
  })

  it('returns 400 for an invalid subject code', async () => {
    const res = await POST(makeReq({ subjectCode: 'not-a-subject' }), session)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid subject code' })
  })

  it('enrolls in an existing platform-owned subject course', async () => {
    mocks.courseRows = [
      {
        courseId: 'platform-english-1',
        categories: ['english'],
        creatorId: null,
        isPublished: true,
        deletedAt: null,
      },
    ]

    const res = await POST(makeReq({ subjectCode: 'english' }), session)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(mocks.enrollStudentInCourse).toHaveBeenCalledWith('student-1', 'platform-english-1')
    expect(insertedCourses()).toHaveLength(0)
  })

  it('creates a new platform course when no matching subject course exists', async () => {
    const res = await POST(makeReq({ subjectCode: 'math' }), session)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(insertedCourses()).toHaveLength(1)
    const createdCourse = insertedCourses()[0]
    expect(createdCourse.categories).toEqual(['math'])
    expect(createdCourse.creatorId).toBeUndefined()
    expect(createdCourse.isPublished).toBe(true)
    expect(mocks.enrollStudentInCourse).toHaveBeenCalled()
    const enrolledCourseId = mocks.enrollStudentInCourse.mock.calls[0][1]
    expect(createdCourse.courseId).toBe(enrolledCourseId)
  })

  it('returns 400 if already enrolled in the resolved subject course', async () => {
    mocks.courseRows = [
      {
        courseId: 'platform-english-1',
        categories: ['english'],
        creatorId: null,
        isPublished: true,
        deletedAt: null,
      },
    ]
    mocks.enrollmentRows = [{ courseId: 'platform-english-1', studentId: 'student-1' }]

    const res = await POST(makeReq({ subjectCode: 'english' }), session)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Already enrolled in this subject' })
    expect(mocks.enrollStudentInCourse).not.toHaveBeenCalled()
  })

  it('creates default lessons for a new subject course', async () => {
    const res = await POST(makeReq({ subjectCode: 'precalculus' }), session)

    expect(res.status).toBe(200)
    const createdLessons = insertedLessons()
    expect(createdLessons.length).toBeGreaterThan(0)
    expect(createdLessons[0].title).toBe('Functions and Graphs')
  })
})
