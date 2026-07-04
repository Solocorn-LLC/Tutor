import { describe, it, expect } from 'vitest'
import { computeLessonUsage } from './lesson-usage'

/**
 * These cover the subtle part of the delete guard: a lesson edited in the
 * builder (a template lesson id) must be considered "in use" when material was
 * deployed against a *published copy* of it. Published copies get fresh ids at
 * publish time and correlate to the template lesson only by their `order`.
 */
describe('computeLessonUsage', () => {
  // Template lesson t2 (order 1) has two published copies: p2a and p2b.
  const family = [
    { lessonId: 't1', order: 0 },
    { lessonId: 't2', order: 1 },
    { lessonId: 't3', order: 2 },
    { lessonId: 'p2a', order: 1 }, // published copy of t2 (variant A)
    { lessonId: 'p2b', order: 1 }, // published copy of t2 (variant B)
    { lessonId: 'p1a', order: 0 }, // published copy of t1
  ]

  it('returns empty for no targets', () => {
    expect(computeLessonUsage([], family, ['p2a'])).toEqual({})
  })

  it('marks a lesson with no deployments as deletable', () => {
    const usage = computeLessonUsage(['t3'], family, ['p2a', 'p1a'])
    expect(usage.t3).toEqual({ lessonId: 't3', deployedCount: 0, hasDeployments: false })
  })

  it('blocks when material is deployed against the template id directly', () => {
    const usage = computeLessonUsage(['t2'], family, ['t2'])
    expect(usage.t2.hasDeployments).toBe(true)
    expect(usage.t2.deployedCount).toBe(1)
  })

  it('blocks when material is deployed against a published copy (order-correlated)', () => {
    // Deploy stamped the variant-A published lesson id, not the template id.
    const usage = computeLessonUsage(['t2'], family, ['p2a'])
    expect(usage.t2.hasDeployments).toBe(true)
    expect(usage.t2.deployedCount).toBe(1)
  })

  it('sums deployments across all correlated copies', () => {
    const usage = computeLessonUsage(['t2'], family, ['p2a', 'p2a', 'p2b'])
    expect(usage.t2.deployedCount).toBe(3)
  })

  it('does not count deployments from a different order', () => {
    // p1a is order 0; asking about t2 (order 1) must not pick it up.
    const usage = computeLessonUsage(['t2'], family, ['p1a'])
    expect(usage.t2).toEqual({ lessonId: 't2', deployedCount: 0, hasDeployments: false })
  })

  it('handles multiple targets independently', () => {
    const usage = computeLessonUsage(['t1', 't2', 't3'], family, ['p1a', 'p2b'])
    expect(usage.t1.hasDeployments).toBe(true) // via p1a (order 0)
    expect(usage.t2.hasDeployments).toBe(true) // via p2b (order 1)
    expect(usage.t3.hasDeployments).toBe(false)
  })

  it('ignores null/undefined deployed ids', () => {
    const usage = computeLessonUsage(['t2'], family, [null, undefined, 'p2a'])
    expect(usage.t2.deployedCount).toBe(1)
  })

  it('counts a target not present in the family only by its own id', () => {
    // A not-yet-persisted lesson id with no family order still matches direct deploys.
    const usage = computeLessonUsage(['brand-new'], family, ['brand-new'])
    expect(usage['brand-new'].hasDeployments).toBe(true)
  })
})
