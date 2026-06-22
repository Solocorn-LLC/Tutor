#!/usr/bin/env node
/**
 * Database migration script for production (no tsx required)
 * Usage: node scripts/migrate.js
 *
 * Resilient to transient connection errors. Neon (serverless Postgres) can drop
 * the connection during cold-start / auto-suspend scale-up — e.g.
 * "terminating connection due to administrator command" on the first query.
 * That is NOT a migration failure, so we retry the whole (idempotent) migrate
 * with backoff on connection-level errors, while failing fast on real SQL errors
 * (syntax, constraint, missing relation, etc.) which retrying could never fix.
 */
const path = require('node:path')
const fs = require('node:fs')
const { Pool } = require('pg')
const { drizzle } = require('drizzle-orm/node-postgres')
const { migrate } = require('drizzle-orm/node-postgres/migrator')

const MAX_ATTEMPTS = 5

// Substrings (lowercased) and SQLSTATE codes that indicate a transient
// connection problem worth retrying — not a deterministic SQL error.
const TRANSIENT_MESSAGES = [
  'terminating connection due to administrator command',
  'connection terminated',
  'connection terminated unexpectedly',
  'server closed the connection unexpectedly',
  'connection reset by peer',
  'econnreset',
  'etimedout',
  'econnrefused',
  'enotfound',
  'eai_again',
  'client has encountered a connection error',
  'timeout exceeded when trying to connect',
  'connection timeout',
  'could not connect',
  'sorry, too many clients already',
]
// 57P01 admin_shutdown, 08xxx connection exceptions, 53300 too_many_connections.
const TRANSIENT_CODES = new Set(['57P01', '08000', '08003', '08006', '08001', '08004', '53300'])

function isTransient(error) {
  if (!error) return false
  const codes = [error.code, error.cause && error.cause.code].filter(Boolean)
  if (codes.some(c => TRANSIENT_CODES.has(String(c)))) return true
  const text = [error.message, error.cause && error.cause.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return TRANSIENT_MESSAGES.some(m => text.includes(m))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function logError(error) {
  const message =
    error && error.stack ? error.stack : error && error.message ? error.message : error
  console.error('[Migrations] Failed:', message)
  if (error && error.cause) {
    const causeMessage = error.cause.stack || error.cause.message || error.cause
    console.error('[Migrations] Cause:', causeMessage)
  }
}

function writeTerminationMessage(message) {
  try {
    const filePath = '/dev/termination-log'
    const trimmed = String(message || '')
      .replace(/:\/\/([^:]+):([^@]+)@/g, '://***:***@')
      .slice(0, 3800)
    fs.writeFileSync(filePath, trimmed, { encoding: 'utf8' })
  } catch {}
}

/**
 * Run migrate once with a FRESH pool — a pool whose connection was killed can be
 * left in a bad state, so each attempt gets a clean one. migrate() is idempotent
 * (already-applied migrations are skipped, and a migration interrupted by a
 * dropped connection is rolled back by Postgres), so re-running is safe.
 */
async function attemptOnce(databaseUrl, migrationsFolder) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    // Wait for Neon to wake from cold start instead of failing instantly.
    connectionTimeoutMillis: 30000,
  })
  try {
    const db = drizzle(pool)
    await migrate(db, { migrationsFolder })
  } finally {
    await pool.end().catch(() => {})
  }
}

async function runMigrations() {
  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or DIRECT_URL is required to run migrations')
  }

  const migrationsFolder = path.join(process.cwd(), 'drizzle')
  console.log('[Migrations] Running migrations from:', migrationsFolder)
  console.log('[Migrations] Database:', databaseUrl.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@'))

  let lastError
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`[Migrations] Attempt ${attempt}/${MAX_ATTEMPTS}...`)
      await attemptOnce(databaseUrl, migrationsFolder)
      console.log('[Migrations] Completed successfully')
      return
    } catch (error) {
      lastError = error
      logError(error)

      const transient = isTransient(error)
      if (attempt < MAX_ATTEMPTS && transient) {
        // Exponential backoff with jitter: ~2s, 4s, 8s, 16s (capped).
        const delayMs = Math.min(16000, 2000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 500)
        console.warn(
          `[Migrations] Transient connection error — retrying in ${Math.round(delayMs / 1000)}s ` +
            `(attempt ${attempt + 1}/${MAX_ATTEMPTS})...`
        )
        await sleep(delayMs)
        continue
      }

      const message =
        error && error.stack ? error.stack : error && error.message ? error.message : error
      writeTerminationMessage(
        `[Migrations] Failed${transient ? ' (exhausted retries)' : ''}\n${message}`
      )
      throw error
    }
  }
  throw lastError
}

// Allow importing { isTransient } in tests without running migrations.
module.exports = { isTransient, runMigrations }

if (require.main === module) {
  runMigrations()
    .then(() => {
      process.exit(0)
    })
    .catch(error => {
      const message =
        error && error.stack ? error.stack : error && error.message ? error.message : error
      console.error('[Migrations] Fatal error:', message)
      writeTerminationMessage(`[Migrations] Fatal error\n${message}`)
      process.exit(1)
    })
}
