import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  createAdminSession: vi.fn(),
  isIpWhitelisted: vi.fn(),
  getClientIp: vi.fn(),
  logAdminAction: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
  withRateLimitPreset: vi.fn(),
  isSuspiciousIp: vi.fn(),
  logFailedLogin: vi.fn(),
  // Drizzle state per test
  whitelistCount: 0,
  userByEmail: null as { userId: string; email: string; password: string; role: string } | null,
  profileByUserId: null as { name: string } | null,
  assignmentRoles: [] as Array<{ roleName: string }>,
  drizzleSelectIndex: 0,
}))

vi.mock('@/lib/db/drizzle', () => {
  const selectImpl = (columns: unknown) => {
    if (columns && typeof columns === 'object' && columns !== null && 'count' in columns) {
      return { from: () => ({ where: () => Promise.resolve([{ count: mocks.whitelistCount }]) }) }
    }
    mocks.drizzleSelectIndex += 1
    if (mocks.drizzleSelectIndex === 1) {
      const u = mocks.userByEmail
      return { from: () => ({ where: () => ({ limit: () => Promise.resolve(u ? [u] : []) }) }) }
    }
    if (mocks.drizzleSelectIndex === 2) {
      return {
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(mocks.profileByUserId ? [mocks.profileByUserId] : []),
          }),
        }),
      }
    }
    return {
      from: () => ({
        innerJoin: () => ({ where: () => Promise.resolve(mocks.assignmentRoles) }),
      }),
    }
  }
  return {
    drizzleDb: {
      select: vi.fn().mockImplementation(selectImpl),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    },
  }
})

vi.mock('@/lib/admin/auth', () => ({
  createAdminSession: mocks.createAdminSession,
  isIpWhitelisted: mocks.isIpWhitelisted,
  getClientIp: mocks.getClientIp,
  logAdminAction: mocks.logAdminAction,
  verifyPassword: mocks.verifyPassword,
  hashPassword: mocks.hashPassword,
  ADMIN_TOKEN_NAME: 'admin_session',
  ADMIN_TOKEN_EXPIRY: 60 * 60 * 8,
}))

vi.mock('@/lib/api/middleware', () => ({
  withRateLimitPreset: mocks.withRateLimitPreset,
}))

vi.mock('@/lib/security/suspicious-activity', () => ({
  isSuspiciousIp: mocks.isSuspiciousIp,
  logFailedLogin: mocks.logFailedLogin,
}))

import { POST } from './route'

