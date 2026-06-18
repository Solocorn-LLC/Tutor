/**
 * Unit tests for GET /api/courses/list
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  whereMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getServerSession: mocks.getServerSession,
  authOptions: {},
}))

vi.mock('@/lib/db/drizzle', () => ({
  drizzleDb: {
    select: mocks.selectMock,
  },
}))

import { GET } from './route'

describe('GET /api/courses/list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.getServerSession.mockResolvedValue(null)
    const req = new Request('http://localhost/api/courses/list')
    const res = await GET(req as NextRequest)

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized - Please log in' })
  })

  it('returns published courses when authenticated', async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: 'user-1', role: 'STUDENT' },
    })

    const mockCourses = [
      {
        courseId: 'course-1',
        name: 'Math 101',
        description: 'Basic math',
        categories: ['math'],
        price: 50,
        currency: 'USD',
        isFree: false,
        createdAt: new Date('2024-01-01'),
      },
    ]

    // Build chainable mock for Drizzle queries
    const chainable = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      then: vi.fn((cb: any) => Promise.resolve(cb(mockCourses))),
    }

    mocks.selectMock.mockImplementation(() => chainable)

    const req = new Request('http://localhost/api/courses/list') as NextRequest
    // @ts-expect-error — mock nextUrl for test environment
    req.nextUrl = new URL('http://localhost/api/courses/list')

    const res = await GET(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.courses).toBeDefined()
    expect(Array.isArray(json.courses)).toBe(true)
    expect(json.courses[0]).toMatchObject({
      id: 'course-1',
      name: 'Math 101',
      subject: 'math',
    })
  })
})
