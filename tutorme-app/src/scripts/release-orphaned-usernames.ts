/**
 * One-off remediation: release usernames orphaned by account deletions that happened
 * BEFORE the "release username on deletion" fix (PR #1324) was deployed.
 *
 * Those deletions anonymized the account (email -> deleted-<id>@deleted.local) but left
 * `user.handle` and `profile.username` intact, so the freed usernames still read as taken
 * by the signup availability check. This nulls them for already-anonymized accounts only —
 * it never touches a live account.
 *
 * Usage:  DATABASE_URL=... npx tsx src/scripts/release-orphaned-usernames.ts
 * Safe to run repeatedly (idempotent).
 */
import { drizzleDb } from '@/lib/db/drizzle'
import { user, profile } from '@/lib/db/schema'
import { and, like, isNotNull, inArray } from 'drizzle-orm'

const DELETED_EMAIL = 'deleted-%@deleted.local'

async function main() {
  // Deleted accounts still holding a handle.
  const deletedUsers = await drizzleDb
    .select({ userId: user.userId, handle: user.handle, email: user.email })
    .from(user)
    .where(like(user.email, DELETED_EMAIL))

  const withHandle = deletedUsers.filter(u => u.handle)
  console.log(`Deleted accounts: ${deletedUsers.length} (with a handle still set: ${withHandle.length})`)

  if (withHandle.length > 0) {
    await drizzleDb
      .update(user)
      .set({ handle: null })
      .where(and(like(user.email, DELETED_EMAIL), isNotNull(user.handle)))
    console.log(`  ✓ released user.handle for ${withHandle.length} account(s): ${withHandle.map(u => u.handle).join(', ')}`)
  }

  const deletedIds = deletedUsers.map(u => u.userId)
  if (deletedIds.length > 0) {
    const staleProfiles = await drizzleDb
      .select({ userId: profile.userId, username: profile.username })
      .from(profile)
      .where(and(inArray(profile.userId, deletedIds), isNotNull(profile.username)))
    if (staleProfiles.length > 0) {
      await drizzleDb
        .update(profile)
        .set({ username: null })
        .where(and(inArray(profile.userId, deletedIds), isNotNull(profile.username)))
      console.log(`  ✓ released profile.username for ${staleProfiles.length} profile(s): ${staleProfiles.map(p => p.username).join(', ')}`)
    }
  }

  console.log('Done — orphaned usernames released.')
  process.exit(0)
}

main().catch(e => {
  console.error('release-orphaned-usernames failed:', e)
  process.exit(1)
})
