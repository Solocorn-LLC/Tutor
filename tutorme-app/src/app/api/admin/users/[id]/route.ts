/**
 * PATCH /api/admin/users/[id] — suspend or reactivate a user account.
 * Body: { action: 'suspend' | 'activate' }
 */
import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { requireAdmin, logAdminAction, getClientIp } from '@/lib/admin/auth'
import { Permissions } from '@/lib/admin/permissions'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, adminSession } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAdmin(req, Permissions.USERS_BAN)
  if (!session) return response!

  try {
    const id = await getParamAsync(context.params, 'id')
    if (!id) return NextResponse.json({ error: 'User id is required' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const action = body?.action
    if (action !== 'suspend' && action !== 'activate') {
      return NextResponse.json({ error: "action must be 'suspend' or 'activate'" }, { status: 400 })
    }

    if (id === session.adminId && action === 'suspend') {
      return NextResponse.json({ error: 'You cannot suspend your own account' }, { status: 400 })
    }

    const [target] = await drizzleDb
      .select({ id: user.userId, status: user.status })
      .from(user)
      .where(eq(user.userId, id))
      .limit(1)
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const newStatus = action === 'suspend' ? 'suspended' : 'active'
    await drizzleDb
      .update(user)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(user.userId, id))

    // Revoke any active NextAuth-independent admin sessions for a suspended admin.
    if (newStatus === 'suspended') {
      await drizzleDb
        .update(adminSession)
        .set({ isRevoked: true })
        .where(eq(adminSession.adminId, id))
    }

    await logAdminAction(session.adminId, `admin.user.${action}`, {
      ipAddress: getClientIp(req),
      resourceType: 'user',
      resourceId: id,
    })

    return NextResponse.json({ success: true, id, status: newStatus })
  } catch (error) {
    return handleApiError(error, 'Failed to update user', 'api/admin/users/[id]/route.ts')
  }
}
