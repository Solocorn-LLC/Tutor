/**
 * Web Push subscription management.
 * POST   /api/push/subscribe   - save (upsert) a browser PushSubscription
 * DELETE /api/push/subscribe   - remove a subscription by endpoint
 */
import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { withAuth, withCsrf, handleApiError, ValidationError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { pushSubscription } from '@/lib/db/schema'

export const POST = withCsrf(
  withAuth(async (req: NextRequest, session) => {
    try {
      const userId = session.user.id
      const body = await req.json().catch(() => null)
      const sub = body?.subscription ?? body
      const endpoint: string | undefined = sub?.endpoint
      const p256dh: string | undefined = sub?.keys?.p256dh
      const auth: string | undefined = sub?.keys?.auth
      if (!endpoint || !p256dh || !auth) {
        throw new ValidationError('Invalid push subscription')
      }

      // Upsert by endpoint (the unique key). Re-binding to the current user keeps
      // a shared device's subscription pointed at whoever is logged in.
      await drizzleDb
        .insert(pushSubscription)
        .values({
          userId,
          endpoint,
          p256dh,
          auth,
          userAgent: req.headers.get('user-agent') ?? null,
        })
        .onConflictDoUpdate({
          target: pushSubscription.endpoint,
          set: { userId, p256dh, auth },
        })

      return NextResponse.json({ ok: true })
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      return handleApiError(error, 'Failed to save subscription', 'api/push/subscribe')
    }
  })
)

export const DELETE = withCsrf(
  withAuth(async (req: NextRequest, session) => {
    try {
      const userId = session.user.id
      const body = await req.json().catch(() => null)
      const endpoint: string | undefined = body?.endpoint ?? body?.subscription?.endpoint
      if (!endpoint) throw new ValidationError('endpoint required')
      await drizzleDb
        .delete(pushSubscription)
        .where(
          and(eq(pushSubscription.endpoint, endpoint), eq(pushSubscription.userId, userId))
        )
      return NextResponse.json({ ok: true })
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      return handleApiError(error, 'Failed to remove subscription', 'api/push/subscribe')
    }
  })
)
