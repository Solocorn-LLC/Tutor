/**
 * GET /api/parent/financial/payments
 * Payment history with filtering and pagination
 */
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import { getFamilyAccountForParent } from '@/lib/api/parent-helpers'
import { fetchFamilyPayments } from '@/lib/financial/parent-financial-service'
import cacheManager from '@/lib/cache-manager'

const CACHE_TTL = 120
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export const GET = withAuth(
  async (req: NextRequest, session) => {
    try {
      const family = await getFamilyAccountForParent(session)
      if (!family) {
        return NextResponse.json({ error: 'No family account found' }, { status: 404 })
      }

      const { searchParams } = new URL(req.url)
      const studentId = searchParams.get('studentId') ?? undefined
      const limit = Math.min(
        parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
        MAX_LIMIT
      )
      const status = searchParams.get('status') ?? undefined
      const type = searchParams.get('type') as 'course' | 'clinic' | 'budget' | undefined

      const cacheKey = `parent:financial:payments:${family.familyAccountId}:${studentId ?? 'all'}:${limit}:${status ?? 'all'}:${type ?? 'all'}`
      const cached = await cacheManager.get<object>(cacheKey)
      if (cached) return NextResponse.json({ success: true, data: cached })

      let payments = await fetchFamilyPayments(family, { studentId })

      if (status) {
        payments = payments.filter(p => p.status.toLowerCase().includes(status.toLowerCase()))
      }
      if (type) {
        payments = payments.filter(p => p.type === type)
      }

      const paginated = payments.slice(0, limit)
      const formatted = paginated.map(p => ({
        id: p.id,
        type: p.type,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        paidAt: p.paidAt?.toISOString(),
        description: p.description,
        studentName: p.studentName,
      }))

      const totalSpent = payments
        .filter(p => ['COMPLETED', 'completed', 'paid'].includes(p.status))
        .reduce((s, p) => s + p.amount, 0)

      const data = {
        payments: formatted,
        totalCount: payments.length,
        totalSpent: Math.round(totalSpent * 100) / 100,
        currency: family.defaultCurrency,
      }

      await cacheManager.set(cacheKey, data, {
        ttl: CACHE_TTL,
        tags: [`family:${family.familyAccountId}`],
      })

      return NextResponse.json({ success: true, data })
    } catch (err) {
      return handleApiError(err, 'Failed to fetch payment records', 'ParentFinancialPayments')
    }
  },
  { role: 'PARENT' }
)
