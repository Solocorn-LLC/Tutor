/**
 * GET /api/parent/dashboard
 * Legacy clinic/gamification/task dashboard data removed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { getFamilyAccountForParent } from '@/lib/api/parent-helpers'
import cacheManager from '@/lib/cache-manager'

const CACHE_TTL = parseInt(process.env.CACHE_TTL_PARENT_DASHBOARD || '300', 10)

export const GET = withAuth(
  async (req: NextRequest, session) => {
    const startTime = Date.now()
    const family = await getFamilyAccountForParent(session)
    if (!family) {
      return NextResponse.json(
        { error: 'No family account found. Please complete parent registration first.' },
        { status: 404 }
      )
    }

    const cacheKey = `parent:dashboard:${family.familyAccountId}:${session.user.id}`

    const data = await cacheManager.getOrSet(
      cacheKey,
      async () => {
        const children = family.members
          .filter((m: any) => ['child', 'children'].includes(m.relation.toLowerCase()))
          .map((m: any) => ({
            id: m.userId || m.id,
            name: m.user?.profile?.name || m.name,
            avatar: (m.name || '?').slice(0, 2).toUpperCase(),
            upcomingClasses: 0,
            assignmentsDue: 0,
            progress: 0,
            lastActive: '—',
            subjects: [],
          }))

        return {
          parentName: session.user?.name || family.familyName,
          children,
          financialSummary: {
            monthlyBudget: family.monthlyBudget,
            spentThisMonth: 0,
            upcomingPayments: [],
          },
          recentActivity: [],
          notifications: [],
          stats: {
            totalChildren: children.length,
            upcomingClasses: 0,
            assignmentsDue: 0,
            unreadNotifications: 0,
          },
        }
      },
      {
        ttl: CACHE_TTL,
        tags: [`family:${family.familyAccountId}`, `parent:${session.user.id}`, 'dashboard'],
      }
    )

    const res = NextResponse.json({ success: true, data })
    res.headers.set('X-Response-Time', `${Date.now() - startTime}ms`)
    return res
  },
  { role: 'PARENT' }
)
