import { NextRequest, NextResponse } from 'next/server'
import { ValidationError, handleApiError } from '@/lib/api/middleware'
import { performRegistration } from '@/lib/registration/register-user'
import { RegisterUserSchema } from '@/lib/validation/schemas'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const payloadRaw = formData.get('payload')

    if (typeof payloadRaw !== 'string') {
      return NextResponse.json({ error: 'Invalid registration payload' }, { status: 400 })
    }

    let payloadUnknown: unknown
    try {
      payloadUnknown = JSON.parse(payloadRaw) as unknown
    } catch {
      throw new ValidationError('Invalid JSON in payload')
    }

    const payloadResult = RegisterUserSchema.safeParse(payloadUnknown)
    if (!payloadResult.success) {
      const messages = payloadResult.error.issues
        .map(issue => `${issue.path.join('.') || 'payload'}: ${issue.message}`)
        .join(', ')
      throw new ValidationError(messages)
    }
    const payload = payloadResult.data
    if (payload.role !== 'TUTOR') {
      throw new ValidationError('Tutor role required')
    }

    const avatar = formData.get('avatar')
    const avatarFile = avatar instanceof File ? avatar : null

    const result = await performRegistration(request, payload, { avatarFile })
    return NextResponse.json(result.body, { status: result.status, headers: result.headers })
  } catch (error) {
    const pgError =
      error && typeof error === 'object' && 'cause' in error
        ? (error as { cause?: { message?: string; code?: string; detail?: string } }).cause
        : null
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
        ? pgError?.message || 'Internal server error. Please try again.'
        : 'Internal server error. Please try again.'
    return handleApiError(error, message, 'api/auth/register/tutor/route.ts')
  }
}
