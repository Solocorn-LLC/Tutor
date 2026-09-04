/**
 * fetch wrapper with an AbortController timeout.
 *
 * Prevents UI spinners from hanging forever when a request stalls server-side
 * (DB pool exhaustion, cold start, proxy hang) — the promise rejects with an
 * AbortError after `timeoutMs` so callers' catch/finally blocks always run.
 */

export async function fetchWithTimeout(
  url: string,
  options: (RequestInit & { timeoutMs?: number }) | undefined = {}
): Promise<Response> {
  const { timeoutMs = 15000, ...init } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
