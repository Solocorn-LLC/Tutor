#!/usr/bin/env node
/**
 * Database migration script for production (no tsx required)
 * Usage: node scripts/migrate.js
 */
const path = require('node:path')
const fs = require('node:fs')
const { Pool } = require('pg')
const { drizzle } = require('drizzle-orm/node-postgres')
const { migrate } = require('drizzle-orm/node-postgres/migrator')

function writeTerminationMessage(message) {
  try {
    const filePath = '/dev/termination-log'
    const trimmed = String(message || '')
      .replace(/:\/\/([^:]+):([^@]+)@/g, '://***:***@')
      .slice(0, 3800)
    fs.writeFileSync(filePath, trimmed, { encoding: 'utf8' })
  } catch {}
}

async function runMigrations() {
  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or DIRECT_URL is required to run migrations')
  }

  const migrationsFolder = path.join(process.cwd(), 'drizzle')
  const pool = new Pool({ connectionString: databaseUrl, max: 1 })
  const db = drizzle(pool)

  console.log('[Migrations] Running migrations from:', migrationsFolder)
  console.log('[Migrations] Database:', databaseUrl.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@'))

  try {
    await migrate(db, { migrationsFolder })
    console.log('[Migrations] Completed successfully')
  } catch (error) {
    const message =
      error && error.stack ? error.stack : error && error.message ? error.message : error
    console.error('[Migrations] Failed:', message)
    if (error.cause) {
      const causeMessage = error.cause.stack || error.cause.message || error.cause
      console.error('[Migrations] Cause:', causeMessage)
    }
    writeTerminationMessage(`[Migrations] Failed\n${message}`)
    throw error
  } finally {
    await pool.end()
  }
}

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
