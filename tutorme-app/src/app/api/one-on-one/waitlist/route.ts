/**
 * 1-on-1 waitlist.
 *
 * GET  ?tutorId=…  → { onWaitlist } for a student.
 *      (no tutorId, as a tutor) → { entries: [...] } — who's waiting on you.
 * POST { tutorId, note? } → student joins a tutor's waitlist.
 * DELETE ?tutorId=…       → student leaves.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { and, eq, desc } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { drizzleDb } from '@/lib/db/drizzle'
import { oneOnOneWaitlist, user, profile } from '@/lib/db/schema'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tutorId = new URL(req.url).searchParams.get('tutorId')

  // Tutor viewing their own waitlist.
  if (!tutorId && session.user.role === 'TUTOR') {
    const entries = await drizzleDb
      .select({
        studentId: oneOnOneWaitlist.studentId,
        note: oneOnOneWaitlist.note,
        createdAt: oneOnOneWaitlist.createdAt,
        studentName: profile.name,
      })
      .from(oneOnOneWaitlist)
      .leftJoin(profile, eq(profile.userId, oneOnOneWaitlist.studentId))
      .where(eq(oneOnOneWaitlist.tutorId, session.user.id))
      .orderBy(desc(oneOnOneWaitlist.createdAt))
    return NextResponse.json({ entries })
  }

  if (!tutorId) return NextResponse.json({ error: 'tutorId required' }, { status: 400 })
  const [row] = await drizzleDb
    .select({ id: oneOnOneWaitlist.waitlistId })
    .from(oneOnOneWaitlist)
    .where(
      and(eq(oneOnOneWaitlist.tutorId, tutorId), eq(oneOnOneWaitlist.studentId, session.user.id))
    )
    .limit(1)
  return NextResponse.json({ onWaitlist: !!row })
}

const postSchema = z.object({ tutorId: z.string().min(1), note: z.string().max(500).optional() })

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions, req)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Only students can join a waitlist' }, { status: 403 })
    }

    const { tutorId, note } = postSchema.parse(await req.json())
    if (tutorId === session.user.id) {
      return NextResponse.json({ error: 'Invalid tutor' }, { status: 400 })
    }

    const [tutor] = await drizzleDb
      .select({ enabled: profile.oneOnOneEnabled })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.userId))
      .where(eq(user.userId, tutorId))
      .limit(1)
    if (!tutor) return NextResponse.json({ error: 'Tutor not found' }, { status: 404 })
    if (tutor.enabled === false) {
      return NextResponse.json(
        { error: 'This tutor is not offering 1-on-1 sessions' },
        { status: 400 }
      )
    }

    await drizzleDb
      .insert(oneOnOneWaitlist)
      .values({ waitlistId: nanoid(), tutorId, studentId: session.user.id, note: note ?? null })
      .onConflictDoNothing()

    return NextResponse.json({ success: true, onWaitlist: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    console.error('waitlist join failed:', err)
    return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions, req)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tutorId = new URL(req.url).searchParams.get('tutorId')
  if (!tutorId) return NextResponse.json({ error: 'tutorId required' }, { status: 400 })

  await drizzleDb
    .delete(oneOnOneWaitlist)
    .where(
      and(eq(oneOnOneWaitlist.tutorId, tutorId), eq(oneOnOneWaitlist.studentId, session.user.id))
    )
  return NextResponse.json({ success: true, onWaitlist: false })
}
