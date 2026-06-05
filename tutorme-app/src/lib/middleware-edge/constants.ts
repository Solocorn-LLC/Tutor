/** Per-minute cap for generic API traffic (per IP). */
export const API_RATE_LIMIT_MAX = 100

/** API paths that skip the global API rate limiter. */
export const RATE_LIMIT_SKIP = [
  '/api/auth',
  '/api/health',
  '/api/payments/webhooks',
  '/api/proxy-file', // Document proxy — fetches GCS files for PDF viewers; high volume, low risk
]

export const REALM_COOKIE_TUTOR = 'tutor_session'
export const REALM_COOKIE_STUDENT = 'student_session'
