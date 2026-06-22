import { describe, it, expect } from 'vitest'

// scripts/migrate.js is plain CJS; require avoids a declaration-file lookup.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isTransient } = require('../../scripts/migrate.js')

describe('migrate retry classifier (isTransient)', () => {
  it('treats Neon connection-termination as transient (the deploy flake)', () => {
    expect(isTransient(new Error('terminating connection due to administrator command'))).toBe(true)
    expect(isTransient({ code: '57P01', message: 'admin shutdown' })).toBe(true)
  })

  it('treats network/connection errors as transient', () => {
    for (const msg of [
      'Connection terminated unexpectedly',
      'ECONNRESET',
      'timeout exceeded when trying to connect',
      'Client has encountered a connection error',
    ]) {
      expect(isTransient(new Error(msg)), msg).toBe(true)
    }
    expect(isTransient({ code: '08006', message: 'connection failure' })).toBe(true)
  })

  it('inspects error.cause as well (drizzle wraps the driver error)', () => {
    const wrapped = new Error('Failed query: select ... from __drizzle_migrations')
    ;(wrapped as unknown as { cause: unknown }).cause = new Error(
      'terminating connection due to administrator command'
    )
    expect(isTransient(wrapped)).toBe(true)
  })

  it('does NOT retry deterministic SQL errors', () => {
    expect(isTransient(new Error('relation "Foo" does not exist'))).toBe(false)
    expect(isTransient(new Error('column "bar" already exists'))).toBe(false)
    expect(isTransient(new Error('syntax error at or near "SELCT"'))).toBe(false)
    expect(isTransient({ code: '42P01', message: 'undefined_table' })).toBe(false)
    expect(isTransient(null)).toBe(false)
    expect(isTransient(undefined)).toBe(false)
  })
})
