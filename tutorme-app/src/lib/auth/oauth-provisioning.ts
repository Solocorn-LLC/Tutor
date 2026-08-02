/**
 * Provision (find-or-create + link) a user signing in through an OAuth provider.
 *
 * OAuth gives us an identity (email/name/avatar) but none of the app's required
 * shape — a role, a profile row, a handle. This mirrors what `performRegistration`
 * builds for credential signups, minus the password.
 *
 * Account-linking policy: when the provider verifies the email (Google/Apple/
 * Facebook do), an existing email/password account with the same email is linked
 * (a row in `Account` + `emailVerified` set) rather than duplicated. Providers
 * that don't verify email never link into an existing account.
 */

import crypto from 'crypto'
import { nanoid } from 'nanoid'
import { and, eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, profile, account } from '@/lib/db/schema'
import { HANDLE_REGEX, isReservedHandle } from '@/lib/mentions/handles'

export type OAuthRole = 'STUDENT' | 'TUTOR' | 'PARENT'
const VALID_ROLES: OAuthRole[] = ['STUDENT', 'TUTOR', 'PARENT']

export function normalizeOAuthRole(raw: string | null | undefined): OAuthRole {
  const up = (raw || '').toUpperCase()
  return (VALID_ROLES as string[]).includes(up) ? (up as OAuthRole) : 'STUDENT'
}

export interface OAuthProvisionInput {
  email: string
  name?: string | null
  image?: string | null
  emailVerifiedByProvider: boolean
  provider: string
  providerAccountId: string
  role: OAuthRole
  tokens?: {
    access_token?: string | null
    refresh_token?: string | null
    expires_at?: number | null
    token_type?: string | null
    scope?: string | null
    id_token?: string | null
  }
}

export interface OAuthProvisionResult {
  ok: boolean
  userId?: string
  role?: OAuthRole
  reason?: 'no_email' | 'link_blocked' | 'error'
}

function seedHandle(seed: string): string {
  const cleaned = seed
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned.length >= 3 ? cleaned.slice(0, 30) : `user${nanoid(6).toLowerCase()}`.slice(0, 30)
}

async function generateUniqueHandle(preferred: string): Promise<string> {
  const base = seedHandle(preferred)
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const suffix = attempt === 0 ? '' : String(Math.floor(Math.random() * 9000) + 1000)
    const candidate = `${base}${suffix}`.slice(0, 30)
    if (!HANDLE_REGEX.test(candidate) || isReservedHandle(candidate)) continue
    const [taken] = await drizzleDb
      .select({ userId: user.userId })
      .from(user)
      .where(eq(user.handle, candidate))
      .limit(1)
    if (!taken) return candidate
  }
  return `user${nanoid(8).toLowerCase()}`.slice(0, 30)
}

/** Insert (or refresh) the Account link row for this provider identity. */
async function upsertAccountLink(
  db: typeof drizzleDb,
  userId: string,
  input: OAuthProvisionInput
): Promise<void> {
  const [existing] = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(
      and(
        eq(account.provider, input.provider),
        eq(account.providerAccountId, input.providerAccountId)
      )
    )
    .limit(1)

  const values = {
    type: 'oauth',
    userId,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    access_token: input.tokens?.access_token ?? null,
    refresh_token: input.tokens?.refresh_token ?? null,
    expires_at: input.tokens?.expires_at ?? null,
    token_type: input.tokens?.token_type ?? null,
    scope: input.tokens?.scope ?? null,
    id_token: input.tokens?.id_token ?? null,
    session_state: null as string | null,
  }

  if (existing) {
    await db.update(account).set(values).where(eq(account.accountId, existing.accountId))
  } else {
    await db.insert(account).values({ accountId: crypto.randomUUID(), ...values })
  }
}

/**
 * Resolve the JWT token fields for an OAuth sign-in from our DB user (the
 * provider `user` object carries no role/profile). Returns null if not found.
 */
