/**
 * GET /api/parent/progress
 * Legacy gamification/clinic-based progress removed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { getFamilyAccountForParent } from '@/lib/api/parent-helpers'
import cacheManager from '@/lib/cache-manager'

const CACHE_TTL = 120

export const GET = withAuth(
  async (req: NextRequest, session) => {
    const family = await getFamilyAccountForParent(session)
    if (!family) {
      return NextResponse.json({ error: 'No family account found' }, { status: 404 })
    }

    const cacheKey = `parent:progress:${family.familyAccountId}`
    const cached = await cacheManager.get<object>(cacheKey)
    if (cached) return NextResponse.json({ success: true, data: cached })

    const children = family.members
      .filter((m: any) => ['child', 'children'].includes(m.relation.toLowerCase()) && m.userId)
      .map((m: any) => ({
        id: m.userId,
        name: m.user?.profile?.name || m.name,
        courses: [],
        overallProgress: null,
        strengths: [],
        weaknesses: [],
      }))

    const data = {
      children,
      overview: { totalLessons: 0, completedLessons: 0, averageScore: null },
    }

    await cacheManager.set(cacheKey, data, {
      ttl: CACHE_TTL,
      tags: [`family:${family.familyAccountId}`],
    })
    return NextResponse.json({ success: true, data })
  },
  { role: 'PARENT' }
)
