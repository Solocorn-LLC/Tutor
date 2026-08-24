import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, deployedMaterial } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'

export const dynamic = 'force-dynamic'

async function handler(
  req: NextRequest,
  _session: import('next-auth').Session,
  context: { params: Promise<Record<string, string | string[]>> }
) {
  const sessionId = await getParamAsync(context.params, 'id')
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
  }

  const body = (await req.json().catch(() => ({}))) as { taskId?: string; courseId?: string }
  const { taskId } = body
  if (!sessionId || !taskId) {
    return NextResponse.json({ error: 'Session ID and task ID are required' }, { status: 400 })
  }

  const [sessionRec] = await drizzleDb
    .select({ status: liveSession.status, courseId: liveSession.courseId })
    .from(liveSession)
    .where(eq(liveSession.sessionId, sessionId))
    .limit(1)

  if (!sessionRec) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (sessionRec.status !== 'scheduled' && sessionRec.status !== 'preparing') {
    return NextResponse.json(
      { error: 'Tasks can only be removed before the session starts' },
      { status: 409 }
    )
  }

  await drizzleDb
    .delete(deployedMaterial)
    .where(and(eq(deployedMaterial.sessionId, sessionId), eq(deployedMaterial.itemId, taskId)))

  return NextResponse.json({ success: true, taskId, sessionId })
}

export const POST = withAuth(handler, { role: 'TUTOR' })
