import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { AdminSession } from '@/lib/admin/auth'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/admin/auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/lib/db/drizzle', () => ({
  drizzleDb: {},
}))

import { GET } from './route'

describe('GET /api/admin/analytics/overview guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.requireAdmin.mockResolvedValue({
      session: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })
    const req = new Request('http://localhost/api/admin/analytics/overview')

    const res = await GET(req as NextRequest)

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 410 when authenticated (legacy feature removed)', async () => {
    mocks.requireAdmin.mockResolvedValue({ session: { adminId: 'admin-1' } as AdminSession })
    const req = new Request('http://localhost/api/admin/analytics/overview')

    const res = await GET(req as NextRequest)

    expect(res.status).toBe(410)
    const json = await res.json()
    expect(json.error).toBe('Legacy feature removed')
    expect(json.message).toContain('redesigned')
  })
})
