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
import { logAdminAction, getClientIp } from '@/lib/admin/auth'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const ROLES = ['STUDENT', 'TUTOR', 'PARENT', 'ADMIN']
const CREATABLE_ROLES = ['STUDENT', 'TUTOR', 'PARENT']

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdmin(req, Permissions.USERS_READ)
  if (!session) return response!

  try {
    const url = new URL(req.url)
    const role = url.searchParams.get('role')?.toUpperCase() || undefined
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
        status: user.status,
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
      status: r.status,
      stats: { enrollments: enrByUser.get(r.id) || 0, sessions: sessByUser.get(r.id) || 0 },
      createdAt: r.createdAt,
    }))

    const totalPages = Math.max(1, Math.ceil(total / limit))
    return NextResponse.json({ users, pagination: { total, page, totalPages, limit } })
  } catch (error) {
    return handleApiError(error, 'Failed to fetch users', 'api/admin/users/route.ts')
  }
}

/**
 * POST /api/admin/users — create a new (non-admin) user account.
 * Body: { email, name, role: STUDENT|TUTOR|PARENT, password }
 */
export async function POST(req: NextRequest) {
  const { session, response } = await requireAdmin(req, Permissions.USERS_WRITE)
  if (!session) return response!

  try {
    const body = await req.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : ''
    const role = typeof body.role === 'string' ? body.role.toUpperCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }
    if (!CREATABLE_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Role must be STUDENT, TUTOR, or PARENT' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const [existing] = await drizzleDb
      .select({ id: user.userId })
      .from(user)
      .where(eq(user.email, email))
      .limit(1)
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const hashed = await bcrypt.hash(password, 10)
    const userId = crypto.randomUUID()
    const now = new Date()

    await drizzleDb.transaction(async tx => {
      await tx.insert(user).values({
        userId,
        email,
        password: hashed,
        role: role as 'STUDENT' | 'TUTOR' | 'PARENT',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      await tx.insert(profile).values({
        profileId: crypto.randomUUID(),
        userId,
        name: name || email.split('@')[0],
        timezone: 'UTC',
        createdAt: now,
        updatedAt: now,
      })
    })

    await logAdminAction(session.adminId, 'admin.user.create', {
      ipAddress: getClientIp(req),
      resourceType: 'user',
      resourceId: userId,
      metadata: { role },
    })

    return NextResponse.json(
      { success: true, user: { id: userId, email, name, role, status: 'active' } },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error, 'Failed to create user', 'api/admin/users/route.ts')
  }
}
