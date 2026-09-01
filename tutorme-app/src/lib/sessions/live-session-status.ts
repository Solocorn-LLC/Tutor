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

export interface SessionUiStateInput {
  status?: LiveSessionStatus | string | null | undefined
  scheduledAt?: Date | string | number | null
  sessionType?: string | null
  /** True when the tutor has actually joined the classroom. Used for payment gating. */
  tutorJoinedAt?: Date | string | number | null
}

export interface SessionUiState {
  /** True when the session is effectively live from the user's point of view. */
  isUiLive: boolean
  /** True when the session card should switch from Enter → Join. */
  isJoinOpen: boolean
  /** Stable label to render on cards/badges. */
  uiStatusLabel: 'Live' | 'Scheduled' | 'Ended'
  /** True when the tutor has actually joined; useful for payment processing. */
  tutorHasJoined: boolean
}

/**
 * Compute the user-facing live state for a session.
 *
 * Backend statuses drive the truth: ended sessions are always ended. A session is
 * only considered live when its backend status is active/live/preparing/paused
 * AND its scheduled start time has arrived. Demo / ad-hoc sessions are created
 * active and bypass the scheduledAt gate.
 */
export function getSessionUiState(
  input: SessionUiStateInput,
  nowMs: number = Date.now()
): SessionUiState {
  const status = (input.status ?? 'scheduled').toLowerCase()
  const isDemoLike = input.sessionType === 'GO_LIVE_DEMO' || input.sessionType === 'ADHOC'
  const tutorHasJoined = !!input.tutorJoinedAt && new Date(input.tutorJoinedAt).getTime() > 0

  if (status === 'ended') {
    return { isUiLive: false, isJoinOpen: false, uiStatusLabel: 'Ended', tutorHasJoined }
  }

  const hasStarted =
    isDemoLike || !input.scheduledAt || new Date(input.scheduledAt).getTime() <= nowMs

  if (
    hasStarted &&
    (status === 'active' || status === 'live' || status === 'preparing' || status === 'paused')
  ) {
    return { isUiLive: true, isJoinOpen: true, uiStatusLabel: 'Live', tutorHasJoined }
  }

  return {
    isUiLive: false,
    isJoinOpen: false,
    uiStatusLabel: 'Scheduled',
    tutorHasJoined,
  }
}
