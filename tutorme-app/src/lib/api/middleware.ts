/**
 * API Route Middleware Utilities
 * Provides authentication, authorization, CSRF, rate limiting, and error handling for API routes
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import type { Session } from 'next-auth'
import { eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { user as userTable, type Role } from '@/lib/db/schema'
import { verifyCsrfToken } from '@/lib/security/csrf'
import {
  checkRateLimit,
  checkRateLimitPreset,
  getClientIdentifier,
} from '@/lib/security/rate-limit'
import { hasPermission, type Permission } from '@/lib/security/rbac'
import { isAdminIpAllowed, getClientIp } from '@/lib/security/admin-ip'
import { nanoid } from 'nanoid'

// Custom error classes
export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized - Please log in') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden - Insufficient permissions') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

function createErrorId(): string {
  return nanoid(12)
}

/**
 * Pull the underlying cause out of an error for logging. Many libraries (e.g.
 * Drizzle) set their own generic `.message` ("Failed query: ...") and stash the
 * real driver error — Postgres code/detail/constraint — on `.cause`. Without
 * this the actual failure reason never reaches the logs.
 */
function extractErrorDetails(error: unknown): Record<string, unknown> {
  const details: Record<string, unknown> = {}
  if (!(error instanceof Error)) return details

  // Postgres driver errors expose these fields directly on the error object.
  const e = error as Error & {
    code?: unknown
    detail?: unknown
    constraint?: unknown
    column?: unknown
    table?: unknown
  }
  if (e.code != null) details.code = e.code
  if (e.detail != null) details.detail = e.detail
  if (e.constraint != null) details.constraint = e.constraint
  if (e.column != null) details.column = e.column
  if (e.table != null) details.table = e.table

  const cause = (error as { cause?: unknown }).cause
  if (cause instanceof Error) {
    const c = cause as Error & {
      code?: unknown
      detail?: unknown
      constraint?: unknown
      column?: unknown
      table?: unknown
    }
    details.cause = {
      message: c.message,
      code: c.code,
      detail: c.detail,
      constraint: c.constraint,
      column: c.column,
      table: c.table,
    }
  } else if (cause != null) {
    details.cause = typeof cause === 'string' ? cause : String(cause)
  }

  return details
}

function logApiError(
  errorId: string,
  logLabel: string,
  error: unknown,
  meta?: Record<string, unknown>
) {
  const err = error instanceof Error ? error : undefined
  console.error(
    JSON.stringify({
      level: 'error',
      errorId,
      label: logLabel,
      message: err?.message ?? 'Unknown error',
      stack: err?.stack,
      ...extractErrorDetails(error),
      ...meta,
    })
  )
}

/**
 * Centralised API error logging and 500 response.
 * Use in route catch blocks for consistent logging and response shape.
 */
export function handleApiError(
  error: unknown,
  defaultMessage: string = 'Internal server error',
  logLabel: string = 'API Error'
): NextResponse {
  const errorId = createErrorId()
  logApiError(errorId, logLabel, error)
  const isValidation = error instanceof ValidationError
  const status = isValidation ? 400 : 500
  const message = error instanceof Error ? error.message : defaultMessage
  const isDev = process.env.NODE_ENV !== 'production'
  return NextResponse.json(
    { error: isDev || isValidation ? message : defaultMessage, errorId },
    { status }
  )
}

type RouteContext = {
  params: Promise<Record<string, string | string[]>>
}

// Handler type (context is route params, e.g. { params: { id: string } })
type Handler = (
  req: NextRequest,
  session: Session,
  context: RouteContext
) => Promise<Response> | Response

// Middleware options
interface WithAuthOptions {
  role?: Role | Role[]
  optional?: boolean
}

function normalizeRole(role: unknown): string {
  if (typeof role !== 'string') return ''
  return role.trim().toUpperCase()
}