export async function getUserTokenFieldsByEmail(email: string): Promise<{
  id: string
  role: string
  name: string
  email: string
  image: string | null
  onboardingComplete: boolean
  tosAccepted: boolean
} | null> {
  const normalized = (email || '').trim().toLowerCase()
  if (!normalized) return null
  const [u] = await drizzleDb
    .select({ userId: user.userId, email: user.email, role: user.role, image: user.image })
    .from(user)
    .where(eq(user.email, normalized))
    .limit(1)
  if (!u) return null
  const [p] = await drizzleDb
    .select({
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      isOnboarded: profile.isOnboarded,
      tosAccepted: profile.tosAccepted,
    })
    .from(profile)
    .where(eq(profile.userId, u.userId))
    .limit(1)
  return {
    id: u.userId,
    role: u.role,
    name: p?.name ?? u.email,
    email: u.email,
    image: p?.avatarUrl ?? u.image ?? null,
    onboardingComplete: p?.isOnboarded ?? false,
    tosAccepted: p?.tosAccepted ?? false,
  }
}

export async function provisionOAuthUser(
  input: OAuthProvisionInput
): Promise<OAuthProvisionResult> {
  const email = (input.email || '').trim().toLowerCase()
  if (!email) return { ok: false, reason: 'no_email' }

  try {
    const [existing] = await drizzleDb
      .select({ userId: user.userId, role: user.role, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.email, email))
      .limit(1)

    if (existing) {
      // Only link into an existing account when the provider verifies the email —
      // otherwise a spoofed unverified email could hijack an account.
      if (!input.emailVerifiedByProvider) {
        return { ok: false, reason: 'link_blocked' }
      }
      await upsertAccountLink(drizzleDb, existing.userId, input)
      if (!existing.emailVerified) {
        await drizzleDb
          .update(user)
          .set({ emailVerified: new Date() })
          .where(eq(user.userId, existing.userId))
      }
      return { ok: true, userId: existing.userId, role: existing.role as OAuthRole }
    }

    // New account.
    const role = input.role
    const userId = crypto.randomUUID()
    const now = new Date()
    const name = (input.name || email.split('@')[0] || 'User').slice(0, 100)
    const handle = await generateUniqueHandle(name || email.split('@')[0] || 'user')

    await drizzleDb.transaction(async tx => {
      await tx.insert(user).values({
        userId,
        email,
        password: null,
        role,
        handle,
        // OAuth providers own the email verification, so the account is verified.
        emailVerified: now,
        image: input.image ?? null,
        createdAt: now,
        updatedAt: now,
      })

      await tx.insert(profile).values({
        profileId: crypto.randomUUID(),
        userId,
        name,
        username: handle,
        bio: null,
        avatarUrl: input.image ?? null,
        dateOfBirth: null,
        timezone: 'Asia/Shanghai',
        emailNotifications: true,
        smsNotifications: false,
        studentUniqueId: role === 'STUDENT' ? `STU-${nanoid(12)}` : null,
        subjectsOfInterest: [],
        preferredLanguages: [],
        learningGoals: [],
        // Social signup buttons carry a "you agree to the Terms" notice.
        tosAccepted: true,
        tosAcceptedAt: now,
        organizationName: null,
        isOnboarded: role !== 'TUTOR',
        hourlyRate: null,
        oneOnOneEnabled: false,
        credentials: null,
        availability: null,
        paidClassesEnabled: false,
        paymentGatewayPreference: null,
        currency: null,
        nationality: null,
        countryOfResidence: null,
        createdAt: now,
        updatedAt: now,
      } as typeof profile.$inferInsert)

      await upsertAccountLink(tx as unknown as typeof drizzleDb, userId, input)
    })

    return { ok: true, userId, role }
  } catch (err) {
    console.error('[oauth-provisioning] failed:', err)
    return { ok: false, reason: 'error' }
  }
}
