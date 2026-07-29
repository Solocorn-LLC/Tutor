/**
 * Email verification: token lifecycle + login-enforcement policy.
 *
 * Tokens live in the NextAuth `VerificationToken` table (identifier = the user's
 * email, token = a random secret). A token is single-use and expires in 24h.
 *
 * Rollout safety:
 * - Verification emails are ALWAYS sent on sign-up (best-effort).
 * - Login enforcement is OFF unless `REQUIRE_EMAIL_VERIFICATION === 'true'`, and
 *   even then it only applies to accounts created AFTER `ENFORCED_AFTER` — so no
 *   pre-existing user (all of whom have a null `emailVerified`) is ever locked
 *   out, and new sign-ups can still complete if SMTP isn't wired up yet.
 */

import crypto from 'crypto'
import { eq, lt } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, verificationToken } from '@/lib/db/schema'
import { sendVerificationEmail } from '@/lib/email'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Accounts created on/before this instant are grandfathered — never gated on
 * email verification (they predate the feature). Overridable via env for staged
 * rollouts.
 */
const ENFORCED_AFTER = new Date(
  process.env.EMAIL_VERIFICATION_ENFORCED_AFTER || '2026-07-29T00:00:00.000Z'
)

/** Whether login should be blocked for unverified (post-cutoff) accounts. */
export function isEmailVerificationEnforced(): boolean {
  return process.env.REQUIRE_EMAIL_VERIFICATION === 'true'
}

/**
 * Should this account be blocked from signing in until it verifies its email?
 * Only when enforcement is on, the account was created after the cutoff, and it
 * hasn't verified yet.
 */
export function shouldBlockUnverifiedLogin(userRow: {
  emailVerified: Date | null
  createdAt: Date | null
}): boolean {
  if (!isEmailVerificationEnforced()) return false
  if (userRow.emailVerified) return false
  if (!userRow.createdAt || userRow.createdAt <= ENFORCED_AFTER) return false
  return true
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

function baseUrl(): string {
  return (process.env.NEXTAUTH_URL || 'http://localhost:3003').replace(/\/$/, '')
}

/**
 * Create a fresh verification token for `email` (replacing any prior ones) and
 * return it. Insert only — the caller sends the email so it can be done outside
 * a DB transaction.
 */
export async function issueVerificationToken(email: string): Promise<string> {
  const identifier = email.trim().toLowerCase()
  const token = generateToken()
  const expires = new Date(Date.now() + TOKEN_TTL_MS)
  // One outstanding token per email — drop older ones first.
  await drizzleDb.delete(verificationToken).where(eq(verificationToken.identifier, identifier))
  await drizzleDb.insert(verificationToken).values({ identifier, token, expires })
  return token
}

/** Build the verification link for a token. */
export function verificationUrl(token: string): string {
  return `${baseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`
}

/**
 * Issue a token and email the verification link. Best-effort: never throws (so a
 * mail outage can't fail registration). Returns whether the email was sent.
 */
export async function sendEmailVerification(
  email: string,
  name?: string | null
): Promise<{ sent: boolean }> {
  try {
    const token = await issueVerificationToken(email)
    await sendVerificationEmail({ to: email, name, verifyUrl: verificationUrl(token) })
    return { sent: true }
  } catch (err) {
    console.error('[email-verification] failed to send verification email:', err)
    return { sent: false }
  }
}

export type VerifyResult =
  | { ok: true; email: string; alreadyVerified: boolean }
  | { ok: false; reason: 'invalid' | 'expired' }

/**
 * Consume a verification token: mark the user's email verified and delete the
 * token. Idempotent-ish — a valid token verifies exactly once, then is gone.
 */
export async function consumeVerificationToken(token: string): Promise<VerifyResult> {
  if (!token) return { ok: false, reason: 'invalid' }

  const [row] = await drizzleDb
    .select()
    .from(verificationToken)
    .where(eq(verificationToken.token, token))
    .limit(1)

  if (!row) return { ok: false, reason: 'invalid' }

  if (row.expires.getTime() < Date.now()) {
    await drizzleDb.delete(verificationToken).where(eq(verificationToken.token, token))
    return { ok: false, reason: 'expired' }
  }

  const email = row.identifier
  const [userRow] = await drizzleDb
    .select({ emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  const alreadyVerified = !!userRow?.emailVerified
  if (!alreadyVerified) {
    await drizzleDb.update(user).set({ emailVerified: new Date() }).where(eq(user.email, email))
  }

  // Token is spent — remove every outstanding token for this identifier.
  await drizzleDb.delete(verificationToken).where(eq(verificationToken.identifier, email))

  return { ok: true, email, alreadyVerified }
}

/** Housekeeping: drop expired tokens (safe to call opportunistically). */
export async function purgeExpiredVerificationTokens(): Promise<void> {
  await drizzleDb.delete(verificationToken).where(lt(verificationToken.expires, new Date()))
}