/**
 * Authentication middleware wrapper
 * Automatically handles session validation, role checking, and error responses
 *
 * @example
 * export const GET = withAuth(async (req, session) => {
 *   // session is guaranteed to exist
 *   return NextResponse.json({ userId: session.user.id })
 * })
 *
 * @example with role requirement
 * export const POST = withAuth(async (req, session) => {
 *   // session.user.role === 'TUTOR' is guaranteed
 *   return NextResponse.json({})
 * }, { role: 'TUTOR' })
 */
export function withAuth(handler: Handler, options?: WithAuthOptions) {
  return async (req: NextRequest, context: RouteContext) => {
    let activeSession: Session | null = null
    try {
      const session = await getServerSession(authOptions, req)
      activeSession = session

      // Check if user is authenticated (session and session.user must exist to avoid "reading 'user'" in handlers)
      if (!session || !session.user || !session.user.id) {
        if (options?.optional) {
          // Allow unauthenticated access
          return handler(req, session as Session, context)
        }
        throw new UnauthorizedError()
      }

      // Check role requirements
      if (options?.role) {
        const allowedRoles = Array.isArray(options.role) ? options.role : [options.role]
        const normalizedSessionRole = normalizeRole(session.user.role)
        const roleAllowed = allowedRoles.some(r => normalizeRole(r) === normalizedSessionRole)

        if (!roleAllowed) {
          // Fallback: session role can be stale after account updates or seed resets.
          const [freshUser] = await drizzleDb
            .select({ role: userTable.role })
            .from(userTable)
            .where(eq(userTable.userId, session.user.id))
            .limit(1)
          const normalizedFreshRole = normalizeRole(freshUser?.role)
          const freshRoleAllowed = allowedRoles.some(r => normalizeRole(r) === normalizedFreshRole)
          if (!freshRoleAllowed) {
            const roleLabel = allowedRoles.length === 1 ? options.role : allowedRoles.join(' or ')
            throw new ForbiddenError(`This endpoint requires ${roleLabel} role`)
          }
        }
      }

      // Call the actual handler
      return await handler(req, session, context)
    } catch (error) {
      // Handle known error types
      if (error instanceof UnauthorizedError) {
        return NextResponse.json({ error: error.message }, { status: 401 })
      }

      if (error instanceof ForbiddenError) {
        return NextResponse.json({ error: error.message }, { status: 403 })
      }

      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      if (error instanceof NotFoundError) {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }

      // Handle unknown errors
      const errorId = createErrorId()
      logApiError(errorId, 'API Error', error, {
        path: req.nextUrl?.pathname,
        method: req.method,
        userId: activeSession?.user?.id ?? null,
      })

      // Don't expose internal errors in production
      const isDev = process.env.NODE_ENV !== 'production'
      return NextResponse.json(
        {
          error: isDev
            ? error instanceof Error
              ? error.message
              : 'Unknown error'
            : 'Internal server error',
          errorId,
        },
        { status: 500 }
      )
    }
  }
}

/**
 * Get the current user session without throwing errors
 * Useful for optional authentication scenarios.
 * Pass the request when in a route handler so realm (tutor/student) is respected.
 */
export async function getCurrentSession(req?: NextRequest): Promise<Session | null> {
  try {
    return await getServerSession(authOptions, req ?? undefined)
  } catch (error) {
    console.error('Error getting session:', error)
    return null
  }
}

/**
 * Require authentication - throws if not authenticated
 * Useful when you need the session inside a try/catch block.
 * Pass the request when in a route handler so realm (tutor/student) is respected.
 */
export async function requireAuth(req?: NextRequest): Promise<Session> {
  const session = await getServerSession(authOptions, req ?? undefined)
  if (!session?.user?.id) {
    throw new UnauthorizedError()
  }
  return session
}

/**
 * Require specific role - throws if wrong role
 */
