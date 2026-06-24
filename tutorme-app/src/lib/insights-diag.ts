/**
 * TEMPORARY render-trace for diagnosing the insights-route React #185 loop.
 * Records the last N render snapshots into a window-global ring buffer so the
 * error boundary can display them on-screen. Remove once the loop is fixed.
 */

interface DiagWindow {
  __diagSeq?: number
  __INSIGHTS_DIAG__?: Array<Record<string, unknown>>
}

export function recordDiag(entry: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as DiagWindow
  w.__diagSeq = (w.__diagSeq ?? 0) + 1
  if (!w.__INSIGHTS_DIAG__) w.__INSIGHTS_DIAG__ = []
  w.__INSIGHTS_DIAG__.push({ seq: w.__diagSeq, ...entry })
  if (w.__INSIGHTS_DIAG__.length > 60) w.__INSIGHTS_DIAG__.shift()
}

export function getDiag(): Array<Record<string, unknown>> {
  if (typeof window === 'undefined') return []
  return (window as unknown as DiagWindow).__INSIGHTS_DIAG__ ?? []
}