describe('POST /api/admin/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.drizzleSelectIndex = 0
    mocks.withRateLimitPreset.mockResolvedValue({ response: null, remaining: 10 })
    mocks.getClientIp.mockReturnValue('127.0.0.1')
    mocks.isSuspiciousIp.mockResolvedValue(false)
    mocks.whitelistCount = 0
    mocks.userByEmail = null
    mocks.profileByUserId = null
    mocks.assignmentRoles = []
    mocks.createAdminSession.mockResolvedValue('jwt-token')
    mocks.verifyPassword.mockResolvedValue(true)
    mocks.hashPassword.mockResolvedValue('migrated-hash')
  })

  it('returns 400 when password is missing', async () => {
    const req = new Request('http://localhost/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com' }),
    })

    const res = await POST(req as unknown as NextRequest)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Email and password are required' })
  })

  it('returns 401 and logs failed attempt for invalid credentials', async () => {
    mocks.userByEmail = {
      userId: 'admin-1',
      email: 'admin@example.com',
      password: 'hashed-password',
      role: 'ADMIN',
    }
    mocks.verifyPassword.mockResolvedValue(false)

    const req = new Request('http://localhost/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'wrong' }),
    })

    const res = await POST(req as unknown as NextRequest)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Invalid credentials' })
    expect(mocks.logFailedLogin).toHaveBeenCalledWith('127.0.0.1', 'admin@example.com')
  })

  it('returns 429 when rate-limited', async () => {
    mocks.withRateLimitPreset.mockResolvedValue({
      response: new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
      remaining: 0,
    })

    const req = new Request('http://localhost/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'Password1' }),
    })

    const res = await POST(req as unknown as NextRequest)
    expect(res.status).toBe(429)
  })

  it('returns 429 for suspicious IP before auth lookup', async () => {
    mocks.isSuspiciousIp.mockResolvedValue(true)

    const req = new Request('http://localhost/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'Password1' }),
    })

    const res = await POST(req as unknown as NextRequest)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({
      error: 'Too many failed login attempts. Please try again later.',
    })
  })

  it('returns 403 when IP is not whitelisted', async () => {
    mocks.whitelistCount = 1
    mocks.isIpWhitelisted.mockResolvedValue(false)

    const req = new Request('http://localhost/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'Password1' }),
    })

    const res = await POST(req as unknown as NextRequest)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Access denied from this IP address' })
  })

  it('returns 200 and sets cookie when credentials are valid', async () => {
    mocks.userByEmail = {
      userId: 'admin-1',
      email: 'admin@example.com',
      password: 'hashed-password',
      role: 'ADMIN',
    }
    mocks.profileByUserId = { name: 'Admin' }
    mocks.assignmentRoles = [{ roleName: 'ADMIN' }]

    const req = new Request('http://localhost/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'Password1' }),
    })

    const res = await POST(req as unknown as NextRequest)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(mocks.createAdminSession).toHaveBeenCalledWith('admin-1', '127.0.0.1', undefined)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('admin_session=')
  })

  it('returns 403 when user has no admin role or assignment', async () => {
    mocks.userByEmail = {
      userId: 'student-1',
      email: 'student@example.com',
      password: 'hashed-password',
      role: 'STUDENT',
    }
    mocks.assignmentRoles = []
    mocks.verifyPassword.mockResolvedValue(true)

    const req = new Request('http://localhost/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@example.com', password: 'Password1' }),
    })

    const res = await POST(req as unknown as NextRequest)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Admin access required' })
    expect(mocks.createAdminSession).not.toHaveBeenCalled()
  })

  it('rejects a plaintext-stored password by default (legacy migration path off)', async () => {
    delete process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN
    mocks.userByEmail = {
      id: 'admin-legacy',
      email: 'legacy@example.com',
      password: 'LegacyPass123',
      role: 'ADMIN',
    }
    mocks.profileByUserId = { name: 'Legacy Admin' }
    mocks.assignmentRoles = [{ roleName: 'ADMIN' }]
    mocks.verifyPassword.mockResolvedValue(false)

    const req = new Request('http://localhost/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'legacy@example.com', password: 'LegacyPass123' }),
    })

    const res = await POST(req as unknown as NextRequest)
    expect(res.status).toBe(401)
    expect(mocks.hashPassword).not.toHaveBeenCalled()
    expect(mocks.createAdminSession).not.toHaveBeenCalled()
  })

  it('migrates a legacy plaintext admin password only when ALLOW_LEGACY_PLAINTEXT_LOGIN=true', async () => {
    process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN = 'true'
    try {
      mocks.userByEmail = {
        id: 'admin-legacy',
        email: 'legacy@example.com',
        password: 'LegacyPass123',
        role: 'ADMIN',
      }
      mocks.profileByUserId = { name: 'Legacy Admin' }
      mocks.assignmentRoles = [{ roleName: 'ADMIN' }]
      mocks.verifyPassword.mockResolvedValue(false)

      const req = new Request('http://localhost/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'legacy@example.com', password: 'LegacyPass123' }),
      })

      const res = await POST(req as unknown as NextRequest)
      expect(res.status).toBe(200)
      expect(mocks.hashPassword).toHaveBeenCalledWith('LegacyPass123')
      const { drizzleDb } = await import('@/lib/db/drizzle')
      expect(drizzleDb.update).toHaveBeenCalled()
    } finally {
      delete process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN
    }
  })
})
