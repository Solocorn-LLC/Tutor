/**
 * GET /api/parent/financial/budget
 * Budget management and alerts
 */
import { NextRequest, NextResponse } from 'next/server'
import { and, eq, desc } from 'drizzle-orm'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import { getFamilyAccountForParent } from '@/lib/api/parent-helpers'
import {
  fetchFamilyPayments,
  computeFinancialSummary,
  getBudgetForCurrentMonth,
} from '@/lib/financial/parent-financial-service'
import { computeBudgetVsActual } from '@/lib/financial/calculations'
import { drizzleDb } from '@/lib/db/drizzle'
import { familyBudget, budgetAlert } from '@/lib/db/schema'
import cacheManager from '@/lib/cache-manager'

const CACHE_TTL = 120

export const GET = withAuth(
  async (req: NextRequest, session) => {
    try {
      const family = await getFamilyAccountForParent(session)
      if (!family) {
        return NextResponse.json({ error: 'No family account found' }, { status: 404 })
      }

      const cacheKey = `parent:financial:budget:${family.familyAccountId}`
      const cached = await cacheManager.get<object>(cacheKey)
      if (cached) return NextResponse.json({ success: true, data: cached })

      const payments = await fetchFamilyPayments(family)
      const summary = computeFinancialSummary(
        payments,
        family.monthlyBudget,
        family.defaultCurrency
      )

      const budgetRecord = await getBudgetForCurrentMonth(family.familyAccountId)
      const now = new Date()
      const budgetAmount = budgetRecord?.amount ?? family.monthlyBudget
      const spent = budgetRecord?.spent ?? summary.totalSpent

      const budgetVsActual = computeBudgetVsActual(budgetAmount, spent, family.defaultCurrency)

      const budgetRecords = await drizzleDb.query.familyBudget.findMany({
        where: eq(familyBudget.parentId, family.familyAccountId),
        orderBy: [desc(familyBudget.year), desc(familyBudget.month)],
        limit: 12,
      })

      const alerts = await drizzleDb.query.budgetAlert.findMany({
        where: and(eq(budgetAlert.parentId, family.familyAccountId), eq(budgetAlert.isRead, false)),
        orderBy: [desc(budgetAlert.createdAt)],
        limit: 10,
      })

      const data = {
        budgetVsActual: {
          ...budgetVsActual,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        },
        budgetRecords: budgetRecords.map((r: any) => ({
          month: r.month,
          year: r.year,
          amount: r.amount,
          spent: r.spent,
          remaining: Math.round((r.amount - r.spent) * 100) / 100,
        })),
        alerts: alerts.map((a: any) => ({
          id: a.id,
          type: a.type,
          message: a.message,
          createdAt: a.createdAt.toISOString(),
        })),
        enableBudget: family.enableBudget ?? false,
      }

      await cacheManager.set(cacheKey, data, {
        ttl: CACHE_TTL,
        tags: [`family:${family.familyAccountId}`],
      })

      return NextResponse.json({ success: true, data })
    } catch (err) {
      return handleApiError(err, 'Failed to fetch budget information', 'ParentFinancialBudget')
    }
  },
  { role: 'PARENT' }
)
