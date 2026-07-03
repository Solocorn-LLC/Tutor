import { test, expect } from '@playwright/test'

/**
 * Guards the Content-Security-Policy against the regression that broke live
 * video: production once stripped 'unsafe-eval' + the Daily hosts from
 * script-src, so the Daily SDK (which evals its call-machine bundle) was blocked
 * and no video call could join, and Google Fonts were blocked too. These
 * assertions fail loudly if the CSP ever tightens back in a way that breaks the
 * live-video stack or fonts.
 */
test.describe('Security headers — CSP allows the live-video stack', () => {
  test('served CSP permits the Daily SDK, media, workers and Google Fonts', async ({ request }) => {
    const res = await request.get('/login')
    // The page itself should load (any 2xx/3xx is fine — request follows redirects).
    expect(res.status()).toBeLessThan(400)

    const csp = res.headers()['content-security-policy']
    expect(csp, 'a Content-Security-Policy header must be present').toBeTruthy()

    // Daily's call machine needs eval + its bundle host.
    expect(csp).toContain("'unsafe-eval'")
    expect(csp).toContain('https://*.daily.co')
    // Camera/mic + Daily media tracks and its blob workers.
    expect(csp).toContain('media-src')
    expect(csp).toContain('worker-src')
    expect(csp).toContain('blob:')
    // Google Fonts stylesheet + font files.
    expect(csp).toContain('https://fonts.googleapis.com')
    expect(csp).toContain('https://fonts.gstatic.com')

    // Core hardening must remain intact.
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'self'")
  })
})
