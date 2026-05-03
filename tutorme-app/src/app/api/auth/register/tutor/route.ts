import { NextRequest, NextResponse } from 'next/server'
import { ValidationError, handleApiError } from '@/lib/api/middleware'
import { performRegistration } from '@/lib/registration/register-user'
import type { RegisterUserInput } from '@/lib/validation/schemas'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const payloadRaw = formData.get('payload')

    if (typeof payloadRaw !== 'string') {
      return NextResponse.json({ error: 'Invalid registration payload' }, { status: 400 })
    }

    let payload: RegisterUserInput
    try {
      payload = JSON.parse(payloadRaw) as RegisterUserInput
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in payload' }, { status: 400 })
    }

    if (payload?.role !== 'TUTOR') {
      return NextResponse.json({ error: 'Tutor role required' }, { status: 400 })
    }

    const avatar = formData.get('avatar')
    const avatarFile = avatar instanceof File ? avatar : null

    const result = await performRegistration(request, payload, { avatarFile })
    return NextResponse.json(result.body, { status: result.status, headers: result.headers })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const pgError =
      error && typeof error === 'object' && 'cause' in error
        ? (error as { cause?: { message?: string; code?: string; detail?: string } }).cause
        : null
    console.error('Tutor registration error:', err.message, err.stack)
    if (pgError) {
      console.error(
        'PostgreSQL error:',
        pgError.message,
        'code:',
        pgError.code,
        'detail:',
        pgError.detail
      )
    }
    if (error && typeof error === 'object' && 'issues' in error) {
      const zodError = error as { issues: Array<{ message: string }> }
      return NextResponse.json(
        { error: zodError.issues.map(i => i.message).join(', ') },
        { status: 400 }
      )
    }
    if (error instanceof ValidationError || (error as Error)?.name === 'ValidationError') {
      return NextResponse.json(
        { error: (error as Error).message || 'Validation error' },
        { status: 400 }
      )
    }
    const errorCode =
      (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code) ||
      pgError?.code
    if (errorCode === '23505') {
      const detail = pgError?.detail || ''
      if (detail.includes('username')) {
        return NextResponse.json({ error: 'Username already taken' }, { status: 400 })
      }
      if (detail.includes('userId')) {
        return NextResponse.json({ error: 'User already has a tutor application' }, { status: 400 })
      }
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
    }
    const message =
      process.env.NODE_ENV === 'development'
        ? pgError?.message || err.message || 'Internal server error. Please try again.'
        : 'Internal server error. Please try again.'
    return handleApiError(error, message, 'api/auth/register/tutor/route.ts')
  }
}
