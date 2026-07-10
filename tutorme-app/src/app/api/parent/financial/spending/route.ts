/**
 * GET /api/parent/financial/spending
 * Detailed spending analysis with trends and aggregation
 */
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import { getFamilyAccountForParent } from '@/lib/api/parent-helpers'
import { fetchFamilyPayments } from '@/lib/financial/parent-financial-service'
import {
  aggregateSpendingByPeriod,
  computeMonthlySpendingSummary,
  getPlatformFeeRate,
} from '@/lib/financial/calculations'
import cacheManager from '@/lib/cache-manager'

const CACHE_TTL = 120

export const GET = withAuth(
  async (req: NextRequest, session) => {
    try {
      const family = await getFamilyAccountForParent(session)
      if (!family) {
        return NextResponse.json({ error: 'No family account found' }, { status: 404 })
      }

      const { searchParams } = new URL(req.url)
      const studentId = searchParams.get('studentId') ?? undefined
      const period = (searchParams.get('period') ?? 'monthly') as 'monthly' | 'weekly'

      const cacheKey = `parent:financial:spending:${family.familyAccountId}:${studentId ?? 'all'}:${period}`
      const cached = await cacheManager.get<object>(cacheKey)
      if (cached) return NextResponse.json({ success: true, data: cached })

      const payments = await fetchFamilyPayments(family, { studentId })
      const completed = payments.filter(p => ['COMPLETED', 'completed', 'paid'].includes(p.status))

      const trends = aggregateSpendingByPeriod(
        completed.map(p => ({
          amount: p.amount,
          createdAt: p.createdAt,
          type: p.type,
        })),
        period
      )

      const feeRate = getPlatformFeeRate()
      const monthlySummaries = computeMonthlySpendingSummary(
        completed.map(p => ({
          amount: p.amount,
          createdAt: p.createdAt,
          type: p.type,
        })),
        undefined,
        feeRate
      )

      const data = {
        trends,
        monthlySummaries,
      }

      await cacheManager.set(cacheKey, data, {
        ttl: CACHE_TTL,
        tags: [`family:${family.familyAccountId}`],
      })

      return NextResponse.json({ success: true, data })
    } catch (err) {
      return handleApiError(err, 'Failed to fetch spending analysis', 'ParentFinancialSpending')
    }
  },
  { role: 'PARENT' }
)
