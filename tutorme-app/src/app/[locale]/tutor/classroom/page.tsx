/**
 * The tutor live classroom is unified on the insights-based experience
 * (/tutor/insights with view=classroom, rendered by CourseBuilderInsightsRoute), which
 * has working state-sync, whiteboard broadcast, polls and recording controls.
 *
 * This route is kept as a stable entry point for the many nav links that point at
 * /tutor/classroom?sessionId=... — it derives the course context and redirects to the
 * canonical classroom.
 */

import { redirect } from 'next/navigation'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export default async function TutorClassroomRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  const sp = await searchParams

  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === 'string') qs.set(key, value)
  }

  // The insights classroom reads courseId from the URL; nav links that pass only a
  // sessionId would otherwise lose the course context. Derive it from the session.
  const sessionId = typeof sp.sessionId === 'string' ? sp.sessionId : undefined
  if (sessionId && (!qs.get('courseId') || !qs.get('lessonId'))) {
    try {
      const [row] = await drizzleDb
        .select({ courseId: liveSession.courseId, lessonId: liveSession.lessonId })
        .from(liveSession)
        .where(eq(liveSession.sessionId, sessionId))
        .limit(1)
      if (row?.courseId && !qs.get('courseId')) qs.set('courseId', row.courseId)
      // Carry the session's assigned lesson so the classroom opens on it.
      if (row?.lessonId && !qs.get('lessonId')) qs.set('lessonId', row.lessonId)
    } catch {
      // Fall through and redirect with whatever params we have.
    }
  }

  qs.set('view', 'classroom')
  redirect(`/${locale}/tutor/insights?${qs.toString()}`)
}
