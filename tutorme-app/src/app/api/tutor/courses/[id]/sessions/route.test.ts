import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse, type NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  verifyCourseOwnership: vi.fn(),
}))

vi.mock('@/lib/api/course-helpers', () => ({
  verifyCourseOwnership: mocks.verifyCourseOwnership,
}))

vi.mock('@/lib/api/middleware', () => ({
  withAuth: (handler: any) => async (req: any, session: any, context: any) => {
    try {
      return await handler(req, session, context)
    } catch (err: any) {
      if (err.name === 'ForbiddenError') {
        return NextResponse.json({ error: err.message }, { status: 403 })
      }
      throw err
    }
  },
  ForbiddenError: class extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'ForbiddenError'
    }
  },
}))

vi.mock('@/lib/db/drizzle', () => ({
  drizzleDb: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
    query: {
      liveSession: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
    },
  },
}))

import { GET } from './route'

function makeReq(): NextRequest {
  return {
    url: 'http://localhost:3000/api/tutor/courses/course-1/sessions',
    nextUrl: new URL('http://localhost:3000/api/tutor/courses/course-1/sessions'),
  } as unknown as NextRequest
}

const session = { user: { id: 'tutor-1', role: 'TUTOR' } }
const context = { params: Promise.resolve({ id: 'course-1' }) }

describe('GET /api/tutor/courses/[id]/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyCourseOwnership.mockReset()
  })

  it('returns 403 when the tutor does not own the course', async () => {
    mocks.verifyCourseOwnership.mockResolvedValue(false)

    const res = await GET(makeReq(), session, context as any)

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'You do not have access to this course' })
    expect(mocks.verifyCourseOwnership).toHaveBeenCalledWith('course-1', 'tutor-1')
  })
})
