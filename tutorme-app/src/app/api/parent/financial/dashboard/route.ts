/**
 * GET /api/parent/financial/dashboard
 * Comprehensive financial overview for parent dashboard
 *
 * Performance: <150ms target with cache hit
 * Cache: L1 memory + L2 Redis, 120s TTL via cache.getOrSet
 */
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import { getFamilyAccountForParent } from '@/lib/api/parent-helpers'
import {
  fetchFamilyPayments,
  computeFinancialSummary,
  getBudgetForCurrentMonth,
} from '@/lib/financial/parent-financial-service'
import { generateRevenueForecast, computeBudgetVsActual } from '@/lib/financial/calculations'
import cacheManager from '@/lib/cache-manager'

const CACHE_TTL = parseInt(process.env.CACHE_TTL_PARENT_FINANCIAL || '120', 10)

export const GET = withAuth(
  async (req: NextRequest, session) => {
    const startTime = Date.now()
    try {
      const family = await getFamilyAccountForParent(session)
      if (!family) {
        return NextResponse.json({ error: 'No family account found' }, { status: 404 })
      }

      const { searchParams } = new URL(req.url)
      const studentId = searchParams.get('studentId') ?? undefined

      const cacheKey = `parent:financial:dashboard:${family.familyAccountId}:${studentId ?? 'all'}`

      const data = await cacheManager.getOrSet(
        cacheKey,
        async () => {
          const twelveMonthsAgo = new Date()
          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
          const payments = await fetchFamilyPayments(family, {
            studentId,
            startDate: twelveMonthsAgo,
          })
          const summary = computeFinancialSummary(
            payments,
            family.monthlyBudget,
            family.defaultCurrency
          )

          const budgetRecord = await getBudgetForCurrentMonth(family.familyAccountId)
          const actualSpent = summary.totalSpent
          const budget = budgetRecord?.amount ?? family.monthlyBudget
          const budgetVsActual = computeBudgetVsActual(budget, actualSpent, family.defaultCurrency)

          const byMonth = payments
            .filter(p => ['COMPLETED', 'completed', 'paid'].includes(p.status))
            .reduce<Record<string, number>>((acc, p) => {
              const key = `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, '0')}`
              acc[key] = (acc[key] ?? 0) + p.amount
              return acc
            }, {})
          const monthlyTotals = Object.values(byMonth)
          const revenueForecast = generateRevenueForecast(monthlyTotals, 3)

          return {
            summary: {
              ...summary,
              budgetVsActual,
            },
            revenueForecast,
          }
        },
        {
          ttl: CACHE_TTL,
          tags: [`family:${family.familyAccountId}`, 'financial', 'dashboard'],
        }
      )

      const res = NextResponse.json({ success: true, data })
      res.headers.set('X-Response-Time', `${Date.now() - startTime}ms`)
      return res
    } catch (err) {
      return handleApiError(err, 'Failed to fetch financial overview', 'ParentFinancialDashboard')
    }
  },
  { role: 'PARENT' }
)
