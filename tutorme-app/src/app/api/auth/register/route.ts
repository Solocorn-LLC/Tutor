/**
 * POST /api/auth/register
 * Register a new user account (Drizzle ORM)
 */

import { NextRequest, NextResponse } from 'next/server'
import { ValidationError, handleApiError } from '@/lib/api/middleware'
import { performRegistration } from '@/lib/registration/register-user'
import { RegisterUserSchema } from '@/lib/validation/schemas'

export async function POST(request: NextRequest) {
  try {
    let bodyUnknown: unknown
    try {
      bodyUnknown = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }

    const parsed = RegisterUserSchema.safeParse(bodyUnknown)
    if (!parsed.success) {
      const messages = parsed.error.issues
        .map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join(', ')
      return NextResponse.json({ error: messages }, { status: 400 })
    }
    const body = parsed.data

    const result = await performRegistration(request, body)
    return NextResponse.json(result.body, { status: result.status, headers: result.headers })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const directCode =
      error && typeof error === 'object' && 'code' in error ? (error as { code: string }).code : null
    const causeCode =
      error && typeof error === 'object' && 'cause' in error
        ? ((error as { cause?: { code?: string } }).cause?.code ?? null)
        : null
    if (directCode === '23505' || causeCode === '23505') {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
    }
    return handleApiError(
      error,
      'Internal server error. Please try again.',
      'api/auth/register/route.ts'
    )
  }
}
