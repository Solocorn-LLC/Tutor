/**
 * Integration tests: auth flow (register, login, protected route).
 * Requires DATABASE_URL and running DB. Use test DB in CI: e.g. tutorme_test.
 */

import { describe, it, expect, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { user as userTable, profile as profileTable } from '@/lib/db/schema'
import { POST as registerPost } from '@/app/api/auth/register/route'

const testEmail = `inttest-${Date.now()}@example.com`
const testPassword = 'Password1'
const testName = 'Integration Test User'
let createdUserId: string

describe('API Auth integration', () => {
  afterAll(async () => {
    if (createdUserId) {
      try {
        await drizzleDb.delete(profileTable).where(eq(profileTable.userId, createdUserId))
        await drizzleDb.delete(userTable).where(eq(userTable.userId, createdUserId))
      } catch (err) {
        console.warn('Cleanup failed:', err)
      }
    }
  })

  it('registers a new user and returns 201', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: testName,
        email: testEmail,
        password: testPassword,
        role: 'STUDENT',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await registerPost(req as any)
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.success).toBe(true)
    expect(data.user?.email).toBe(testEmail)
    expect(data.user?.role).toBe('STUDENT')
    createdUserId = data.user?.id
    expect(createdUserId).toBeDefined()
  })

  it('user and profile exist in database after register', async () => {
    expect(createdUserId).toBeDefined()

    const [user] = await drizzleDb
      .select()
      .from(userTable)
      .where(eq(userTable.userId, createdUserId))
      .limit(1)

    const [profile] = await drizzleDb
      .select()
      .from(profileTable)
      .where(eq(profileTable.userId, createdUserId))
      .limit(1)

    expect(user).toBeDefined()
    expect(user?.email).toBe(testEmail)
    expect(profile).toBeDefined()
    expect(profile?.name).toBe(testName)
  })

  it('returns 400 when registering same email again', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Other',
        email: testEmail,
        password: testPassword,
        role: 'STUDENT',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await registerPost(req as any)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeDefined()
  })
})