export async function requireRole(
  role: 'TUTOR' | 'STUDENT' | 'ADMIN' | 'PARENT',
  req?: NextRequest
): Promise<Session> {
  const session = await requireAuth(req)
  if (normalizeRole(session.user.role) !== normalizeRole(role)) {
    throw new ForbiddenError(`This action requires ${role} role`)
  }
  return session
}

/** State-changing methods that require CSRF */
const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** API path prefixes that skip CSRF (webhooks, auth, public) */
const CSRF_SKIP_PATHS = [
  '/api/auth/signin',
  '/api/auth/signout',
  '/api/auth/session',
  '/api/auth/csrf',
  '/api/auth/callback',
  '/api/auth/session-realm',
  '/api/payments/webhooks',
  '/api/health',
]

/**
 * Verify CSRF for state-changing requests. Call at the start of POST/PUT/PATCH/DELETE handlers
 * that are not webhooks or auth. Returns 403 response if invalid; otherwise returns null.
 */
export async function requireCsrf(req: NextRequest): Promise<NextResponse | null> {
  if (!CSRF_METHODS.has(req.method)) return null
  const path = req.nextUrl?.pathname ?? ''
  if (CSRF_SKIP_PATHS.some(p => path.startsWith(p))) return null
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) return null
  const valid = await verifyCsrfToken(req)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 })
  }
  return null
}

type AnyHandler = (req: NextRequest, ...args: any[]) => Promise<Response> | Response

/**
 * Wraps a state-changing handler to require a valid CSRF token (POST/PUT/PATCH/DELETE).
 * Use with withAuth: export const POST = withCsrf(withAuth(async (req, session) => ...))
 */
export function withCsrf(handler: AnyHandler): AnyHandler {
  return async (req: NextRequest, ...args: any[]) => {
    const csrfError = await requireCsrf(req)
    if (csrfError) return csrfError
    return handler(req, ...args)
  }
}

/**
 * Apply rate limit by client IP (and optionally by userId when session exists).
 * Returns 429 response if over limit; otherwise returns null.
 */
export async function withRateLimit(
  req: NextRequest,
  max: number = 100
): Promise<{ response: NextResponse | null; remaining: number }> {
  const key = getClientIdentifier(req)
  const { allowed, remaining } = await checkRateLimit(key, max)
  if (!allowed) {
    const res = NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
    return { response: res, remaining: 0 }
  }
  return { response: null, remaining }
}

type RateLimitPreset =
  | 'login'
  | 'register'
  | 'paymentCreate'
  | 'enroll'
  | 'booking'
  | 'aiGenerate'
  | 'contact'

/**
 * Apply rate limit using a named preset (stricter limits for sensitive routes).
 * Returns 429 response if over limit; otherwise returns null.
 */
export async function withRateLimitPreset(
  req: NextRequest,
  preset: RateLimitPreset,
  identifier?: string
): Promise<{ response: NextResponse | null; remaining: number }> {
  const { allowed, remaining, resetAt } = await checkRateLimitPreset(
    req as unknown as Request,
    preset,
    identifier
  )
  if (!allowed) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000)
    const res = NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfter)) } }
    )
    return { response: res, remaining: 0 }
  }
  return { response: null, remaining }
}

/**
 * Require a specific permission (RBAC). Call after withAuth.
 * Returns 403 if user's role does not have the permission.
 */
export function requirePermission(session: Session, permission: Permission): NextResponse | null {
  const role = session?.user?.role as 'ADMIN' | 'TUTOR' | 'STUDENT' | undefined
  if (!role || !hasPermission(role, permission)) {
    return NextResponse.json({ error: 'Forbidden - Insufficient permissions' }, { status: 403 })
  }
  return null
}

/**
 * Require admin IP whitelist. When ADMIN_IP_WHITELIST is set, only listed IPs can access.
 * Returns 403 if client IP is not allowed.
 */
