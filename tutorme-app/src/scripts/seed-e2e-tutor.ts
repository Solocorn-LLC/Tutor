/**
 * Seeds a deterministic TUTOR account for e2e tests (used by the CI e2e job).
 * Idempotent — safe to run repeatedly.
 *
 * Credentials come from E2E_TUTOR_EMAIL / E2E_TUTOR_PASSWORD; the defaults match
 * the Playwright specs (tutor@example.com / Password1). The profile is created
 * onboarded + TOS-accepted so the post-login redirect lands on /tutor/dashboard
 * rather than the onboarding flow.
 *
 * Run with: npx tsx src/scripts/seed-e2e-tutor.ts
 */

import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, profile } from '@/lib/db/schema'

export async function seedE2ETutor(): Promise<void> {
  const email = (process.env.E2E_TUTOR_EMAIL ?? 'tutor@example.com').trim().toLowerCase()
  const password = process.env.E2E_TUTOR_PASSWORD ?? 'Password1'
  // Same cost factor used by the app's hashPassword; authorize() compares with bcrypt.
  const hashedPassword = await bcrypt.hash(password, 12)

  const [existingUser] = await drizzleDb.select().from(user).where(eq(user.email, email)).limit(1)

  let userId = existingUser?.userId
  if (userId) {
    await drizzleDb
      .update(user)
      .set({ password: hashedPassword, role: 'TUTOR', status: 'active' })
      .where(eq(user.userId, userId))
  } else {
    userId = crypto.randomUUID()
    await drizzleDb.insert(user).values({
      userId,
      email,
      password: hashedPassword,
      role: 'TUTOR',
      status: 'active',
      emailVerified: new Date(),
    })
  }

  const [existingProfile] = await drizzleDb
    .select()
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)

  if (existingProfile) {
    await drizzleDb
      .update(profile)
      .set({ isOnboarded: true, tosAccepted: true, tosAcceptedAt: new Date() })
      .where(eq(profile.userId, userId))
  } else {
    await drizzleDb.insert(profile).values({
      profileId: crypto.randomUUID(),
      userId,
      name: 'E2E Tutor',
      isOnboarded: true,
      tosAccepted: true,
      tosAcceptedAt: new Date(),
    })
  }

  console.log(`✓ Seeded e2e tutor: ${email} (role TUTOR, onboarded)`)
}

if (require.main === module) {
  seedE2ETutor()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('e2e tutor seed failed:', err)
      process.exit(1)
    })
}
