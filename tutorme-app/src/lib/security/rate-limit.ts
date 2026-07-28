/**
 * Rate limiting for API routes.
 * Uses Redis when REDIS_URL is set (shared across instances); otherwise in-memory store.
 */
const DEFAULT_WINDOW_MS = 60 * 1000 // 1 minute
const DEFAULT_MAX = 100 // requests per window per key
const REDIS_PREFIX = 'ratelimit:'

interface Entry {
  count: number
  resetAt: number
}

interface RateLimitOptions {
  max: number
  windowMs?: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

const memoryStore = new Map<string, Entry>()

let isPruning = false
function prune(): void {
  if (isPruning) return
  isPruning = true
  setTimeout(() => {
    const now = Date.now()
    for (const [key, entry] of memoryStore.entries()) {
      if (entry.resetAt < now) memoryStore.delete(key)
    }
    isPruning = false
  }, 0)
}

function checkRateLimitMemory(key: string, options: RateLimitOptions): RateLimitResult {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS
  const { max } = options
  const now = Date.now()
  if (memoryStore.size > 10000) prune()
  let entry = memoryStore.get(key)
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs }
    memoryStore.set(key, entry)
  }
  entry.count += 1
  const allowed = entry.count <= max
  const remaining = Math.max(0, max - entry.count)
  return { allowed, remaining, resetAt: entry.resetAt }
}

let redisClient: import('ioredis').Redis | null = null
let redisInitPromise: Promise<import('ioredis').Redis | null> | null = null

async function getRedisClient(): Promise<import('ioredis').Redis | null> {
  if (redisClient) return redisClient
  if (typeof window !== 'undefined') return null // browser
  // Next.js Middleware runs on the Edge Runtime, which cannot use Node Redis clients.
  const isEdgeRuntime =
    typeof (globalThis as any).EdgeRuntime !== 'undefined' ||
    (typeof process !== 'undefined' && process.env.NEXT_RUNTIME === 'edge')
  if (isEdgeRuntime) return null
  const url = process.env.REDIS_URL
  if (!url) return null
  if (!redisInitPromise) {
    redisInitPromise = (async () => {
      try {
        const { Redis } = await import('ioredis')
        const client = new Redis(url, {
          retryStrategy: times => Math.min(times * 50, 2000),
          maxRetriesPerRequest: 3,
        })
        client.on('error', () => {})
        redisClient = client
        return client
      } catch {
        return null
      }
    })()
  }
  return redisInitPromise
}

async function checkRateLimitRedis(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const redis = await getRedisClient()
  if (!redis) return checkRateLimitMemory(key, options)

  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS
  const { max } = options
  const now = Date.now()
  const fullKey = REDIS_PREFIX + key
  const ttlSeconds = Math.ceil(windowMs / 1000)

  try {
    // Atomic Lua: INCR + EXPIRE (when count=1) in single round-trip - no race conditions
    const result = (await redis.eval(
      `local c=redis.call('INCR',KEYS[1]) if c==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end return {c,redis.call('PTTL',KEYS[1])}`,
      1,
      fullKey,
      ttlSeconds
    )) as [number, number]
    const [newCount, pttl] = result
    const resetAt = pttl > 0 ? now + pttl : now + windowMs

    const allowed = newCount <= max
    const remaining = Math.max(0, max - newCount)
    return { allowed, remaining, resetAt }
  } catch {
    return checkRateLimitMemory(key, options)
  }
}

/**
 * Check rate limit. Returns { allowed, remaining, resetAt }.
 * Uses Redis when REDIS_URL is set; otherwise in-memory (per instance).
 * key: typically prefix + IP (e.g. "login:" + getClientIdentifier(req))
 */
export async function checkRateLimit(
  key: string,
  maxOrOptions: number | RateLimitOptions = DEFAULT_MAX
): Promise<RateLimitResult> {
  const options: RateLimitOptions =
    typeof maxOrOptions === 'number'
      ? { max: maxOrOptions, windowMs: DEFAULT_WINDOW_MS }
      : { windowMs: DEFAULT_WINDOW_MS, ...maxOrOptions }

  if (process.env.REDIS_URL) {
    return checkRateLimitRedis(key, options)
  }
  return checkRateLimitMemory(key, options)
}

/** Presets for sensitive routes (stricter limits) */
export const RATE_LIMIT_PRESETS = {
  /** Login: 10 attempts per 15 minutes per IP */
  login: { max: 10, windowMs: 15 * 60 * 1000 },
  /** Signup/register: allow multi-step retries and multi-role onboarding in the same browser */
  register: { max: 12, windowMs: 15 * 60 * 1000 },
  /** Payment create: 20 per minute per IP */
  paymentCreate: { max: 20, windowMs: 60 * 1000 },
  /** Enroll (subject or course): 30 per minute per IP */
  enroll: { max: 30, windowMs: 60 * 1000 },
  /** Class booking: 20 per minute per IP */
  booking: { max: 20, windowMs: 60 * 1000 },
  /** AI generation/chat: 30 per minute per client identifier (per-user when authenticated) */
  aiGenerate: { max: 30, windowMs: 60 * 1000 },
  /** Public contact/lead form: 5 submissions per 10 minutes per IP (anti-spam) */
  contact: { max: 5, windowMs: 10 * 60 * 1000 },
} as const

/**
 * Check rate limit using a named preset. Key will be prefixed with the preset name.
 *
 * When `identifier` is supplied (e.g. a user id), the bucket is keyed by it
 * instead of the client IP — so co-located users behind one NAT/proxy don't
 * share a single quota. Falls back to the IP otherwise.
 */
export async function checkRateLimitPreset(
  req: Request,
  preset: keyof typeof RATE_LIMIT_PRESETS,
  identifier?: string
): Promise<RateLimitResult> {
  const key = `${preset}:${identifier ?? getClientIdentifier(req)}`
  const options = RATE_LIMIT_PRESETS[preset]
  return checkRateLimit(key, options)
}

/**
 * Get client identifier for rate limiting (IP or x-forwarded-for).
 */
export function getClientIdentifier(req: Request | any): string {
  const trustProxy = process.env.TRUST_PROXY === 'true'
  const platformIp = req.ip || (req.socket && req.socket.remoteAddress)

  const forwarded =
    typeof req.headers.get === 'function'
      ? req.headers.get('x-forwarded-for')
      : req.headers['x-forwarded-for']
  const realIp =
    typeof req.headers.get === 'function' ? req.headers.get('x-real-ip') : req.headers['x-real-ip']
  const cfIp =
    typeof req.headers.get === 'function'
      ? req.headers.get('cf-connecting-ip')
      : req.headers['cf-connecting-ip']

  const firstForwarded = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined
  const candidate = trustProxy
    ? firstForwarded || realIp || cfIp || platformIp
    : platformIp || realIp || cfIp
  const ip = normalizeIp(candidate)
  if (ip !== 'unknown') return ip

  // Fallback identifier when no reliable IP is available (prevents all unknown clients sharing one bucket).
  const ua = req.headers.get('user-agent') || 'unknown'
  const lang = req.headers.get('accept-language') || 'unknown'
  const fingerprint = simpleHash(`${ua}|${lang}`)
  return `unknown:${fingerprint}`
}

function normalizeIp(ip: string | null | undefined): string {
  if (!ip) return 'unknown'
  const trimmed = ip.trim()
  if (!trimmed) return 'unknown'
  if (trimmed === '::1') return '127.0.0.1'
  return trimmed
}

function simpleHash(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
