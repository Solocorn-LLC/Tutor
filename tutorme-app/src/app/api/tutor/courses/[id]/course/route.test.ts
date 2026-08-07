import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  updateCourseBuilderData: vi.fn(),
  propagateLessonsToVariant: vi.fn(),
  verifyCourseOwnership: vi.fn(),
  selectCourseVariant: vi.fn(),
  updateCourseDescription: vi.fn(),
}))

vi.mock('@/lib/services/course-builder.service', () => ({
  CourseBuilderService: {
    updateCourseBuilderData: mocks.updateCourseBuilderData,
    propagateLessonsToVariant: mocks.propagateLessonsToVariant,
  },
  LESSON_DEPLOYED_ERROR: 'LESSON_HAS_DEPLOYMENTS',
  EMPTY_SAVE_ERROR: 'EMPTY_LESSON_SAVE',
}))

vi.mock('@/lib/api/course-helpers', () => ({
  verifyCourseOwnership: mocks.verifyCourseOwnership,
}))

vi.mock('@/lib/db/drizzle', () => ({
  drizzleDb: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: mocks.updateCourseDescription,
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(mocks.selectCourseVariant())),
      })),
    })),
  },
}))

vi.mock('@/lib/api/middleware', () => ({
  withAuth: (handler: any) => handler,
  withCsrf: (handler: any) => handler,
}))

import { PUT } from './route'

function makeReq(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest
}

const session = { user: { id: 'tutor-1', role: 'TUTOR' } }

describe('PUT /api/tutor/courses/[id]/course', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyCourseOwnership.mockResolvedValue(true)
    mocks.updateCourseBuilderData.mockResolvedValue(undefined)
    mocks.propagateLessonsToVariant.mockResolvedValue(undefined)
    mocks.updateCourseDescription.mockResolvedValue(undefined)
  })

  it('saves lessons for a standalone published course', async () => {
    mocks.selectCourseVariant.mockResolvedValue([])

    const res = await PUT(makeReq({ lessons: [{ id: 'l1' }] }), session, {
      params: Promise.resolve({ id: 'course-1' }),
    } as any)

    expect(res.status).toBe(200)
    expect(mocks.updateCourseBuilderData).toHaveBeenCalledWith('course-1', 'tutor-1', [
      { id: 'l1' },
    ])
    expect(mocks.propagateLessonsToVariant).not.toHaveBeenCalled()
  })

  it('propagates to sibling variants when propagateToVariants=true', async () => {
    // First query: the current course's variant row.
    // Second query: sibling variants under the same template.
    mocks.selectCourseVariant
      .mockResolvedValueOnce([
        {
          variantId: 'v1',
          templateCourseId: 'tmpl-1',
          publishedCourseId: 'course-1',
        },
      ])
      .mockResolvedValueOnce([
        { publishedCourseId: 'course-1' },
        { publishedCourseId: 'sibling-1' },
      ])

    const res = await PUT(
      makeReq({ lessons: [{ id: 'l1' }], propagateToVariants: true }),
      session,
      { params: Promise.resolve({ id: 'course-1' }) } as any
    )

    expect(res.status).toBe(200)
    expect(mocks.propagateLessonsToVariant).toHaveBeenCalledWith('sibling-1', 'tutor-1', [
      { id: 'l1' },
    ])
  })

  it('returns 409 when updateCourseBuilderData throws LESSON_DEPLOYED_ERROR', async () => {
    mocks.selectCourseVariant.mockResolvedValue([])
    mocks.updateCourseBuilderData.mockRejectedValue(
      new Error('LESSON_HAS_DEPLOYMENTS: cannot delete deployed lesson')
    )

    const res = await PUT(makeReq({ lessons: [{ id: 'l1' }] }), session, {
      params: Promise.resolve({ id: 'course-1' }),
    } as any)

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('cannot delete deployed lesson')
  })
})
