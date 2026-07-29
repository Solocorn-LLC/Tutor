import { describe, it, expect } from 'vitest'
import { computeLessonUsage } from './lesson-usage'

/**
 * The delete guard blocks deletion of a lesson only when material was deployed
 * from that exact lesson id. A published copy of a lesson is a separate row
 * with its own id, so deployments from a published variant do not block
 * deletion of the corresponding template lesson.
 */
describe('computeLessonUsage', () => {
  it('returns empty for no targets', () => {
    expect(computeLessonUsage([], ['p2a'])).toEqual({})
  })

  it('marks a lesson with no deployments as deletable', () => {
    const usage = computeLessonUsage(['t3'], ['p2a', 'p1a'])
    expect(usage.t3).toEqual({ lessonId: 't3', deployedCount: 0, hasDeployments: false })
  })

  it('blocks when material is deployed against the exact lesson id', () => {
    const usage = computeLessonUsage(['t2'], ['t2'])
    expect(usage.t2.hasDeployments).toBe(true)
    expect(usage.t2.deployedCount).toBe(1)
  })

  it('does not block a template lesson when a different id is deployed', () => {
    // A published copy (p2a) is no longer considered the same as the template (t2).
    const usage = computeLessonUsage(['t2'], ['p2a'])
    expect(usage.t2.hasDeployments).toBe(false)
    expect(usage.t2.deployedCount).toBe(0)
  })

  it('sums multiple deployments against the same lesson id', () => {
    const usage = computeLessonUsage(['t2'], ['t2', 't2', 't2'])
    expect(usage.t2.deployedCount).toBe(3)
  })

  it('handles multiple targets independently', () => {
    const usage = computeLessonUsage(['t1', 't2', 't3'], ['t1', 't2'])
    expect(usage.t1.hasDeployments).toBe(true)
    expect(usage.t2.hasDeployments).toBe(true)
    expect(usage.t3.hasDeployments).toBe(false)
  })

  it('ignores null/undefined deployed ids', () => {
    const usage = computeLessonUsage(['t2'], [null, undefined, 't2'])
    expect(usage.t2.deployedCount).toBe(1)
  })

  it('counts a target id that only has direct deployments', () => {
    const usage = computeLessonUsage(['brand-new'], ['brand-new'])
    expect(usage['brand-new'].hasDeployments).toBe(true)
  })
})
