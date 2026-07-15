/**
 * PATCH /api/one-on-one/tasks/[taskId]  (tutor only)
 *
 * A lightweight in-session "quick edit" for a deployed task: updates the title
 * and/or content of the tutor's own BuilderTask. Because the BuilderTask is the
 * shared source of truth, the change reflects everywhere the task is used. For
 * deeper edits (questions, PCI/DMI, structure) the classroom deep-links into the
 * full Course Builder instead.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask } from '@/lib/db/schema'

const patchSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    content: z.string().max(100_000).optional(),
  })
  .refine(d => d.title !== undefined || d.content !== undefined, {
    message: 'Nothing to update',
  })

export const PATCH = withAuth(
  async (
    req: NextRequest,
    session,
    ctx: { params: Promise<Record<string, string | string[]>> }
  ) => {
    const params = await ctx.params
    const taskId = typeof params.taskId === 'string' ? params.taskId : ''
    if (!taskId) return NextResponse.json({ error: 'Missing task id' }, { status: 400 })

    let body: z.infer<typeof patchSchema>
    try {
      body = patchSchema.parse(await req.json())
    } catch {
      return NextResponse.json({ error: 'Invalid update' }, { status: 400 })
    }

    const update: { title?: string; content?: string; updatedAt: Date } = { updatedAt: new Date() }
    if (body.title !== undefined) update.title = body.title.trim()
    if (body.content !== undefined) update.content = body.content

    // Only the owning tutor may edit, and only a live (non-deleted) task.
    const [row] = await drizzleDb
      .update(builderTask)
      .set(update)
      .where(
        and(
          eq(builderTask.taskId, taskId),
          eq(builderTask.tutorId, session.user.id),
          isNull(builderTask.deletedAt)
        )
      )
      .returning({
        taskId: builderTask.taskId,
        title: builderTask.title,
        content: builderTask.content,
      })

    if (!row) {
      return NextResponse.json({ error: 'Task not found or not yours' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, task: row })
  },
  { role: 'TUTOR' }
)
