/**
 * Calendar Export API
 * GET /api/tutor/calendar/export
 *
 * Export calendar events in iCal format (.ics)
 * Can be used to subscribe to calendar in external apps
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, handleApiError } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import { calendarEvent, user, profile } from '@/lib/db/schema'
import { eq, and, or, gte, lte, asc, isNull } from 'drizzle-orm'

function generateICalEvent(event: any): string {
  const formatDate = (date: Date, allDay: boolean = false) => {
    if (allDay) {
      return date.toISOString().split('T')[0].replace(/-/g, '')
    }
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  }

  const escapeICal = (str: string) => {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
  }

  let ical = 'BEGIN:VEVENT\r\n'
  ical += `UID:${event.id}@tutorme.com\r\n`
  ical += `DTSTAMP:${formatDate(new Date())}\r\n`

  if (event.isAllDay) {
    ical += `DTSTART;VALUE=DATE:${formatDate(event.startTime, true)}\r\n`
    ical += `DTEND;VALUE=DATE:${formatDate(event.endTime, true)}\r\n`
  } else {
    ical += `DTSTART:${formatDate(event.startTime)}\r\n`
    ical += `DTEND:${formatDate(event.endTime)}\r\n`
  }

  ical += `SUMMARY:${escapeICal(event.title)}\r\n`

  if (event.description) {
    ical += `DESCRIPTION:${escapeICal(event.description)}\r\n`
  }

  if (event.location) {
    ical += `LOCATION:${escapeICal(event.location)}\r\n`
  }

  if (event.meetingUrl) {
    ical += `URL:${event.meetingUrl}\r\n`
  }

  // Add recurrence rule
  if (event.recurrenceRule) {
    ical += `RRULE:${event.recurrenceRule}\r\n`
  }

  // Add attendees
  const attendees = event.attendees || []
  for (const attendee of attendees) {
    const status =
      attendee.status === 'accepted'
        ? 'ACCEPTED'
        : attendee.status === 'declined'
          ? 'DECLINED'
          : 'NEEDS-ACTION'
    ical += `ATTENDEE;PARTSTAT=${status}:mailto:${attendee.email}\r\n`
  }

  // Add reminders
  const reminders = event.reminders || []
  if (reminders.length > 0) {
    ical += 'BEGIN:VALARM\r\n'
    ical += 'ACTION:DISPLAY\r\n'
    ical += `DESCRIPTION:Reminder for ${escapeICal(event.title)}\r\n`
    ical += `TRIGGER:-PT${reminders[0].minutes}M\r\n`
    ical += 'END:VALARM\r\n'
  }

  // Status
  if (event.status === 'CANCELLED' || event.isCancelled) {
    ical += 'STATUS:CANCELLED\r\n'
  } else if (event.status === 'TENTATIVE') {
    ical += 'STATUS:TENTATIVE\r\n'
  } else {
    ical += 'STATUS:CONFIRMED\r\n'
  }

  ical += 'END:VEVENT\r\n'

  return ical
}

export const GET = withAuth(
  async (req: NextRequest, session) => {
    const tutorId = session.user.id
    const { searchParams } = new URL(req.url)

    const start = searchParams.get('start')
    const end = searchParams.get('end')
    const type = searchParams.get('type')

    try {
      // Default to 30 days past and 90 days future
      const defaultStart = new Date()
      defaultStart.setDate(defaultStart.getDate() - 30)

      const defaultEnd = new Date()
      defaultEnd.setDate(defaultEnd.getDate() + 90)

      const startDate = start ? new Date(start) : defaultStart
      const endDate = end ? new Date(end) : defaultEnd

      const eventConditions = [
        eq(calendarEvent.tutorId, tutorId),
        isNull(calendarEvent.deletedAt),
        or(
          and(gte(calendarEvent.startTime, startDate), lte(calendarEvent.startTime, endDate)),
          and(gte(calendarEvent.endTime, startDate), lte(calendarEvent.endTime, endDate)),
          and(lte(calendarEvent.startTime, startDate), gte(calendarEvent.endTime, endDate))
        ),
      ]
      if (type)
        eventConditions.push(
          eq(
            calendarEvent.type,
            type as 'LESSON' | 'CLINIC' | 'CONSULTATION' | 'BREAK' | 'PERSONAL' | 'OTHER'
          )
        )

      const events = await drizzleDb
        .select()
        .from(calendarEvent)
        .where(and(...eventConditions))
        .orderBy(asc(calendarEvent.startTime))

      const [tutorRow] = await drizzleDb
        .select({ profileName: profile.name })
        .from(user)
        .leftJoin(profile, eq(user.userId, profile.userId))
        .where(eq(user.userId, tutorId))
        .limit(1)

      const tutorName = tutorRow?.profileName || 'Tutor'

      // Generate iCal content
      let ical = 'BEGIN:VCALENDAR\r\n'
      ical += 'VERSION:2.0\r\n'
      ical += 'PRODID:-//Solocorn//Tutor Calendar//EN\r\n'
      ical += `X-WR-CALNAME:${tutorName}'s Calendar\r\n`
      ical += 'X-WR-TIMEZONE:Asia/Shanghai\r\n'
      ical += 'CALSCALE:GREGORIAN\r\n'
      ical += 'METHOD:PUBLISH\r\n'

      for (const event of events) {
        ical += generateICalEvent(event)
      }

      ical += 'END:VCALENDAR\r\n'

      return new NextResponse(ical, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="tutor-calendar-${tutorId}.ics"`,
        },
      })
    } catch (error) {
      console.error('Export calendar error:', error)
      return handleApiError(
        error,
        'Failed to export calendar',
        'api/tutor/calendar/export/route.ts'
      )
    }
  },
  { role: 'TUTOR' }
)

// Public feed endpoint (for sharing calendar via URL)
export const POST = withCsrf(
  withAuth(
    async (req: NextRequest, session) => {
      const tutorId = session.user.id

      try {
        const body = await req.json()
        const { enabled, publicAccess = 'limited' } = body

        // Generate or revoke public feed URL
        // In production, store this in the database
        const feedToken = enabled
          ? Buffer.from(`${tutorId}-${Date.now()}-${Math.random()}`)
              .toString('base64')
              .replace(/[^a-zA-Z0-9]/g, '')
          : null

        // TODO: Store feed token in database

        return NextResponse.json({
          enabled: !!feedToken,
          feedUrl: feedToken
            ? `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/public/${feedToken}`
            : null,
          publicAccess,
        })
      } catch (error) {
        console.error('Calendar feed error:', error)
        return handleApiError(
          error,
          'Failed to manage calendar feed',
          'api/tutor/calendar/export/route.ts'
        )
      }
    },
    { role: 'TUTOR' }
  )
)
