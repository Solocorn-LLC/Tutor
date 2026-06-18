#!/usr/bin/env node
/**
 * One-off: recreate Daily.co rooms for live sessions that were created while
 * DAILY_API_KEY was missing (their roomUrl is a fake https://mock.daily.co/...
 * that can't be joined).
 *
 * For each non-ended LiveSession with a mock room URL, this creates a real Daily
 * room (mirroring lib/video/daily-provider.ts createRoom config) and updates the
 * row's roomId + roomUrl. Idempotent: only touches rows whose roomUrl is a mock.
 *
 * Usage (from tutorme-app/):
 *   DATABASE_URL=...  DAILY_API_KEY=...  node scripts/recreate-mock-daily-rooms.js            # dry run (lists, no changes)
 *   DATABASE_URL=...  DAILY_API_KEY=...  node scripts/recreate-mock-daily-rooms.js --apply    # recreate + update
 *
 * (DIRECT_URL is used if set, falling back to DATABASE_URL.)
 */
const { Pool } = require('pg')

const DAILY_API_URL = 'https://api.daily.co/v1'

async function createRealRoom(apiKey, sessionId, durationMinutes, maxStudents) {
  const roomName = `tutorme-${sessionId}-${Date.now()}`
  // Match daily-provider.ts: 60-min buffer beyond the session duration.
  const effectiveDuration = (Number(durationMinutes) || 240) + 60
  const exp = Math.floor((Date.now() + effectiveDuration * 60 * 1000) / 1000)

  const res = await fetch(`${DAILY_API_URL}/rooms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: roomName,
      privacy: 'public',
      properties: {
        max_participants: Number(maxStudents) || 10,
        enable_screenshare: true,
        enable_chat: false,
        exp,
        start_audio_off: true,
        start_video_off: true,
        enable_recording: 'cloud',
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`Daily API ${res.status}: ${await res.text()}`)
  }
  const room = await res.json()
  return { id: room.name, url: room.url }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL
  const apiKey = process.env.DAILY_API_KEY

  if (!dbUrl) throw new Error('DATABASE_URL (or DIRECT_URL) is required')
  if (!apiKey) throw new Error('DAILY_API_KEY is required')

  const pool = new Pool({ connectionString: dbUrl, max: 1 })
  try {
    const { rows } = await pool.query(
      `SELECT id, title, status, "durationMinutes", "maxStudents", "roomUrl"
         FROM "LiveSession"
        WHERE "roomUrl" LIKE 'https://mock.daily.co/%'
          AND status <> 'ended'
        ORDER BY "scheduledAt" NULLS LAST`
    )

    console.log(`Found ${rows.length} non-ended session(s) with mock Daily room URLs.`)
    rows.forEach(r => console.log(`  - ${r.id}  [${r.status}]  ${r.title || '(untitled)'}`))

    if (!apply) {
      console.log('\nDry run — re-run with --apply to recreate these rooms.')
      return
    }

    let ok = 0
    let fail = 0
    for (const r of rows) {
      try {
        const room = await createRealRoom(apiKey, r.id, r.durationMinutes, r.maxStudents)
        await pool.query('UPDATE "LiveSession" SET "roomId" = $1, "roomUrl" = $2 WHERE id = $3', [
          room.id,
          room.url,
          r.id,
        ])
        console.log(`  ✓ ${r.id} -> ${room.url}`)
        ok++
      } catch (e) {
        console.error(`  ✗ ${r.id}: ${e.message}`)
        fail++
      }
    }
    console.log(`\nDone: ${ok} recreated, ${fail} failed.`)
  } finally {
    await pool.end()
  }
}

main().catch(e => {
  console.error('recreate-mock-daily-rooms failed:', e.message)
  process.exit(1)
})
