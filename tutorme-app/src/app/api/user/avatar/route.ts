import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'

import { withAuth, withCsrf, ValidationError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { profile } from '@/lib/db/schema'
import { saveAvatar, deleteAvatar, type AvatarCropPayload } from '@/lib/registration/register-user'

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
      const contentType = req.headers.get('content-type') || ''
      if (!contentType.includes('multipart/form-data')) {
        return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
      }

      const formData = await req.formData()
      const file = formData.get('avatar')
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Avatar file is required' }, { status: 400 })
      }

      let crop: AvatarCropPayload | null = null
      const cropRaw = formData.get('crop')
      if (typeof cropRaw === 'string' && cropRaw.trim()) {
        try {
          crop = JSON.parse(cropRaw) as AvatarCropPayload
        } catch {
          return NextResponse.json({ error: 'Invalid crop data' }, { status: 400 })
        }
      }

      try {
        // Capture the OLD avatar URL before we overwrite it.
        const [existing] = await drizzleDb
          .select({ avatarUrl: profile.avatarUrl })
          .from(profile)
          .where(eq(profile.userId, session.user.id))
          .limit(1)
        const oldAvatarUrl = existing?.avatarUrl || null

        // 1. Save new avatar FIRST (never delete old before we know the new one is ready)
        const avatarUrl = await saveAvatar(session.user.id, file, crop)

        // 2. Update DB with the new URL
        const [updated] = await drizzleDb
          .update(profile)
          .set({ avatarUrl })
          .where(eq(profile.userId, session.user.id))
          .returning({ avatarUrl: profile.avatarUrl })

        // 3. Only after DB update succeeds, delete the old avatar from storage
        if (oldAvatarUrl) {
          await deleteAvatar(oldAvatarUrl).catch((err: unknown) => {
            console.warn('Failed to clean up old avatar:', err)
          })
        }

        return NextResponse.json({
          success: true,
          avatarUrl: updated?.avatarUrl ?? avatarUrl,
        })
      } catch (error) {
        if (error instanceof ValidationError) {
          return NextResponse.json({ error: error.message }, { status: 400 })
        }
        console.error('Avatar upload error:', error)
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

        return NextResponse.json({ success: true })
      } catch (error) {
        console.error('Avatar delete error:', error)
        return NextResponse.json({ error: 'Failed to delete photo' }, { status: 500 })
      }
    },
    { role: 'STUDENT' }
  )
)
