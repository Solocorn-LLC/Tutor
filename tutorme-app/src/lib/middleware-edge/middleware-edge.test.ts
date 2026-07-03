import { describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['en', 'zh-CN'],
    defaultLocale: 'en',
  },
}))

import { getCspHeader } from './csp'
import { stripLocalePrefix } from './locale-path'
import { isPublicNormalizedPath } from './public-paths'

describe('middleware-edge helpers', () => {
  it('stripLocalePrefix removes locale segment', () => {
    expect(stripLocalePrefix('/en/student/dashboard')).toBe('/student/dashboard')
    expect(stripLocalePrefix('/zh-CN')).toBe('/')
    expect(stripLocalePrefix('/api/health')).toBe('/api/health')
  })

  it('isPublicNormalizedPath matches login and exact onboarding root', () => {
    expect(isPublicNormalizedPath('/login')).toBe(true)
    expect(isPublicNormalizedPath('/onboarding')).toBe(true)
    expect(isPublicNormalizedPath('/student/dashboard')).toBe(false)
  })

  it('isPublicNormalizedPath matches register paths including subpaths', () => {
    expect(isPublicNormalizedPath('/register')).toBe(true)
    expect(isPublicNormalizedPath('/register/')).toBe(true)
    expect(isPublicNormalizedPath('/register/tutor')).toBe(true)
    expect(isPublicNormalizedPath('/register/student')).toBe(true)
    expect(isPublicNormalizedPath('/register/parent')).toBe(true)
    expect(isPublicNormalizedPath('/register/admin')).toBe(true)
  })

  it('getCspHeader includes default-src and object-src none', () => {
    const csp = getCspHeader()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
  })

  it('getCspHeader keeps unsafe-eval in production (required by the Daily video SDK)', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const csp = getCspHeader()
    // Daily's call-machine bundle evaluates code; without unsafe-eval, live video
    // never joins. Previously stripped in prod, which broke video entirely.
    expect(csp).toContain("'unsafe-eval'")
    process.env.NODE_ENV = originalEnv
  })

  it('getCspHeader includes unsafe-eval in development', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const csp = getCspHeader()
    expect(csp).toContain("'unsafe-eval'")
    process.env.NODE_ENV = originalEnv
  })

  it('getCspHeader allows the Daily video SDK + Google Fonts', () => {
    const csp = getCspHeader()
    expect(csp).toContain('https://*.daily.co')
    expect(csp).toContain('media-src')
    expect(csp).toContain('worker-src')
    expect(csp).toContain('https://fonts.googleapis.com')
    expect(csp).toContain('https://fonts.gstatic.com')
  })

  it('getCspHeader includes report-uri', () => {
    const csp = getCspHeader()
    expect(csp).toContain('report-uri /api/csp-report')
  })
})
