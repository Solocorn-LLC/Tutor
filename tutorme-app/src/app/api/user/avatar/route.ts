import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'

import { withAuth, withCsrf, ValidationError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { cache } from '@/lib/db'
import { profile } from '@/lib/db/schema'
import { saveAvatar, deleteAvatar } from '@/lib/registration/register-user'

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
      const contentType = req.headers.get('content-type') || ''
      if (!contentType.includes('multipart/form-data')) {
        return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
      }

      const formData = await req.formData()
      const fileEntry = formData.get('avatar')
      // Use duck-typing instead of instanceof File to avoid issues with
      // different File constructors in Node.js / Next.js runtimes.
      if (!fileEntry || typeof (fileEntry as any).arrayBuffer !== 'function') {
        return NextResponse.json({ error: 'Avatar file is required' }, { status: 400 })
      }
      const file = fileEntry as File

      try {
        // Capture the OLD avatar URL before we overwrite it.
        const [existing] = await drizzleDb
          .select({ avatarUrl: profile.avatarUrl })
          .from(profile)
          .where(eq(profile.userId, session.user.id))
          .limit(1)
        const oldAvatarUrl = existing?.avatarUrl || null

        console.log('[avatar upload] Starting upload for user', session.user.id)

        // 1. Save new avatar FIRST (never delete old before we know the new one is ready)
        const avatarUrl = await saveAvatar(session.user.id, file)
        console.log('[avatar upload] saveAvatar returned URL:', avatarUrl)

        // 2. Update DB with the new URL
        const [updated] = await drizzleDb
          .update(profile)
          .set({ avatarUrl })
          .where(eq(profile.userId, session.user.id))
          .returning({ avatarUrl: profile.avatarUrl })
        if (!updated) {
          console.error('[avatar upload] Profile update returned no rows for user', session.user.id)
          return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }
        console.log('[avatar upload] DB updated, new avatarUrl:', updated?.avatarUrl)

        // 3. Only after DB update succeeds, delete the old avatar from storage.
        //    deleteFromDb: false because saveAvatar already overwrites avatarStorage
        //    via onConflictDoUpdate; deleting the row now would wipe the new avatar.
        if (oldAvatarUrl) {
          await deleteAvatar(oldAvatarUrl, { deleteFromDb: false }).catch((err: unknown) => {
            console.warn('[avatar upload] Failed to clean up old avatar:', err)
          })
        }

        // 4. Invalidate cached user/profile data so fresh avatar URLs appear immediately
        await cache.delete(`user:${session.user.id}`).catch(() => {})
        await cache.invalidatePattern(`profiles:*${session.user.id}*`).catch(() => {})
        await cache.invalidatePattern(`users:*${session.user.id}*`).catch(() => {})

        return NextResponse.json({
          success: true,
          avatarUrl: updated?.avatarUrl ?? avatarUrl,
        })
      } catch (error) {
        if (error instanceof ValidationError) {
          console.warn('[avatar upload] Validation error:', error.message)
          return NextResponse.json({ error: error.message }, { status: 400 })
        }
        console.error('[avatar upload] Unexpected error:', error)
        return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 })
      }
    },
    { role: 'STUDENT' }
  )
)

export const DELETE = withCsrf(
  withAuth(
    async (_req: NextRequest, session) => {
      try {
        const existing = await drizzleDb
          .select({ avatarUrl: profile.avatarUrl })
          .from(profile)
          .where(eq(profile.userId, session.user.id))
          .limit(1)

        if (existing[0]?.avatarUrl) {
          await deleteAvatar(existing[0].avatarUrl)
        }

        await drizzleDb
          .update(profile)
          .set({ avatarUrl: null })
          .where(eq(profile.userId, session.user.id))

        // Invalidate cached user/profile data
        await cache.delete(`user:${session.user.id}`).catch(() => {})
        await cache.invalidatePattern(`profiles:*${session.user.id}*`).catch(() => {})
        await cache.invalidatePattern(`users:*${session.user.id}*`).catch(() => {})

        return NextResponse.json({ success: true })
      } catch (error) {
        console.error('Avatar delete error:', error)
        return NextResponse.json({ error: 'Failed to delete photo' }, { status: 500 })
      }
    },
    { role: 'STUDENT' }
  )
)
