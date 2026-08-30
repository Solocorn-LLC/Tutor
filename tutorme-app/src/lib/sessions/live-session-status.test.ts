import { describe, it, expect } from 'vitest'
import { getSessionUiState, UI_LIVE_LEAD_MS } from './live-session-status'

describe('getSessionUiState', () => {
  const scheduledAt = new Date('2026-09-01T12:00:00.000Z')
  const beforeWindow = scheduledAt.getTime() - UI_LIVE_LEAD_MS - 60_000
  const inWindow = scheduledAt.getTime() - UI_LIVE_LEAD_MS + 60_000
  const afterStart = scheduledAt.getTime() + 60_000

  it('treats scheduled sessions before the pre-start window as scheduled', () => {
    const ui = getSessionUiState({ status: 'scheduled', scheduledAt }, beforeWindow)
    expect(ui.isUiLive).toBe(false)
    expect(ui.isJoinOpen).toBe(false)
    expect(ui.uiStatusLabel).toBe('Scheduled')
  })

  it('treats scheduled sessions inside the pre-start window as starting soon', () => {
    const ui = getSessionUiState({ status: 'scheduled', scheduledAt }, inWindow)
    expect(ui.isUiLive).toBe(true)
    expect(ui.isJoinOpen).toBe(true)
    expect(ui.uiStatusLabel).toBe('Starting soon')
  })

  it('treats scheduled sessions after the start time as live', () => {
    const ui = getSessionUiState({ status: 'scheduled', scheduledAt }, afterStart)
    expect(ui.isUiLive).toBe(true)
    expect(ui.isJoinOpen).toBe(true)
    expect(ui.uiStatusLabel).toBe('Live')
  })

  it('treats active/live/preparing/paused as live', () => {
    for (const status of ['active', 'live', 'preparing', 'paused']) {
      const ui = getSessionUiState({ status, scheduledAt }, beforeWindow)
      expect(ui.isUiLive).toBe(true)
      expect(ui.isJoinOpen).toBe(true)
      expect(ui.uiStatusLabel).toBe('Live')
    }
  })

  it('treats ended sessions as ended regardless of time', () => {
    const ui = getSessionUiState({ status: 'ended', scheduledAt }, afterStart)
    expect(ui.isUiLive).toBe(false)
    expect(ui.isJoinOpen).toBe(false)
    expect(ui.uiStatusLabel).toBe('Ended')
  })

  it('treats demo/ad-hoc sessions as always live', () => {
    for (const sessionType of ['GO_LIVE_DEMO', 'ADHOC']) {
      const ui = getSessionUiState({ status: 'active', sessionType }, beforeWindow)
      expect(ui.isUiLive).toBe(true)
      expect(ui.isJoinOpen).toBe(true)
      expect(ui.uiStatusLabel).toBe('Live')
    }
  })

  it('defaults missing status to scheduled', () => {
    const ui = getSessionUiState({ scheduledAt }, beforeWindow)
    expect(ui.uiStatusLabel).toBe('Scheduled')
  })
})
