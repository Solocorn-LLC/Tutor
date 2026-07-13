/**
 * Defense-in-depth column projections for the 1-on-1 booking hot paths.
 *
 * The booking routes read a request via `db.query...findFirst`/`.returning()`,
 * which otherwise select EVERY mapped column. If any column is absent from the
 * database (schema drift — e.g. a migration that never reached prod), Postgres
 * throws "column does not exist" and the whole endpoint 500s. That is exactly
 * how the booking flow broke when the `rescheduleProposed*` columns (0070) were
 * missing in prod.
 *
 * Scoping the hot-path reads to only the STABLE columns they actually use makes
 * them immune to drift in unrelated (e.g. newly-added) columns. `tsc` guarantees
 * we never drop a column a route depends on: referencing an unselected field is
 * a compile error. The reschedule route is intentionally NOT scoped — it needs
 * the reschedule columns.
 */

import { oneOnOneBookingRequest } from '@/lib/db/schema'

/** For relational queries: `db.query.oneOnOneBookingRequest.findFirst({ columns: CORE_BOOKING_COLUMNS })`. */
export const CORE_BOOKING_COLUMNS = {
  requestId: true,
  tutorId: true,
  studentId: true,
  requestedDate: true,
  startTime: true,
  endTime: true,
  timezone: true,
  durationMinutes: true,
  costPerSession: true,
  status: true,
  tutorResponseAt: true,
  tutorNotes: true,
  studentNotes: true,
  seriesId: true,
  seriesIndex: true,
  paymentDueAt: true,
  paidAt: true,
  calendarEventId: true,
  createdAt: true,
  updatedAt: true,
} as const

/**
 * For UPDATE/INSERT: `.returning(CORE_BOOKING_RETURNING)`.
 *
 * Note the asymmetry: an UPDATE only names the columns in its `.set()`, so
 * `.returning(CORE_BOOKING_RETURNING)` makes the whole statement drift-safe. An
 * INSERT, however, always lists EVERY table column (Drizzle fills unset ones with
 * `default`), so a missing column still breaks the insert regardless of the
 * returning projection — the create path relies on the schema actually being
 * present (guaranteed by the journal fix + ENSURE_TABLES_SQL). We still scope the
 * returning so the API response shape matches the reads.
 */
export const CORE_BOOKING_RETURNING = {
  requestId: oneOnOneBookingRequest.requestId,
  tutorId: oneOnOneBookingRequest.tutorId,
  studentId: oneOnOneBookingRequest.studentId,
  requestedDate: oneOnOneBookingRequest.requestedDate,
  startTime: oneOnOneBookingRequest.startTime,
  endTime: oneOnOneBookingRequest.endTime,
  timezone: oneOnOneBookingRequest.timezone,
  durationMinutes: oneOnOneBookingRequest.durationMinutes,
  costPerSession: oneOnOneBookingRequest.costPerSession,
  status: oneOnOneBookingRequest.status,
  tutorResponseAt: oneOnOneBookingRequest.tutorResponseAt,
  tutorNotes: oneOnOneBookingRequest.tutorNotes,
  studentNotes: oneOnOneBookingRequest.studentNotes,
  seriesId: oneOnOneBookingRequest.seriesId,
  seriesIndex: oneOnOneBookingRequest.seriesIndex,
  paymentDueAt: oneOnOneBookingRequest.paymentDueAt,
  paidAt: oneOnOneBookingRequest.paidAt,
  calendarEventId: oneOnOneBookingRequest.calendarEventId,
  createdAt: oneOnOneBookingRequest.createdAt,
  updatedAt: oneOnOneBookingRequest.updatedAt,
} as const
