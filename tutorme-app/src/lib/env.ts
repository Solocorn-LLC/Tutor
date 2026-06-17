/**
 * Startup environment validation.
 * Call validateEnv() at app startup to fail fast when required vars are missing.
 */

const REQUIRED = ['DATABASE_URL', 'NEXTAUTH_SECRET'] as const
const WARN_IF_MISSING_IN_PROD = [
  'REDIS_URL',
  // AI: either GEMINI_API_KEY or KIMI_API_KEY must be present (see lib/ai/provider.ts)
  'GEMINI_API_KEY',
  'KIMI_API_KEY',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
] as const

const REQUIRED_MESSAGES: Record<string, string> = {
  DATABASE_URL: 'DATABASE_URL is required for database connection',
  NEXTAUTH_SECRET: 'NEXTAUTH_SECRET is required for NextAuth (min 32 characters)',
}

/**
 * Validate required environment variables. Throws with a clear message if any are missing.
 * Call from server entry (e.g. server.ts) so the process exits before handling requests.
 */
export function validateEnv(): void {
  const missing: string[] = []
  for (const key of REQUIRED) {
    const value = process.env[key]
    if (value == null || String(value).trim() === '') {
      missing.push(key)
      continue
    }
    if (key === 'NEXTAUTH_SECRET' && value.length < 32) {
      missing.push(`${key} (must be at least 32 characters)`)
    }
  }
  if (missing.length > 0) {
    const messages = missing.map(k => REQUIRED_MESSAGES[k] ?? `Missing: ${k}`)
    throw new Error(`Environment validation failed:\n${messages.join('\n')}`)
  }

  if (process.env.NODE_ENV === 'production') {
    for (const key of WARN_IF_MISSING_IN_PROD) {
      const value = process.env[key]
      if (value == null || String(value).trim() === '') {
        console.warn(`[Env] Warning: ${key} is not set. This is recommended in production.`)
      }
    }
  }
}
