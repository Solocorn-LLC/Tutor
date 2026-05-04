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
  '/api/admin/auth',
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
