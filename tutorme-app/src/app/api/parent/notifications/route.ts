/**
 * GET /api/parent/notifications
 * PATCH /api/parent/notifications (mark as read)
 */

import { NextRequest, NextResponse } from 'next/server'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { withAuth } from '@/lib/api/middleware'
import { getFamilyAccountForParent } from '@/lib/api/parent-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import { familyNotification } from '@/lib/db/schema'
import cacheManager from '@/lib/cache-manager'
import { z } from 'zod'

const CACHE_TTL = 60

const markReadSchema = z.object({
  ids: z.array(z.string()).optional(),
  all: z.boolean().optional(),
})

export const GET = withAuth(
  async (req: NextRequest, session) => {
    const family = await getFamilyAccountForParent(session)
    if (!family) {
      return NextResponse.json({ error: 'No family account found' }, { status: 404 })
    }

    const cacheKey = `parent:notifications:${family.familyAccountId}`
    const cached = await cacheManager.get<object>(cacheKey)
    if (cached) return NextResponse.json({ success: true, data: cached })

    const notifications = await drizzleDb.query.familyNotification.findMany({
      where: eq(familyNotification.parentId, family.familyAccountId),
      orderBy: [desc(familyNotification.createdAt)],
      limit: 50,
    })

    const data = {
      notifications: notifications.map((n: any) => ({
        id: n.notificationId,
        title: n.title,
        message: n.message,
        isRead: n.isRead,
        createdAt: n.createdAt,
      })),
      unreadCount: notifications.filter((n: any) => !n.isRead).length,
    }

    await cacheManager.set(cacheKey, data, {
      ttl: CACHE_TTL,
      tags: [`family:${family.familyAccountId}`],
    })
    return NextResponse.json({ success: true, data })
  },
  { role: 'PARENT' }
)

export const PATCH = withAuth(
  async (req: NextRequest, session) => {
    const family = await getFamilyAccountForParent(session)
    if (!family) {
      return NextResponse.json({ error: 'No family account found' }, { status: 404 })
    }

    let body: { ids?: string[]; all?: boolean }
    try {
      body = markReadSchema.parse(await req.json().catch(() => ({})))
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const conditions: any[] = [eq(familyNotification.parentId, family.familyAccountId)]

    if (body.all === true) {
      conditions.push(eq(familyNotification.isRead, false))
    } else if (body.ids?.length) {
      conditions.push(inArray(familyNotification.notificationId, body.ids))
    } else {
      return NextResponse.json({ error: 'Provide ids or all' }, { status: 400 })
    }

    await drizzleDb
      .update(familyNotification)
      .set({ isRead: true })
      .where(and(...conditions))

    await cacheManager.invalidateTag(`family:${family.familyAccountId}`)

    return NextResponse.json({ success: true })
  },
  { role: 'PARENT' }
)
