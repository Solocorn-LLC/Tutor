/**
 * GET /api/tutor/calendar/recommendations?sessionId=xxx
 * Returns recommended alternative time slots for a session based on tutor availability.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { liveSession, calendarAvailability, calendarException, calendarEvent } from '@/lib/db/schema'
import { eq, and, gte, lte } from 'drizzle-orm'

export const GET = withAuth(
  async (req: NextRequest, session) => {
    const tutorId = session.user.id
    const { searchParams } = new URL(req.url)
    const sessionIdParam = searchParams.get('sessionId')

    if (!sessionIdParam) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    const [ls] = await drizzleDb
      .select()
      .from(liveSession)
      .where(and(eq(liveSession.sessionId, sessionIdParam), eq(liveSession.tutorId, tutorId)))
      .limit(1)

    if (!ls) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (!ls.scheduledAt) {
      return NextResponse.json({ error: 'Session has no scheduled time' }, { status: 400 })
    }

    const originalStart = new Date(ls.scheduledAt)
    const durationMinutes = ls.durationMinutes || 60
    const originalTimeStr = originalStart.toISOString().split('T')[1].slice(0, 5)
    const originalDayOfWeek = originalStart.getDay()
    const count = 3

    const recommendations: Array<{ date: string; startTime: string; endTime: string }> = []

    // Query tutor availability for the same day of week
    const availabilityRows = await drizzleDb
      .select()
      .from(calendarAvailability)
      .where(
        and(
          eq(calendarAvailability.tutorId, tutorId),
          eq(calendarAvailability.dayOfWeek, originalDayOfWeek),
          eq(calendarAvailability.isAvailable, true)
        )
      )

    if (availabilityRows.length === 0) {
      return NextResponse.json({ recommendations: [] })
    }

    const availableRanges = availabilityRows.map(a => ({ start: a.startTime, end: a.endTime }))

    // Search +/- 14 days from original date
    const searchStart = new Date(originalStart)
    searchStart.setDate(searchStart.getDate() - 7)
    const searchEnd = new Date(originalStart)
    searchEnd.setDate(searchEnd.getDate() + 14)

    // Query exceptions in range
    const exceptions = await drizzleDb
      .select()
      .from(calendarException)
      .where(
        and(
          eq(calendarException.tutorId, tutorId),
          gte(calendarException.date, searchStart),
          lte(calendarException.date, searchEnd)
        )
      )

    // Query existing events in range
    const existingEvents = await drizzleDb
      .select({ startTime: calendarEvent.startTime, endTime: calendarEvent.endTime })
      .from(calendarEvent)
      .where(
        and(
          eq(calendarEvent.tutorId, tutorId),
          eq(calendarEvent.isCancelled, false),
          gte(calendarEvent.startTime, searchStart),
          lte(calendarEvent.startTime, searchEnd)
        )
      )

    const cursor = new Date(originalStart)
    cursor.setDate(cursor.getDate() - 7)

    while (cursor <= searchEnd && recommendations.length < count) {
      if (cursor.getTime() === originalStart.getTime()) {
        cursor.setDate(cursor.getDate() + 1)
        continue
      }

      const dateStr = cursor.toISOString().split('T')[0]
      const dayOfWeek = cursor.getDay()

      if (dayOfWeek !== originalDayOfWeek) {
        cursor.setDate(cursor.getDate() + 1)
        continue
      }

      const dayException = exceptions.find(
        e => e.date.toISOString().split('T')[0] === dateStr
      )
      if (dayException && !dayException.isAvailable) {
        cursor.setDate(cursor.getDate() + 1)
        continue
      }

      const slotStart = new Date(`${dateStr}T${originalTimeStr}`)
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000)

      if (slotEnd <= new Date()) {
        cursor.setDate(cursor.getDate() + 1)
        continue
      }

      const timeInRange = availableRanges.some(
        r => originalTimeStr >= r.start && originalTimeStr < r.end
      )
      if (!timeInRange) {
        cursor.setDate(cursor.getDate() + 1)
        continue
      }

      const timeException = exceptions.find(e => {
        if (e.date.toISOString().split('T')[0] !== dateStr) return false
        if (!e.startTime || !e.endTime) return false
        const exStart = new Date(`${dateStr}T${e.startTime}`)
        const exEnd = new Date(`${dateStr}T${e.endTime}`)
        return slotStart < exEnd && slotEnd > exStart
      })
      if (timeException) {
        cursor.setDate(cursor.getDate() + 1)
        continue
      }

      const hasConflict = existingEvents.some(
        (ev: any) => slotStart < ev.endTime && slotEnd > ev.startTime
      )
      if (!hasConflict) {
        const endTimeStr = new Date(slotStart.getTime() + durationMinutes * 60000)
          .toISOString()
          .split('T')[1]
          .slice(0, 5)
        recommendations.push({
          date: dateStr,
          startTime: originalTimeStr,
          endTime: endTimeStr,
        })
      }

      cursor.setDate(cursor.getDate() + 1)
    }

    return NextResponse.json({ recommendations })
  },
  { role: 'TUTOR' }
)
