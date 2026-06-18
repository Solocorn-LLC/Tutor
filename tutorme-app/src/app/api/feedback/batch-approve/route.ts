/**
 * POST /api/feedback/batch-approve
 * Batch approve multiple feedback items (withAuth + CSRF; TUTOR or ADMIN).
 */

import { NextRequest, NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { withAuth, requireCsrf, handleApiError } from '@/lib/api/middleware'
import { batchApproveFeedback } from '@/lib/feedback/workflow'

async function postHandler(request: NextRequest, session: Session) {
  const csrfError = await requireCsrf(request)
  if (csrfError) return csrfError

  try {
    if (session.user.role !== 'TUTOR' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '无权批量审核' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { ids } = (body || {}) as { ids?: string[] }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '请提供要审核的反馈ID列表' }, { status: 400 })
    }

    if (ids.length > 50) {
      return NextResponse.json({ error: '单次最多审核50条反馈' }, { status: 400 })
    }

    const result = await batchApproveFeedback(ids, session.user.id, {
      bypassOwnership: session.user.role === 'ADMIN',
    })

    return NextResponse.json({
      success: result.success,
      data: {
        approved: result.approved,
        failed: result.failed,
        total: ids.length,
      },
    })
  } catch (error) {
    console.error('Failed to batch approve feedback:', error)
    return handleApiError(error, '批量审核失败', 'api/feedback/batch-approve/route.ts')
  }
}

export const POST = withAuth(postHandler)
