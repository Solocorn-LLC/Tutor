import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { Permissions } from '@/lib/admin/permissions'

export const GET = async (req: NextRequest) => {
  const auth = await requireAdmin(req, Permissions.PAYMENTS_READ)
  if (!auth.session) return auth.response!
  return NextResponse.json({ payments: [] })
}
