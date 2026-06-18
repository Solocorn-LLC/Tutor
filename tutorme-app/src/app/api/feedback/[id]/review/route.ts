/**
 * POST /api/feedback/[id]/review
 * Review (approve/reject/modify) a feedback item (withAuth + CSRF; TUTOR or ADMIN).
 */

import { NextRequest, NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { withAuth, requireCsrf, handleApiError } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { reviewFeedback } from '@/lib/feedback/workflow'

async function postHandler(
  request: NextRequest,
  session: Session,
  context?: {
    params?: Promise<Record<string, string | string[]>> | Record<string, string | string[]>
  }
) {
  const csrfError = await requireCsrf(request)
  if (csrfError) return csrfError

  try {
    if (session.user.role !== 'TUTOR' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '无权审核反馈' }, { status: 403 })
    }

    const id = await getParamAsync(context?.params, 'id')
    if (!id) {
      return NextResponse.json({ error: '反馈ID不能为空' }, { status: 400 })
    }
    const body = await request.json().catch(() => ({}))
    const { decision, modifications } = body as {
      decision: 'approve' | 'reject' | 'modify'
      modifications?: {
        modifiedScore?: number
        modifiedComments?: string
        addedNotes?: string
      }
    }

    if (!decision || !['approve', 'reject', 'modify'].includes(decision)) {
      return NextResponse.json({ error: '无效的审核决定' }, { status: 400 })
    }

    const result = await reviewFeedback(id, decision, session.user.id, modifications, {
      bypassOwnership: session.user.role === 'ADMIN',
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || '审核失败' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: decision === 'approve' ? '已通过' : decision === 'reject' ? '已拒绝' : '已修改',
    })
  } catch (error) {
    console.error('Failed to review feedback:', error)
    return handleApiError(error, '审核反馈失败', 'api/feedback/[id]/review/route.ts')
  }
}

export const POST = withAuth(postHandler)
