/** Paths that do not require an authenticated session (normalized, no locale prefix). */
export const PUBLIC_EXACT_PATHS = ['/', '/register'] as const

export const PUBLIC_PREFIX_PATHS = [
  '/api/auth',
  '/api/health',
  '/api/csrf',
  '/api/public',
  '/api/landing',
  '/onboarding',
  '/u/',
  '/admin',
  // The admin API has its OWN auth (admin_session cookie + requireAdmin per
  // route), NOT NextAuth. Letting the NextAuth proxy guard it 307-redirects
  // every admin data request to /api/auth/signin (admins hold no NextAuth
  // token), which breaks the whole admin panel. Defer to each route's
  // requireAdmin instead. (Covers /api/admin/auth too.)
  '/api/admin',
  '/login',
  '/forgot-password',
  '/register/',
] as const

export function isPublicNormalizedPath(normalizedPath: string): boolean {
  if (PUBLIC_EXACT_PATHS.includes(normalizedPath as (typeof PUBLIC_EXACT_PATHS)[number])) {
    return true
  }
  return PUBLIC_PREFIX_PATHS.some(p => {
    if (normalizedPath === p) return true
    const prefix = p.endsWith('/') ? p : `${p}/`
    return normalizedPath.startsWith(prefix)
  })
}
