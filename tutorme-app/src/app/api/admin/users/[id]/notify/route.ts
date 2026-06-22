/**
 * POST /api/admin/users/[id]/notify — send a message to a user.
 * Delivered in-app + SSE + email (via notify.ts). Body: { subject, message }
 */
import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { requireAdmin, logAdminAction, getClientIp } from '@/lib/admin/auth'
import { Permissions } from '@/lib/admin/permissions'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { notify } from '@/lib/notifications/notify'

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAdmin(req, Permissions.USERS_WRITE)
  if (!session) return response!

  try {
    const id = await getParamAsync(context.params, 'id')
    if (!id) return NextResponse.json({ error: 'User id is required' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 150) : ''
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : ''
    if (!subject || !message) {
      return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 })
    }

    const [target] = await drizzleDb
      .select({ id: user.userId })
      .from(user)
      .where(eq(user.userId, id))
      .limit(1)
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // force: bypass the recipient's notification prefs/quiet-hours — this is a
    // direct admin message, not a routine notification.
    await notify({
      userId: id,
      type: 'message',
      title: subject,
      message,
      data: { fromAdmin: true },
      force: true,
    })

    await logAdminAction(session.adminId, 'admin.user.notify', {
      ipAddress: getClientIp(req),
      resourceType: 'user',
      resourceId: id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Failed to send message', 'api/admin/users/[id]/notify/route.ts')
  }
}
