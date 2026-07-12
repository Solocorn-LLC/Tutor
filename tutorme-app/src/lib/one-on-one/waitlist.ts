/**
 * 1-on-1 waitlist helper — notify students waiting on a tutor when a slot may
 * have opened (e.g. a confirmed booking was cancelled).
 */

import { eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneWaitlist, profile } from '@/lib/db/schema'
import { notify } from '@/lib/notifications/notify'

/** Notify everyone on a tutor's waitlist that a slot may have opened. Returns
 *  how many students were notified. Best-effort; never throws. */
export async function notifyWaitlistOfOpening(tutorId: string): Promise<number> {
  try {
    const rows = await drizzleDb
      .select({ studentId: oneOnOneWaitlist.studentId })
      .from(oneOnOneWaitlist)
      .where(eq(oneOnOneWaitlist.tutorId, tutorId))
    if (rows.length === 0) return 0

    const [tutorProfile] = await drizzleDb
      .select({ name: profile.name, username: profile.username })
      .from(profile)
      .where(eq(profile.userId, tutorId))
      .limit(1)
    const tutorName = tutorProfile?.name || 'A tutor'
    const actionUrl = tutorProfile?.username ? `/u/${tutorProfile.username}` : '/student/dashboard'

    await Promise.all(
      rows.map(r =>
        notify({
          userId: r.studentId,
          type: 'class',
          title: 'A 1-on-1 slot may have opened',
          message: `${tutorName} may have new availability — book a 1-on-1 while it lasts.`,
          data: { tutorId, type: 'one-on-one-waitlist-opening' },
          actionUrl,
        }).catch(() => {})
      )
    )
    return rows.length
  } catch {
    return 0
  }
}
