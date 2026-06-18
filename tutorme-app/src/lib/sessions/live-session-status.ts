import type { LiveSessionStatus } from '@/lib/db/schema/enums'

/**
 * Non-terminal ("open") LiveSession statuses — scheduled or in-progress sessions
 * that should still surface in calendars and upcoming-session lists.
 *
 * NOTE on the enum: the DB `LiveSessionStatus` enum also contains the legacy
 * values `preparing` | `live` | `paused`, which NO code path writes — the only
 * statuses ever set are `scheduled`, `active`, and `ended`. They are retained in
 * the enum (and here) for backward compatibility so any stray legacy rows still
 * surface. New code should only ever set `scheduled` | `active` | `ended`.
 *
 * Previously each route hardcoded its own (and subtly divergent) status array;
 * centralising it here keeps every "open sessions" query consistent.
 */
export const LIVE_SESSION_OPEN_STATUSES: LiveSessionStatus[] = [
  'scheduled',
  'active',
  'preparing',
  'live',
  'paused',
]
