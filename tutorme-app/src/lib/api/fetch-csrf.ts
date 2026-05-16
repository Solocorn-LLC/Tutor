/**
 * Fetch wrapper that automatically obtains and attaches a CSRF token.
 * Only attaches for mutating methods (POST, PUT, PATCH, DELETE).
 */
export async function fetchWithCsrf(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()
  const needsCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

  if (!needsCsrf) {
    return fetch(input, init)
  }

  const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
  const csrfData = await csrfRes.json().catch(() => ({}))
  const csrfToken = csrfData?.token ?? null

  const headers = new Headers(init.headers)
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken)
  }

  return fetch(input, { ...init, headers })
}
