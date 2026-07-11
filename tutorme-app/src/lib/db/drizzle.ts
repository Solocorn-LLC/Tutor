/**
 * Drizzle ORM client (primary).
 * Use this for all new code and runtime queries.
 */
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const connectionString =
  process.env.DATABASE_POOL_URL || process.env.DIRECT_URL || process.env.DATABASE_URL

// Singleton pool for server (avoid many connections in dev)
const globalForDrizzle = globalThis as unknown as {
  drizzlePool: Pool | undefined
  drizzleDb?: NodePgDatabase<typeof schema>
}

export function getPool(): Pool {
  if (!connectionString) {
    throw new Error(
      'Missing database URL. Set DATABASE_URL, DIRECT_URL, or DATABASE_POOL_URL in .env or .env.local'
    )
  }

  // Reuse the cached pool in ALL environments. This must be cached in production
  // too: any code path that calls getPool() directly (not via the memoized
  // getDrizzleDb) would otherwise construct a brand-new Pool — each up to `max`
  // connections — on every call, exhausting Postgres/PgBouncer under load.
  if (globalForDrizzle.drizzlePool) {
    return globalForDrizzle.drizzlePool
  }

  const isPgBouncer = connectionString.includes('pgbouncer') || process.env.PGBOUNCER === 'true'
  const pool = new Pool({
    connectionString,
    max: process.env.NODE_ENV === 'production' ? 50 : 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: true,
    ...(isPgBouncer && { prepare: false }),
  })

  // An idle client can emit 'error' (e.g. DB restart, network blip). Without a
  // listener, pg re-emits it as an uncaught exception that crashes the process —
  // a single transient blip would take down the whole instance under load.
  pool.on('error', err => {
    console.error('[db] idle pool client error:', err.message)
  })

  globalForDrizzle.drizzlePool = pool
  return pool
}

export function getDrizzleDb(): NodePgDatabase<typeof schema> {
  if (!globalForDrizzle.drizzleDb) {
    globalForDrizzle.drizzleDb = drizzle(getPool(), { schema })
  }
  return globalForDrizzle.drizzleDb
}

/**
 * Drizzle DB client with schema (for relational queries).
 * Import as: import { drizzleDb } from '@/lib/db'
 * Lazy initialization - only connects when first used
 */
export const drizzleDb = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    return getDrizzleDb()[prop as keyof NodePgDatabase<typeof schema>]
  },
})

export type DrizzleDb = typeof drizzleDb
