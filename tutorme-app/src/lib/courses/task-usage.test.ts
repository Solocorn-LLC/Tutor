import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeTaskUsage, getTaskUsage } from './task-usage'

const mockGroupBy = vi.fn()
const mockWhere = vi.fn(() => ({ groupBy: mockGroupBy }))
const mockInnerJoin2 = vi.fn(() => ({ where: mockWhere }))
const mockInnerJoin1 = vi.fn(() => ({ innerJoin: mockInnerJoin2 }))
const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin1 }))
const mockSelect = vi.fn(() => ({ from: mockFrom }))

vi.mock('@/lib/db/drizzle', () => ({
  drizzleDb: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}))

describe('computeTaskUsage', () => {
  it('returns empty for no targets', () => {
    expect(computeTaskUsage([], [{ itemId: 'x', courseId: 'c1', count: 1 }])).toEqual({})
  })

  it('marks an item with no deployments as editable', () => {
    const usage = computeTaskUsage(['task-1'], [])
    expect(usage['task-1']).toEqual({
      itemId: 'task-1',
      deployedCount: 0,
      hasDeployments: false,
      lockedCourseIds: [],
    })
  })

  it('blocks an item deployed in a published course', () => {
    const usage = computeTaskUsage(
      ['task-1'],
      [{ itemId: 'task-1', courseId: 'course-a', count: 1 }]
    )
    expect(usage['task-1'].hasDeployments).toBe(true)
    expect(usage['task-1'].deployedCount).toBe(1)
    expect(usage['task-1'].lockedCourseIds).toEqual(['course-a'])
  })

  it('sums deployments across multiple published courses', () => {
    const usage = computeTaskUsage(
      ['task-1'],
      [
        { itemId: 'task-1', courseId: 'course-a', count: 2 },
        { itemId: 'task-1', courseId: 'course-b', count: 3 },
      ]
    )
    expect(usage['task-1'].deployedCount).toBe(5)
    expect(usage['task-1'].lockedCourseIds).toEqual(['course-a', 'course-b'])
  })

  it('handles multiple targets independently', () => {
    const usage = computeTaskUsage(
      ['task-1', 'task-2', 'task-3'],
      [{ itemId: 'task-1', courseId: 'course-a', count: 1 }]
    )
    expect(usage['task-1'].hasDeployments).toBe(true)
    expect(usage['task-2'].hasDeployments).toBe(false)
    expect(usage['task-3'].hasDeployments).toBe(false)
  })

  it('ignores null/undefined ids', () => {
    const usage = computeTaskUsage(
      ['task-1'],
      [
        { itemId: null, courseId: 'course-a', count: 1 },
        { itemId: 'task-1', courseId: 'course-a', count: 1 },
      ]
    )
    expect(usage['task-1'].deployedCount).toBe(1)
  })
})

describe('getTaskUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function setQueryResult(
    rows: Array<{ itemId: string | null; courseId: string | null; count: number }>
  ) {
    mockGroupBy.mockResolvedValue(rows)
  }

  it('returns empty when no item ids are provided', async () => {
    const result = await getTaskUsage([])
    expect(result).toEqual({})
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('marks an item editable when no real published deployments exist', async () => {
    setQueryResult([])
    const result = await getTaskUsage(['task-1'])
    expect(result['task-1']).toEqual({
      itemId: 'task-1',
      deployedCount: 0,
      hasDeployments: false,
      lockedCourseIds: [],
    })
    expect(mockWhere).toHaveBeenCalled()
  })

  it('blocks an item deployed in a published course', async () => {
    setQueryResult([{ itemId: 'task-1', courseId: 'course-a', count: 1 }])
    const result = await getTaskUsage(['task-1'])
    expect(result['task-1']).toEqual({
      itemId: 'task-1',
      deployedCount: 1,
      hasDeployments: true,
      lockedCourseIds: ['course-a'],
    })
  })
})
