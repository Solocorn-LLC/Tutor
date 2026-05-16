/**
 * Student Progress API (Drizzle)
 * GET /api/progress — all progress for current student (withAuth)
 * POST /api/progress — update progress (withAuth + CSRF, Zod-validated)
 *
 * NOTE: GET now delegates to the unified progress service for backward compatibility.
 * Prefer /api/student/progress/unified for new code.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { eq, and } from 'drizzle-orm'
import { withAuth, requireCsrf, handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { contentProgress } from '@/lib/db/schema'
import { getStudentProgress } from '@/lib/progress/get-student-progress'
import { z } from 'zod'

const postBodySchema = z.object({
  contentId: z.string().min(1, 'Content ID is required'),
  progress: z.number().min(0).max(100).optional(),
  lastPosition: z.number().min(0).optional(),
  completed: z.boolean().optional(),
})

async function getHandler(_req: NextRequest, session: Session) {
  try {
    const items = await getStudentProgress(session.user.id, { type: 'video' })

    const progress = items.map(item => ({
      progressId: (item.metadata?.progressId as string) ?? item.id,
      studentId: session.user.id,
      contentId: item.id,
      progress: item.progress,
      completed: item.completed,
      lastPosition: item.metadata?.lastPosition ?? null,
      updatedAt: item.lastAccessedAt ?? new Date(),
      content: {
        contentId: item.id,
        title: item.title,
        subject: (item.metadata?.subject as string) ?? '',
        type: (item.metadata?.contentType as string) ?? 'video',
      },
    }))

    return NextResponse.json({ progress })
  } catch (error) {
    console.error('Progress fetch error:', error)
    return handleApiError(error, 'Failed to fetch progress', 'api/progress/route.ts')
  }
}

async function postHandler(req: NextRequest, session: Session) {
  const csrfError = await requireCsrf(req)
  if (csrfError) return csrfError

  try {
    const body = await req.json().catch(() => ({}))
    const parsed = postBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map(i => i.message).join('; ') },
        { status: 400 }
      )
    }
    const { contentId, progress, lastPosition, completed } = parsed.data
    const studentId = session.user.id

    const [existing] = await drizzleDb
      .select()
      .from(contentProgress)
      .where(
        and(eq(contentProgress.contentId, contentId), eq(contentProgress.studentId, studentId))
      )
      .limit(1)

    let updatedProgress
    if (existing) {
      const [updated] = await drizzleDb
        .update(contentProgress)
        .set({
          ...(progress !== undefined && { progress }),
          ...(lastPosition !== undefined && { lastPosition }),
          ...(completed !== undefined && { completed }),
        })
        .where(eq(contentProgress.progressId, existing.progressId))
        .returning()
      updatedProgress = updated ?? existing
    } else {
      const progressId = crypto.randomUUID()
      const createdRows = await drizzleDb
        .insert(contentProgress)
        .values({
          progressId,
          studentId,
          contentId,
          progress: progress ?? 0,
          lastPosition: lastPosition ?? undefined,
          completed: completed ?? false,
        })
        .returning()
      updatedProgress = createdRows[0]!
    }

    return NextResponse.json({ progress: updatedProgress })
  } catch (error) {
    console.error('Progress update error:', error)
    return handleApiError(error, 'Failed to update progress', 'api/progress/route.ts')
  }
}

export const GET = withAuth(getHandler)
export const POST = withAuth(postHandler)
