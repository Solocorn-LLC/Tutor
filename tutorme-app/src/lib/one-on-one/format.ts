/** Format the time remaining until `toMs` (measured from `now`) as `H:MM:SS`
 *  (when an hour or more away) or `MM:SS`. Never negative — clamps to `0:00`. */
export function formatCountdown(toMs: number, now: number): string {
  const s = Math.max(0, Math.round((toMs - now) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}
