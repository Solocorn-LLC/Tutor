import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { builderTaskDmi, builderTaskDmiVersion } from '@/lib/db/schema'

/**
 * Regression guard for the BuilderTaskDmi / BuilderTaskDmiVersion column drift
 * (PR #1186). The prod columns (migration 0020) are literally `dmiId` / `versionId`,
 * but the schema had mapped both to `text('id')`, so every drizzle-generated INSERT
 * referenced a non-existent `"id"` column and silently threw — answer-key
 * persistence, DMI materialization and versioning were all broken with 0 rows.
 *
 * CI builds the test DB from the schema via `drizzle-kit push`, so it can't catch a
 * schema-vs-prod-column drift; this asserts the mapping directly instead.
 */
describe('BuilderTaskDmi column mapping (guards the #1186 drift fix)', () => {
  it('BuilderTaskDmi primary key maps to the prod column "dmiId", not "id"', () => {
    const pk = getTableConfig(builderTaskDmi).columns.find(c => c.primary)
    expect(pk?.name).toBe('dmiId')
  })

  it('BuilderTaskDmiVersion primary key maps to the prod column "versionId", not "id"', () => {
    const pk = getTableConfig(builderTaskDmiVersion).columns.find(c => c.primary)
    expect(pk?.name).toBe('versionId')
  })
})
