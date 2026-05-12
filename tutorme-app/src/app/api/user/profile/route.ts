/**
 * User Profile API
 * GET /api/user/profile — current user's profile (withAuth)
 * PUT /api/user/profile — update profile (withAuth + CSRF)
 */

import { NextRequest, NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { withAuth, requireCsrf, handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { profile } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { sanitizeHtml, sanitizeHtmlWithMax } from '@/lib/security/sanitize'
import { z } from 'zod'

const profileUpdateSchema = z.strictObject({
  name: z.string().max(100).optional(),
  bio: z.string().max(2000).optional(),
  credentials: z.string().max(2000).optional(),
  subjects: z.array(z.string()).optional(),
  availability: z.record(z.string(), z.unknown()).optional(),
  hourlyRate: z.number().optional(),
  subjectsOfInterest: z.array(z.string()).optional(),
  preferredLanguages: z.array(z.string()).optional(),
  paidClassesEnabled: z.boolean().optional(),
  paymentGatewayPreference: z.enum(['HITPAY', 'AIRWALLEX', '']).optional(),
  currency: z.string().optional(),
  avatarUrl: z.string().optional(),
  timezone: z.string().optional(),
  emailNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
  isOnboarded: z.boolean().optional(),
  tosAccepted: z.boolean().optional(),
  learningGoals: z.array(z.string()).optional(),
})

async function getHandler(_req: NextRequest, session: Session) {
  try {
    const [profileRow] = await drizzleDb
      .select()
      .from(profile)
      .where(eq(profile.userId, session.user.id))
      .limit(1)
    return NextResponse.json({
      profile: profileRow ?? null,
      userId: session.user.id,
      email: session.user.email ?? null,
      role: session.user.role ?? null,
    })
  } catch (error) {
    console.error('Profile fetch error:', error)
    return handleApiError(error, 'Failed to fetch profile', 'api/user/profile/route.ts')
  }
}

async function putHandler(req: NextRequest, session: Session) {
  try {
    const csrfError = await requireCsrf(req)
    if (csrfError) return csrfError

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parseResult = profileUpdateSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map(i => i.message).join(', ') },
        { status: 400 }
      )
    }

    // Reject blob URLs — they are temporary browser-only references and will
    // break as soon as the user refreshes the page.
    const rawAvatarUrl = (body as any)?.avatarUrl
    if (typeof rawAvatarUrl === 'string' && rawAvatarUrl.startsWith('blob:')) {
      return NextResponse.json(
        { error: 'Blob URLs are not allowed for avatars. Please upload a file instead.' },
        { status: 400 }
      )
    }

    const {
      name,
      bio,
      credentials,
      subjects,
      availability,
      hourlyRate,
      subjectsOfInterest,
      preferredLanguages,
      paidClassesEnabled,
      paymentGatewayPreference,
      currency,
      avatarUrl,
      timezone,
      emailNotifications,
      smsNotifications,
      isOnboarded,
      tosAccepted,
      learningGoals,
    } = parseResult.data

    // Prepare update data
    const updateData: Record<string, unknown> = {}

    // Common fields (sanitize to prevent XSS)
    if (name !== undefined)
      updateData.name = sanitizeHtml(String(name)).trim().slice(0, 100) || null
    if (bio !== undefined) updateData.bio = sanitizeHtmlWithMax(bio, 2000)
    if (avatarUrl !== undefined)
      updateData.avatarUrl = sanitizeHtml(String(avatarUrl)).trim() || null
    if (timezone !== undefined) updateData.timezone = sanitizeHtml(String(timezone)).trim()
    if (emailNotifications !== undefined)
      updateData.emailNotifications = Boolean(emailNotifications)
    if (smsNotifications !== undefined) updateData.smsNotifications = Boolean(smsNotifications)
    if (isOnboarded !== undefined) updateData.isOnboarded = Boolean(isOnboarded)
    if (tosAccepted === true) {
      updateData.tosAccepted = true
      updateData.tosAcceptedAt = new Date()
    }

    // Student fields
    if (subjectsOfInterest !== undefined) updateData.subjectsOfInterest = subjectsOfInterest
    if (preferredLanguages !== undefined)
      updateData.preferredLanguages = Array.isArray(preferredLanguages) ? preferredLanguages : []
    if (learningGoals !== undefined)
      updateData.learningGoals = Array.isArray(learningGoals) ? learningGoals : []

    // Tutor fields
    if (hourlyRate !== undefined) updateData.hourlyRate = hourlyRate
    if (subjects !== undefined) updateData.specialties = subjects // Map subjects to specialties
    if (paidClassesEnabled !== undefined)
      updateData.paidClassesEnabled = Boolean(paidClassesEnabled)
    if (paymentGatewayPreference !== undefined)
      updateData.paymentGatewayPreference =
        paymentGatewayPreference === '' ? null : paymentGatewayPreference
    if (currency !== undefined) updateData.currency = currency === '' ? null : currency

    // Tutor & Generic fields cleanup
    if (credentials !== undefined) updateData.credentials = sanitizeHtmlWithMax(credentials, 2000)
    if (availability !== undefined) updateData.availability = availability

    const [existing] = await drizzleDb
      .select()
      .from(profile)
      .where(eq(profile.userId, session.user.id))
      .limit(1)

    if (existing) {
      await drizzleDb
        .update(profile)
        .set(updateData as any)
        .where(eq(profile.userId, session.user.id))
    } else {
      const now = new Date()
      await drizzleDb.insert(profile).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        timezone: (updateData.timezone as string) ?? 'UTC',
        emailNotifications: (updateData.emailNotifications as boolean) ?? true,
        smsNotifications: (updateData.smsNotifications as boolean) ?? false,
        tosAccepted: (updateData.tosAccepted as boolean) ?? false,
        isOnboarded: (updateData.isOnboarded as boolean) ?? false,
        paidClassesEnabled: (updateData.paidClassesEnabled as boolean) ?? false,
        subjectsOfInterest: (updateData.subjectsOfInterest as string[]) ?? [],
        preferredLanguages: (updateData.preferredLanguages as string[]) ?? [],
        learningGoals: (updateData.learningGoals as string[]) ?? [],
        specialties: (updateData.specialties as string[]) ?? [],
        createdAt: now,
        updatedAt: now,
        ...updateData,
      } as any)
    }

    const [profileRow] = await drizzleDb
      .select()
      .from(profile)
      .where(eq(profile.userId, session.user.id))
      .limit(1)

    if (!profileRow) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    return NextResponse.json({ profile: profileRow })
  } catch (error) {
    console.error('Profile update error:', error)
    return handleApiError(error, 'Failed to update profile', 'api/user/profile/route.ts')
  }
}

export const GET = withAuth(getHandler)
export const PUT = withAuth(putHandler)
