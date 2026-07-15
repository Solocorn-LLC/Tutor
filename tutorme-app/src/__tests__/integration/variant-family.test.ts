/**
 * Integration test: course variant-family expansion.
 *
 * Locks in the asymmetry the whole "template vs published" landmine depends on
 * (see [[tutorme-template-vs-published-course-ids]]):
 *  - a PUBLISHED id expands to {itself, its template} only — NOT sibling variants
 *    (so reads scoped by a published id never leak/admit other variants);
 *  - a TEMPLATE id fans out to {itself, ALL its published variants};
 *  - a standalone (non-variant) id resolves to just itself.
 * A regression here silently re-introduces the "wrongly excluded / wrongly
 * included" class the prevention guard (#1098) and the sweeps (#1089) fixed.
 *
 * Requires DATABASE_URL + a running, migrated Postgres (see setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import crypto from 'crypto'
import { inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, course, courseVariant } from '@/lib/db/schema'
import { expandToCourseFamily, expandFamilyWithMap } from '@/lib/courses/variant-family'

const stamp = Date.now()
const tutorId = crypto.randomUUID()
const T = `vf_tmpl_${stamp}`
const P1 = `vf_pub1_${stamp}`
const P2 = `vf_pub2_${stamp}`
const STANDALONE = `vf_solo_${stamp}`
const courseIds = [T, P1, P2, STANDALONE]
const variantIds = [`vf_v1_${stamp}`, `vf_v2_${stamp}`]

const sorted = (a: string[]) => [...a].sort()

describe('variant-family expansion', () => {
  beforeAll(async () => {
    await drizzleDb.insert(user).values({
      userId: tutorId,
      email: `vf-${stamp}@ex.com`,
      role: 'TUTOR',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)
    await drizzleDb.insert(course).values([
      { courseId: T, name: 'Template', isPublished: false, creatorId: tutorId },
      { courseId: P1, name: 'US variant', isPublished: true, creatorId: tutorId },
      { courseId: P2, name: 'UK variant', isPublished: true, creatorId: tutorId },
      { courseId: STANDALONE, name: 'Solo', isPublished: true, creatorId: tutorId },
    ] as never)
    // One template T with TWO published variants (P1, P2). STANDALONE has none.
    await drizzleDb.insert(courseVariant).values([
      {
        variantId: variantIds[0],
        templateCourseId: T,
        publishedCourseId: P1,
        nationality: 'US',
        category: `vf-cat-${stamp}`,
      },
      {
        variantId: variantIds[1],
        templateCourseId: T,
        publishedCourseId: P2,
        nationality: 'UK',
        category: `vf-cat-${stamp}`,
      },
    ] as never)
  })

  afterAll(async () => {
    await drizzleDb.delete(courseVariant).where(inArray(courseVariant.variantId, variantIds))
    await drizzleDb.delete(course).where(inArray(course.courseId, courseIds))
    await drizzleDb.delete(user).where(inArray(user.userId, [tutorId]))
  })

  it('a PUBLISHED id expands to {itself, template} only — never a sibling variant', async () => {
    expect(sorted(await expandToCourseFamily([P1]))).toEqual(sorted([P1, T]))
    expect(sorted(await expandToCourseFamily([P2]))).toEqual(sorted([P2, T]))
    // The safety property: P1's family must NOT contain the sibling P2.
    expect(await expandToCourseFamily([P1])).not.toContain(P2)
  })

  it('a TEMPLATE id fans out to {itself, ALL published variants}', async () => {
    expect(sorted(await expandToCourseFamily([T]))).toEqual(sorted([T, P1, P2]))
  })

  it('a standalone (non-variant) id resolves to just itself', async () => {
    expect(await expandToCourseFamily([STANDALONE])).toEqual([STANDALONE])
  })

  it('empty input yields empty output', async () => {
    expect(await expandToCourseFamily([])).toEqual([])
  })

  it('expandFamilyWithMap maps each family id back to the queried (enrolled) id', async () => {
    // Querying by the published P1: family {P1, T} both map back to P1.
    const { ids, toEnrolled } = await expandFamilyWithMap([P1])
    expect(sorted(ids)).toEqual(sorted([P1, T]))
    expect(toEnrolled.get(P1)).toBe(P1)
    expect(toEnrolled.get(T)).toBe(P1)
  })
})
