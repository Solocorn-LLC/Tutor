import { describe, it, expect } from 'vitest'
import { getSessionUiState } from './live-session-status'

describe('getSessionUiState', () => {
  const scheduledAt = new Date('2026-09-01T12:00:00.000Z')
  const beforeStart = scheduledAt.getTime() - 60 * 60 * 1000
  const afterStart = scheduledAt.getTime() + 60_000
  const tutorJoinedAt = new Date('2026-09-01T11:55:00.000Z')

  it('treats scheduled sessions without a tutor join as scheduled', () => {
    const ui = getSessionUiState({ status: 'scheduled', scheduledAt }, beforeStart)
    expect(ui.isUiLive).toBe(false)
    expect(ui.isJoinOpen).toBe(false)
    expect(ui.uiStatusLabel).toBe('Scheduled')
    expect(ui.tutorHasJoined).toBe(false)
  })

  it('still treats scheduled sessions as scheduled even after start time if tutor has not joined', () => {
    const ui = getSessionUiState({ status: 'scheduled', scheduledAt }, afterStart)
    expect(ui.isUiLive).toBe(false)
    expect(ui.isJoinOpen).toBe(false)
    expect(ui.uiStatusLabel).toBe('Scheduled')
    expect(ui.tutorHasJoined).toBe(false)
  })

  it('treats scheduled sessions with a tutor join as scheduled (scheduler promotes to active at start time)', () => {
    const ui = getSessionUiState({ status: 'scheduled', scheduledAt, tutorJoinedAt }, beforeStart)
    expect(ui.isUiLive).toBe(false)
    expect(ui.isJoinOpen).toBe(false)
    expect(ui.uiStatusLabel).toBe('Scheduled')
    expect(ui.tutorHasJoined).toBe(true)
  })

  it('treats active/live/preparing/paused as live', () => {
    for (const status of ['active', 'live', 'preparing', 'paused']) {
      const ui = getSessionUiState({ status, scheduledAt }, beforeStart)
      expect(ui.isUiLive).toBe(true)
      expect(ui.isJoinOpen).toBe(true)
      expect(ui.uiStatusLabel).toBe('Live')
      expect(ui.tutorHasJoined).toBe(false)
    }
  })

  it('treats ended sessions as ended regardless of time', () => {
    const ui = getSessionUiState({ status: 'ended', scheduledAt }, afterStart)
    expect(ui.isUiLive).toBe(false)
    expect(ui.isJoinOpen).toBe(false)
    expect(ui.uiStatusLabel).toBe('Ended')
    expect(ui.tutorHasJoined).toBe(false)
  })

  it('treats demo/ad-hoc sessions as always live', () => {
    for (const sessionType of ['GO_LIVE_DEMO', 'ADHOC']) {
      const ui = getSessionUiState({ status: 'active', sessionType }, beforeStart)
      expect(ui.isUiLive).toBe(true)
      expect(ui.isJoinOpen).toBe(true)
      expect(ui.uiStatusLabel).toBe('Live')
    }
  })

  it('defaults missing status to scheduled', () => {
    const ui = getSessionUiState({ scheduledAt }, beforeStart)
    expect(ui.uiStatusLabel).toBe('Scheduled')
    expect(ui.tutorHasJoined).toBe(false)
  })
})
