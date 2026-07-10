import { eq, and, isNull } from 'drizzle-orm'
import { drizzleDb } from '../src/lib/db/drizzle'
import { liveSession } from '../src/lib/db/schema'

async function main() {
  // Find orphaned scheduled sessions (course was deleted, courseId is NULL)
  const orphaned = await drizzleDb
    .select({
      sessionId: liveSession.sessionId,
      title: liveSession.title,
      scheduledAt: liveSession.scheduledAt,
    })
    .from(liveSession)
    .where(
      and(
        isNull(liveSession.courseId),
        eq(liveSession.status, 'scheduled')
      )
    )

  console.log(`Found ${orphaned.length} orphaned live sessions with status 'scheduled'`)

  if (orphaned.length === 0) {
    console.log('Nothing to clean up.')
    return
  }

  // Log the sessions that will be updated
  console.log('\nSessions to be updated:')
  for (const session of orphaned) {
    const dateStr = session.scheduledAt
      ? new Date(session.scheduledAt).toISOString()
      : 'no date'
    console.log(`  - ${session.sessionId}: "${session.title}" scheduled at ${dateStr}`)
  }

  // Update status to 'ended' so they no longer block the scheduler
  const result = await drizzleDb
    .update(liveSession)
    .set({ status: 'ended', endedAt: new Date() })
    .where(
      and(
        isNull(liveSession.courseId),
        eq(liveSession.status, 'scheduled')
      )
    )
    .returning({ sessionId: liveSession.sessionId })

  console.log(`\nUpdated ${result.length} orphaned sessions to 'ended' status.`)
  console.log('These time slots should now be available in the scheduler.')
}

main()
  .catch(err => {
    console.error('Cleanup failed:', err)
    process.exit(1)
  })
  .finally(() => {
    process.exit(0)
  })
