import { describe, it, expect, afterEach } from 'vitest'
import { shouldBlockUnverifiedLogin } from './email-verification'

// Default cutoff is 2026-07-29T00:00:00Z (see ENFORCED_AFTER).
const PRE_CUTOFF = new Date('2026-01-01T00:00:00Z') // existing/grandfathered account
const POST_CUTOFF = new Date('2026-08-01T00:00:00Z') // new account

describe('shouldBlockUnverifiedLogin — no-lockout guarantees', () => {
  afterEach(() => {
    delete process.env.REQUIRE_EMAIL_VERIFICATION
  })

  it('never blocks when enforcement is off (default)', () => {
    delete process.env.REQUIRE_EMAIL_VERIFICATION
    expect(shouldBlockUnverifiedLogin({ emailVerified: null, createdAt: POST_CUTOFF })).toBe(false)
  })

  it('never blocks a verified account', () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true'
    expect(shouldBlockUnverifiedLogin({ emailVerified: new Date(), createdAt: POST_CUTOFF })).toBe(
      false
    )
  })

  it('never blocks a pre-cutoff (existing) account, even unverified', () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true'
    expect(shouldBlockUnverifiedLogin({ emailVerified: null, createdAt: PRE_CUTOFF })).toBe(false)
  })

  it('never blocks when createdAt is missing', () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true'
    expect(shouldBlockUnverifiedLogin({ emailVerified: null, createdAt: null })).toBe(false)
  })

  it('blocks only a new, unverified account when enforcement is on', () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true'
    expect(shouldBlockUnverifiedLogin({ emailVerified: null, createdAt: POST_CUTOFF })).toBe(true)
  })
})
