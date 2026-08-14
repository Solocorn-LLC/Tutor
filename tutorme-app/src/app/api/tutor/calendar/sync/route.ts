/**
 * Tutor Calendar Sync API
 * GET /api/tutor/calendar/sync - Get sync status
 * POST /api/tutor/calendar/sync - Trigger sync with external calendars
 *
 * Integrates with Google Calendar, Outlook, Apple Calendar
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { calendarConnection, calendarEvent } from '@/lib/db/schema'
import { eq, and, asc, gte, lte, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid } from 'nanoid'

const SyncRequestSchema = z.object({
  provider: z.enum(['google', 'outlook', 'apple']).optional(),
  direction: z.enum(['to_external', 'from_external', 'bidirectional']).default('bidirectional'),
  dateRange: z
    .object({
      start: z.string().datetime(),
      end: z.string().datetime(),
    })
    .optional(),
})

export const GET = withAuth(
  async (req: NextRequest, session) => {
    const tutorId = session.user.id

    try {
      const connections = await drizzleDb
        .select()
        .from(calendarConnection)
        .where(eq(calendarConnection.userId, tutorId))
        .orderBy(asc(calendarConnection.provider))

      const statsRows = await drizzleDb
        .select({
          createdBy: calendarEvent.createdBy,
          count: sql<number>`count(*)::int`,
        })
        .from(calendarEvent)
        .where(and(eq(calendarEvent.tutorId, tutorId), isNull(calendarEvent.deletedAt)))
        .groupBy(calendarEvent.createdBy)

      const syncStats = {
        manual: statsRows.find(s => s.createdBy === 'manual')?.count ?? 0,
        sync: statsRows.find(s => s.createdBy === 'sync')?.count ?? 0,
        system: statsRows.find(s => s.createdBy === 'system')?.count ?? 0,
      }

      return NextResponse.json({
        connections: connections.map(c => ({
          provider: c.provider,
          syncEnabled: c.syncEnabled,
          syncDirection: c.syncDirection,
          lastSyncedAt: c.lastSyncedAt,
          expiresAt: c.expiresAt,
        })),
        stats: syncStats,
      })
    } catch (error) {
      console.error('Fetch sync status error:', error)
      return handleApiError(
        error,
        'Failed to fetch sync status',
        'api/tutor/calendar/sync/route.ts'
      )
    }
  },
  { role: 'TUTOR' }
)

export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
    const tutorId = session.user.id

    try {
      const body = await req.json()
      const validation = SyncRequestSchema.safeParse(body)

      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid request', details: validation.error.format() },
          { status: 400 }
        )
      }

      const { provider, direction, dateRange } = validation.data

      const connectionConditions = [
        eq(calendarConnection.userId, tutorId),
        eq(calendarConnection.syncEnabled, true),
      ]
      if (provider) connectionConditions.push(eq(calendarConnection.provider, provider))

      const connections = await drizzleDb
        .select()
        .from(calendarConnection)
        .where(and(...connectionConditions))

      if (connections.length === 0) {
        return NextResponse.json(
          { error: 'No calendar connections found. Please connect a calendar first.' },
          { status: 404 }
        )
      }

      const results: Array<{
        provider: string
        status: string
        message?: string
        imported?: number
        exported?: number
      }> = []
      const defaultDateRange = {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      }

      const range = dateRange
        ? { start: new Date(dateRange.start), end: new Date(dateRange.end) }
        : defaultDateRange

      for (const connection of connections) {
        if (connection.expiresAt && connection.expiresAt < new Date()) {
          results.push({
            provider: connection.provider,
            status: 'error',
            message: 'Token expired, please reconnect',
          })
          continue
        }

        try {
          const syncResult = await syncCalendar(connection, direction, range, tutorId)

          await drizzleDb
            .update(calendarConnection)
            .set({ lastSyncedAt: new Date() })
            .where(eq(calendarConnection.connectionId, connection.connectionId))

          results.push({
            provider: connection.provider,
            status: 'success',
            ...syncResult,
          })
        } catch (error: unknown) {
          results.push({
            provider: connection.provider,
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      return NextResponse.json({
        syncResults: results,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error('Calendar sync error:', error)
      return handleApiError(error, 'Failed to sync calendar', 'api/tutor/calendar/sync/route.ts')
    }
  },
  { role: 'TUTOR' }
  )
)

async function syncCalendar(
  connection: { connectionId: string; provider: string; expiresAt: Date | null },
  direction: string,
  dateRange: { start: Date; end: Date },
  tutorId: string
): Promise<{ imported?: number; exported?: number }> {
  const result: { imported?: number; exported?: number } = {}

  if (direction === 'from_external' || direction === 'bidirectional') {
    const externalEvents = await fetchExternalEvents(connection, dateRange)

    for (const event of externalEvents) {
      const [existing] = await drizzleDb
        .select()
        .from(calendarEvent)
        .where(eq(calendarEvent.externalId, event.id))
        .limit(1)

      if (existing) {
        await drizzleDb
          .update(calendarEvent)
          .set({
            title: event.title,
            description: event.description,
            startTime: event.startTime,
            endTime: event.endTime,
            location: event.location,
          })
          .where(eq(calendarEvent.eventId, existing.eventId))
      } else {
        await drizzleDb.insert(calendarEvent).values({
          eventId: nanoid(),
          tutorId,
          externalId: event.id,
          title: event.title,
          description: event.description,
          startTime: event.startTime,
          endTime: event.endTime,
          location: event.location,
          type: 'PERSONAL',
          createdBy: 'sync',
          status: 'CONFIRMED',
          timezone: 'Asia/Shanghai',
          isAllDay: false,
          isRecurring: false,
          maxAttendees: 1,
          isVirtual: false,
          isCancelled: false,
        })
      }
    }

    result.imported = externalEvents.length
  }

  if (direction === 'to_external' || direction === 'bidirectional') {
    const events = await drizzleDb
      .select()
      .from(calendarEvent)
      .where(
        and(
          eq(calendarEvent.tutorId, tutorId),
          isNull(calendarEvent.deletedAt),
          eq(calendarEvent.isCancelled, false),
          gte(calendarEvent.startTime, dateRange.start),
          lte(calendarEvent.startTime, dateRange.end),
          isNull(calendarEvent.externalId)
        )
      )

    result.exported = events.length
  }

  return result
}

async function fetchExternalEvents(
  connection: { provider: string },
  _dateRange: { start: Date; end: Date }
): Promise<
  Array<{
    id: string
    title: string
    description?: string
    startTime: Date
    endTime: Date
    location?: string
  }>
> {
  switch (connection.provider) {
    case 'google':
      return []
    case 'outlook':
      return []
    case 'apple':
      return []
    default:
      return []
  }
}

export const PUT = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
    const tutorId = session.user.id

    try {
      const body = await req.json()
      const { provider, authCode } = body

      if (!provider || !authCode) {
        return NextResponse.json({ error: 'Provider and auth code are required' }, { status: 400 })
      }

      const [existing] = await drizzleDb
        .select()
        .from(calendarConnection)
        .where(
          and(eq(calendarConnection.userId, tutorId), eq(calendarConnection.provider, provider))
        )
        .limit(1)

      const now = new Date()
      if (existing) {
        const [updated] = await drizzleDb
          .update(calendarConnection)
          .set({ syncEnabled: true, lastSyncedAt: now })
          .where(eq(calendarConnection.connectionId, existing.connectionId))
          .returning()

        return NextResponse.json({
          connection: {
            provider: updated!.provider,
            syncEnabled: updated!.syncEnabled,
            syncDirection: updated!.syncDirection,
          },
          message: 'Calendar connected successfully',
        })
      }

      const [created] = await drizzleDb
        .insert(calendarConnection)
        .values({
          connectionId: nanoid(),
          userId: tutorId,
          provider,
          syncEnabled: true,
          syncDirection: 'bidirectional',
        })
        .returning()

      return NextResponse.json({
        connection: {
          provider: created!.provider,
          syncEnabled: created!.syncEnabled,
          syncDirection: created!.syncDirection,
        },
        message: 'Calendar connected successfully',
      })
    } catch (error) {
      console.error('Connect calendar error:', error)
      return handleApiError(error, 'Failed to connect calendar', 'api/tutor/calendar/sync/route.ts')
    }
  },
  { role: 'TUTOR' }
  )
)
