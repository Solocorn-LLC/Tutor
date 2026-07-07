/**
 * Parent-managed availability for a child/student.
 *
 * A parent sets their child's weekly availability here (students no longer
 * control their own). Data is stored in the SAME StudentAvailability table
 * keyed by the child's studentId, so every downstream consumer that reads a
 * student's availability by studentId sees the parent-managed value.
 *
 *  GET    -> { availability: [...], exceptions: [...] }  (seeds 8am–9pm defaults on first read)
 *  POST   -> upsert one weekly slot { dayOfWeek, startTime, endTime, timezone, isAvailable }
 *  DELETE -> remove one slot { id }
 *
 * Authorization: PARENT role AND the studentId must belong to the parent's
 * family account (getFamilyAccountForParent → studentIds).
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import crypto from 'crypto'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { getFamilyAccountForParent } from '@/lib/api/parent-helpers'
import { drizzleDb } from '@/lib/db/drizzle'
import { studentAvailability, studentAvailabilityException } from '@/lib/db/schema'
import { defaultStudentAvailabilitySlots } from '@/lib/student-availability-defaults'

export const dynamic = 'force-dynamic'

/**
 * Resolve the target studentId from the route and confirm the signed-in parent
 * owns that child. Returns the studentId, or a NextResponse to return early.
 */
async function resolveOwnedStudentId(
  session: Parameters<Parameters<typeof withAuth>[0]>[1],
  context: { params?: Promise<Record<string, string | string[]>> } | undefined
): Promise<{ studentId: string } | { error: NextResponse }> {
  const studentId = await getParamAsync(context?.params, 'studentId')
  if (!studentId) {
    return { error: NextResponse.json({ error: 'Student ID required' }, { status: 400 }) }
  }
  const family = await getFamilyAccountForParent(session)
  if (!family) {
    return { error: NextResponse.json({ error: 'No family account found' }, { status: 404 }) }
  }
  if (!family.studentIds.includes(studentId)) {
    return {
      error: NextResponse.json({ error: 'Not authorized for this student' }, { status: 403 }),
    }
  }
  return { studentId }
}

export const GET = withAuth(
  async (_req: NextRequest, session, context) => {
    const resolved = await resolveOwnedStudentId(session, context)
    if ('error' in resolved) return resolved.error
    const { studentId } = resolved

    let availability = await drizzleDb
      .select()
      .from(studentAvailability)
      .where(eq(studentAvailability.studentId, studentId))

    // First time: seed the default (8am–9pm free, every day) so the parent
    // starts from a sensible baseline. Idempotent.
    if (availability.length === 0) {
      const now = new Date()
      await drizzleDb
        .insert(studentAvailability)
        .values(
          defaultStudentAvailabilitySlots().map(s => ({
            availabilityId: crypto.randomUUID(),
            studentId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            timezone: 'UTC',
            isAvailable: true,
            createdAt: now,
            updatedAt: now,
          }))
        )
        .onConflictDoNothing({
          target: [
            studentAvailability.studentId,
            studentAvailability.dayOfWeek,
            studentAvailability.startTime,
            studentAvailability.endTime,
          ],
        })
      availability = await drizzleDb
        .select()
        .from(studentAvailability)
        .where(eq(studentAvailability.studentId, studentId))
    }

    const exceptions = await drizzleDb
      .select()
      .from(studentAvailabilityException)
      .where(eq(studentAvailabilityException.studentId, studentId))

    return NextResponse.json({ availability, exceptions })
  },
  { role: 'PARENT' }
)

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const resolved = await resolveOwnedStudentId(session, context)
      if ('error' in resolved) return resolved.error
      const { studentId } = resolved

      const body = await req.json().catch(() => null)
      const dayOfWeek = Number(body?.dayOfWeek)
      const startTime = typeof body?.startTime === 'string' ? body.startTime : ''
      const endTime = typeof body?.endTime === 'string' ? body.endTime : ''
      const timezone = typeof body?.timezone === 'string' && body.timezone ? body.timezone : 'UTC'
      const isAvailable = body?.isAvailable !== false

      if (
        !Number.isInteger(dayOfWeek) ||
        dayOfWeek < 0 ||
        dayOfWeek > 6 ||
        !startTime ||
        !endTime
      ) {
        return NextResponse.json({ error: 'Invalid availability slot' }, { status: 400 })
      }

      const now = new Date()
      await drizzleDb
        .insert(studentAvailability)
        .values({
          availabilityId: crypto.randomUUID(),
          studentId,
          dayOfWeek,
          startTime,
          endTime,
          timezone,
          isAvailable,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            studentAvailability.studentId,
            studentAvailability.dayOfWeek,
            studentAvailability.startTime,
            studentAvailability.endTime,
          ],
          set: { isAvailable, timezone, updatedAt: now },
        })

      return NextResponse.json({ success: true })
    },
    { role: 'PARENT' }
  )
)

export const DELETE = withCsrf(
  withAuth(
    async (req: NextRequest, session, context) => {
      const resolved = await resolveOwnedStudentId(session, context)
      if ('error' in resolved) return resolved.error
      const { studentId } = resolved

      const body = await req.json().catch(() => null)
      const id = typeof body?.id === 'string' ? body.id : ''
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
      await drizzleDb
        .delete(studentAvailability)
        .where(
          and(
            eq(studentAvailability.availabilityId, id),
            eq(studentAvailability.studentId, studentId)
          )
        )
      return NextResponse.json({ success: true })
    },
    { role: 'PARENT' }
  )
)
