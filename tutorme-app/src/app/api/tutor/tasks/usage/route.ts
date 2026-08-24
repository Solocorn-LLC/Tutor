/**
 * POST /api/tutor/tasks/usage
 *
 * Returns which builder item ids (tasks, assessments, homework, quizzes, worksheets)
 * have been deployed in published courses. The course builder uses this to lock
 * those items from editing client-side while the server enforces the same rule.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { getTaskUsage } from '@/lib/courses/task-usage'
import { z } from 'zod'

const bodySchema = z.object({
  itemIds: z.array(z.string()).max(2000),
})

export const POST = withAuth(
  async (req: NextRequest) => {
    const body = await req.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    try {
      const usage = await getTaskUsage(parsed.data.itemIds)
      const locked = Object.entries(usage)
        .filter(([, u]) => u.hasDeployments)
        .map(([itemId]) => itemId)

      return NextResponse.json({ locked, usage })
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      console.error('[TasksUsage POST] Error:', error.message)
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
  },
  { role: 'TUTOR' }
)
