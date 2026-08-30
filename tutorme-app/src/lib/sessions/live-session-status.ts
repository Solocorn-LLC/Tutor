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

/**
 * How far ahead of scheduledAt the UI should treat a session as "Live" and show
 * the Join button. This is UI-only; the backend status remains scheduled until
 * the actual start time.
 */
export const UI_LIVE_LEAD_MS = 10 * 60 * 1000

export interface SessionUiStateInput {
  status?: LiveSessionStatus | string | null | undefined
  scheduledAt?: Date | string | number | null
  sessionType?: string | null
}

export interface SessionUiState {
  /** True when the session is effectively live from the user's point of view. */
  isUiLive: boolean
  /** True when the session card should switch from Enter → Join. */
  isJoinOpen: boolean
  /** Stable label to render on cards/badges. */
  uiStatusLabel: 'Live' | 'Scheduled' | 'Ended' | 'Starting soon'
}

/**
 * Compute the user-facing live state for a session.
 *
 * Backend statuses drive the truth: ended sessions are always ended. Active/live
 * sessions are always live. Scheduled sessions become UI-live once we enter the
 * pre-start window (UI_LIVE_LEAD_MS before scheduledAt).
 *
 * Demo / ad-hoc sessions are created active and are therefore always live.
 */
export function getSessionUiState(
  input: SessionUiStateInput,
  nowMs: number = Date.now()
): SessionUiState {
  const status = (input.status ?? 'scheduled').toLowerCase()
  const isDemoLike = input.sessionType === 'GO_LIVE_DEMO' || input.sessionType === 'ADHOC'

  if (status === 'ended') {
    return { isUiLive: false, isJoinOpen: false, uiStatusLabel: 'Ended' }
  }

  if (status === 'active' || status === 'live' || status === 'preparing' || status === 'paused') {
    return { isUiLive: true, isJoinOpen: true, uiStatusLabel: 'Live' }
  }

  const scheduledAtMs = input.scheduledAt ? new Date(input.scheduledAt).getTime() : 0
  const inPreWindow = scheduledAtMs > 0 && nowMs >= scheduledAtMs - UI_LIVE_LEAD_MS
  const hasStarted = scheduledAtMs > 0 && nowMs >= scheduledAtMs

  if (isDemoLike) {
    return { isUiLive: true, isJoinOpen: true, uiStatusLabel: 'Live' }
  }

  if (inPreWindow) {
    return {
      isUiLive: true,
      isJoinOpen: true,
      uiStatusLabel: hasStarted ? 'Live' : 'Starting soon',
    }
  }

  return { isUiLive: false, isJoinOpen: false, uiStatusLabel: 'Scheduled' }
}