export function requireAdminIp(req: NextRequest): NextResponse | null {
  const ip = getClientIp(req as unknown as Request)
  if (!isAdminIpAllowed(ip)) {
    return NextResponse.json(
      { error: 'Forbidden - Admin access not allowed from this IP' },
      { status: 403 }
    )
  }
  return null
}

/**
 * Get auth from session or API key (Bearer). Use for admin routes that support both browser and server-to-server.
 * Returns session if logged in, or { apiKey: keyId } if valid Bearer key, else null.
 */
export async function getSessionOrApiKey(
  req: NextRequest
): Promise<{ type: 'session'; session: Session } | { type: 'apiKey'; keyId: string } | null> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    if (token.startsWith('tm_')) {
      const { verifyApiKey } = await import('@/lib/security/api-key')
      const key = await verifyApiKey(token)
      if (key) return { type: 'apiKey', keyId: key.id }
    }
  }
  const session = await getServerSession(authOptions, req)
  if (session?.user?.id) return { type: 'session', session }
  return null
}

/**
 * Parse and clamp numeric query/body values to safe bounds.
 */
export function parseBoundedInt(
  raw: string | null | undefined,
  defaultValue: number,
  options: { min?: number; max: number }
): number {
  const min = options.min ?? 0
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed)) return defaultValue
  if (parsed < min) return min
  if (parsed > options.max) return options.max
  return parsed
}

/** Maximum allowed length for text inputs (100KB) */
export const MAX_TEXT_LENGTH = 100_000

/** Maximum allowed length for description fields (500KB) */
export const MAX_DESCRIPTION_LENGTH = 500_000

/**
 * Validate and truncate text input to safe length.
 * Returns { valid: false, error: string } if input is too long or contains invalid content.
 */
export function validateTextInput(
  input: string | null | undefined,
  options: {
    maxLength?: number
    fieldName?: string
    allowEmpty?: boolean
  } = {}
): { valid: true; value: string } | { valid: false; error: string } {
  const { maxLength = MAX_TEXT_LENGTH, fieldName = 'Input', allowEmpty = false } = options

  if (input === null || input === undefined) {
    return allowEmpty
      ? { valid: true, value: '' }
      : { valid: false, error: `${fieldName} is required` }
  }

  if (typeof input !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` }
  }

  // Check for extremely long inputs (potential DoS)
  if (input.length > maxLength) {
    return {
      valid: false,
      error: `${fieldName} exceeds maximum length of ${maxLength} characters`,
    }
  }

  // Check for null bytes (potential injection)
  if (input.includes('\x00')) {
    return { valid: false, error: `${fieldName} contains invalid characters` }
  }

  return { valid: true, value: input }
}

/**
 * Middleware wrapper that validates text inputs in the request body.
 * Use for POST/PUT/PATCH endpoints that accept user-generated content.
 */
export function withInputValidation<T extends Record<string, unknown>>(
  schema: { [K in keyof T]: { maxLength?: number; required?: boolean } },
  handler: (
    req: NextRequest,
    validated: T,
    session: Session,
    context: RouteContext
  ) => Promise<Response>
): Handler {
  return async (req: NextRequest, session: Session, context: RouteContext) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 })
    }

    const validated: Record<string, unknown> = {}

    for (const [key, config] of Object.entries(schema)) {
      const value = (body as Record<string, unknown>)[key]

      if (config.required && (value === undefined || value === null)) {
        return NextResponse.json({ error: `${key} is required` }, { status: 400 })
      }

      if (value !== undefined && value !== null) {
        if (typeof value !== 'string') {
          return NextResponse.json({ error: `${key} must be a string` }, { status: 400 })
        }

        if (value.length > (config.maxLength ?? MAX_TEXT_LENGTH)) {
          return NextResponse.json(
            {
              error: `${key} exceeds maximum length of ${config.maxLength ?? MAX_TEXT_LENGTH} characters`,
            },
            { status: 400 }
          )
        }

        validated[key] = value
      }
    }

    return handler(req, validated as T, session, context)
  }
}
