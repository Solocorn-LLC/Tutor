/**
 * GET /api/admin/users
 * Paginated user directory for the admin Users page + dashboard.
 * Filters: role, search (email/name), page, limit.
 */
import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { requireAdmin } from '@/lib/admin/auth'
import { Permissions } from '@/lib/admin/permissions'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  user,
  profile,
  adminAssignment,
  adminRole,
  courseEnrollment,
  sessionParticipant,
  liveSession,
} from '@/lib/db/schema'
import { and, eq, ilike, or, inArray, sql, desc } from 'drizzle-orm'

const ROLES = ['STUDENT', 'TUTOR', 'PARENT', 'ADMIN']

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdmin(req, Permissions.USERS_READ)
  if (!session) return response!

  try {
    const url = new URL(req.url)
    const role = url.searchParams.get('role') || undefined
    const search = url.searchParams.get('search')?.trim() || undefined
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20)
    )
    const offset = (page - 1) * limit

    const filters = []
    if (role && ROLES.includes(role)) filters.push(sql`${user.role}::text = ${role}`)
    if (search) {
      filters.push(or(ilike(user.email, `%${search}%`), ilike(profile.name, `%${search}%`)))
    }
    const whereClause = filters.length ? and(...filters) : undefined

    const [{ count: total }] = await drizzleDb
      .select({ count: sql<number>`count(*)::int` })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.userId))
      .where(whereClause)

    const rows = await drizzleDb
      .select({
        id: user.userId,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        name: profile.name,
      })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.userId))
      .where(whereClause)
      .orderBy(desc(user.createdAt))
      .limit(limit)
      .offset(offset)

    const ids = rows.map(r => r.id)

    // Active admin role names per user
    const adminRows = ids.length
      ? await drizzleDb
          .select({ userId: adminAssignment.userId, name: adminRole.name })
          .from(adminAssignment)
          .innerJoin(adminRole, eq(adminRole.roleId, adminAssignment.roleId))
          .where(and(inArray(adminAssignment.userId, ids), eq(adminAssignment.isActive, true)))
      : []
    const adminByUser = new Map<string, string[]>()
    for (const a of adminRows) {
      const list = adminByUser.get(a.userId) || []
      list.push(a.name)
      adminByUser.set(a.userId, list)
    }

    // Lightweight per-user activity counts (batched, no N+1)
    const enr = ids.length
      ? await drizzleDb
          .select({ studentId: courseEnrollment.studentId, c: sql<number>`count(*)::int` })
          .from(courseEnrollment)
          .where(inArray(courseEnrollment.studentId, ids))
          .groupBy(courseEnrollment.studentId)
      : []
    const enrByUser = new Map(enr.map(e => [e.studentId, e.c]))

    const partic = ids.length
      ? await drizzleDb
          .select({ studentId: sessionParticipant.studentId, c: sql<number>`count(*)::int` })
          .from(sessionParticipant)
          .where(inArray(sessionParticipant.studentId, ids))
          .groupBy(sessionParticipant.studentId)
      : []
    const tutorSess = ids.length
      ? await drizzleDb
          .select({ tutorId: liveSession.tutorId, c: sql<number>`count(*)::int` })
          .from(liveSession)
          .where(inArray(liveSession.tutorId, ids))
          .groupBy(liveSession.tutorId)
      : []
    const sessByUser = new Map<string, number>()
    for (const p of partic) sessByUser.set(p.studentId, (sessByUser.get(p.studentId) || 0) + p.c)
    for (const t of tutorSess) sessByUser.set(t.tutorId, (sessByUser.get(t.tutorId) || 0) + t.c)

    const users = rows.map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      adminRoles: adminByUser.get(r.id) || [],
      isVerified: r.emailVerified != null,
      stats: { enrollments: enrByUser.get(r.id) || 0, sessions: sessByUser.get(r.id) || 0 },
      createdAt: r.createdAt,
    }))

    const totalPages = Math.max(1, Math.ceil(total / limit))
    return NextResponse.json({ users, pagination: { total, page, totalPages, limit } })
  } catch (error) {
    return handleApiError(error, 'Failed to fetch users', 'api/admin/users/route.ts')
  }
}
