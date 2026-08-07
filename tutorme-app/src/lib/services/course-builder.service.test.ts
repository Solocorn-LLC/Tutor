import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CourseBuilderService } from './course-builder.service'
import { course, courseLesson } from '@/lib/db/schema'

interface LessonRow {
  id: string
  lessonId: string
  courseId: string
  title: string
  description: string | null
  duration: number
  order: number
  sourceLessonId: string | null
  builderData: Record<string, unknown>
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

interface CourseRow {
  id: string
  courseId: string
  name: string
  creatorId: string
  isPublished: boolean
}

const store = vi.hoisted(() => ({
  courses: [] as CourseRow[],
  lessons: [] as LessonRow[],
  reset() {
    this.courses = []
    this.lessons = []
  },
  getLiveLessons(courseId: string) {
    return this.lessons.filter(l => l.courseId === courseId && l.deletedAt === null)
  },
}))

vi.mock('@/lib/db/drizzle', () => ({
  drizzleDb: makeMockDb(),
}))

vi.mock('@/lib/storage/service', () => ({
  removeFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/storage/gcs', () => ({
  refreshDocumentUrls: vi.fn().mockImplementation(async (lessons: unknown[]) => lessons),
}))

vi.mock('@/lib/courses/lesson-usage', () => ({
  getLessonUsage: vi.fn().mockImplementation(async (_courseId: string, lessonIds: string[]) => {
    // No deployments by default; tests can override via the deployedLessonIds store.
    const record: Record<
      string,
      { lessonId: string; deployedCount: number; hasDeployments: boolean }
    > = {}
    for (const id of lessonIds) {
      record[id] = { lessonId: id, deployedCount: 0, hasDeployments: false }
    }
    return record
  }),
}))

function queryResult(rows: unknown[]) {
  const promise = Promise.resolve(rows)
  return {
    orderBy: () => promise,
    then: (onFulfilled?: any, onRejected?: any) => promise.then(onFulfilled, onRejected),
  }
}

function projectRows(columns: Record<string, any> | undefined, rows: unknown[]): unknown[] {
  if (!columns) return rows
  const mappings = Object.entries(columns).map(([alias, column]) => {
    const sourceKey = column?.name
    return { alias, sourceKey }
  })
  return rows.map(row => {
    const projected: Record<string, unknown> = {}
    for (const { alias, sourceKey } of mappings) {
      projected[alias] = sourceKey ? (row as Record<string, unknown>)[sourceKey] : undefined
    }
    return projected
  })
}

function makeMockDb() {
  return {
    select: (columns?: any) => ({
      from: (table: any) => ({
        where: (condition?: any) => {
          let rows: unknown[] = []
          if (table === course) {
            rows = store.courses
          } else if (table === courseLesson) {
            const courseId = extractCourseId(condition)
            rows = courseId
              ? store.getLiveLessons(courseId)
              : store.lessons.filter(l => l.deletedAt === null)
          }
          return queryResult(projectRows(columns, rows))
        },
        innerJoin: () => ({
          where: () => queryResult([]),
        }),
      }),
    }),
    update: (table: any) => ({
      set: (values: any) => ({
        where: async (condition: any) => {
          if (table === courseLesson) {
            const ids = extractLessonIds(condition)
            const target = ids.length > 0 ? ids : store.lessons.map(l => l.lessonId)
            for (const l of store.lessons) {
              if (target.includes(l.lessonId)) {
                Object.assign(l, values)
              }
            }
          }
          return undefined
        },
      }),
    }),
    insert: (table: any) => ({
      values: (row: any) => {
        if (table === courseLesson) {
          const existing = store.lessons.find(l => l.lessonId === row.lessonId)
          if (!existing) {
            store.lessons.push({
              ...row,
              deletedAt: row.deletedAt ?? null,
            })
          }
        }
        return {
          onConflictDoUpdate: async (opts: any) => {
            if (table !== courseLesson) return
            const setValues = opts.set as any
            const existing = store.lessons.find(l => l.lessonId === row.lessonId)
            if (existing) {
              Object.assign(existing, setValues)
            }
          },
        }
      },
    }),
    delete: (table: any) => ({
      where: async (condition: any) => {
        if (table === courseLesson) {
          const ids = extractLessonIds(condition)
          const target = ids.length > 0 ? ids : store.lessons.map(l => l.lessonId)
          store.lessons = store.lessons.filter(l => !target.includes(l.lessonId))
        }
      },
    }),
    transaction: async (fn: any) => {
      return fn(makeMockDb())
    },
  }
}

function collectStringParams(condition: any): string[] {
  const values: string[] = []
  const seen = new Set<unknown>()
  function walk(value: unknown) {
    if (typeof value === 'string') {
      values.push(value)
      return
    }
    if (!value || typeof value !== 'object') return
    if (seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
      value.forEach(walk)
    } else {
      if ('value' in value && typeof (value as any).value === 'string') {
        values.push((value as any).value)
      }
      Object.values(value).forEach(walk)
    }
  }
  walk(condition)
  return values
}

function extractCourseId(condition: any): string | null {
  if (!condition) return null
  const params = collectStringParams(condition)
  return params.find(v => store.courses.some(c => c.courseId === v)) ?? null
}

function extractLessonIds(condition: any): string[] {
  if (!condition) return []
  return collectStringParams(condition).filter(v => store.lessons.some(l => l.lessonId === v))
}

function seedCourse(courseId: string, tutorId: string, lessons: Partial<LessonRow>[] = []) {
  store.courses.push({
    id: courseId,
    courseId,
    name: 'Test Course',
    creatorId: tutorId,
    isPublished: true,
  })
  for (const [idx, les] of lessons.entries()) {
    const lessonId = les.lessonId ?? les.id ?? `lesson-${idx + 1}`
    store.lessons.push({
      id: lessonId,
      lessonId,
      courseId,
      title: les.title ?? `Lesson ${idx + 1}`,
      description: null,
      duration: 60,
      order: idx,
      sourceLessonId: les.sourceLessonId ?? null,
      builderData: les.builderData ?? {},
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...les,
    })
  }
}

describe('CourseBuilderService.updateCourseBuilderData', () => {
  beforeEach(() => {
    store.reset()
  })

  it('upserts a new lesson into a published course', async () => {
    const tutorId = 'tutor-1'
    const courseId = 'course-1'
    seedCourse(courseId, tutorId)

    await CourseBuilderService.updateCourseBuilderData(courseId, tutorId, [
      {
        id: 'lesson-1',
        title: 'Updated Lesson',
        homework: [{ id: 'hw-1', title: 'Assessment 1' }],
      },
    ])

    const live = store.getLiveLessons(courseId)
    expect(live).toHaveLength(1)
    expect((live[0].builderData as any).homework).toHaveLength(1)
  })

  it('preserves a deployed lesson that is missing from the incoming payload', async () => {
    const tutorId = 'tutor-1'
    const courseId = 'course-1'
    seedCourse(courseId, tutorId, [
      { lessonId: 'lesson-a', title: 'Existing' },
      { lessonId: 'lesson-b', title: 'Deployed' },
    ])

    // Simulate lesson-b being deployed.
    const { getLessonUsage } = await import('@/lib/courses/lesson-usage')
    vi.mocked(getLessonUsage).mockResolvedValueOnce({
      'lesson-b': { lessonId: 'lesson-b', deployedCount: 1, hasDeployments: true },
    })

    // Client only sends lesson-a (lesson-b was removed from the tree but is deployed).
    await CourseBuilderService.updateCourseBuilderData(courseId, tutorId, [
      { id: 'lesson-a', title: 'Kept' },
    ])

    const live = store.getLiveLessons(courseId)
    const ids = live.map(l => l.lessonId).sort()
    expect(ids).toEqual(['lesson-a', 'lesson-b'])
  })

  it('rejects an empty save for a course that already has lessons', async () => {
    const tutorId = 'tutor-1'
    const courseId = 'course-1'
    seedCourse(courseId, tutorId, [{ lessonId: 'lesson-a', title: 'Existing' }])

    await expect(
      CourseBuilderService.updateCourseBuilderData(courseId, tutorId, [])
    ).rejects.toThrow('EMPTY_LESSON_SAVE')
  })

  it('allows an empty save when explicitly allowed', async () => {
    const tutorId = 'tutor-1'
    const courseId = 'course-1'
    seedCourse(courseId, tutorId, [{ lessonId: 'lesson-a', title: 'Existing' }])

    await CourseBuilderService.updateCourseBuilderData(courseId, tutorId, [], { allowEmpty: true })

    const live = store.getLiveLessons(courseId)
    expect(live).toHaveLength(0)
  })
})

describe('CourseBuilderService.propagateLessonsToVariant', () => {
  beforeEach(() => {
    store.reset()
  })

  it('inserts a new source lesson into the target variant', async () => {
    const tutorId = 'tutor-1'
    // A template lesson that is itself the origin declares its own id as sourceLessonId
    // so sibling variants can correlate back to it on future propagations.
    seedCourse('tmpl-1', tutorId, [
      { lessonId: 'tmpl-l1', sourceLessonId: 'tmpl-l1', title: 'Template Lesson' },
    ])
    seedCourse('pub-1', tutorId, [])

    await CourseBuilderService.propagateLessonsToVariant('pub-1', tutorId, [
      { id: 'tmpl-l1', title: 'Template Lesson', homework: [{ id: 'hw-1' }] },
    ])

    const live = store.getLiveLessons('pub-1')
    expect(live).toHaveLength(1)
    expect(live[0].sourceLessonId).toBe('tmpl-l1')
  })

  it('preserves a deployed target lesson that no longer exists in the source', async () => {
    const tutorId = 'tutor-1'
    seedCourse('tmpl-1', tutorId, [{ lessonId: 'tmpl-l1', title: 'Template Lesson' }])
    seedCourse('pub-1', tutorId, [
      { lessonId: 'pub-l1', title: 'Variant Lesson', sourceLessonId: 'tmpl-l1' },
      { lessonId: 'pub-l2', title: 'Deployed Variant Lesson', sourceLessonId: 'tmpl-l2' },
    ])

    const { getLessonUsage } = await import('@/lib/courses/lesson-usage')
    vi.mocked(getLessonUsage).mockResolvedValueOnce({
      'pub-l2': { lessonId: 'pub-l2', deployedCount: 1, hasDeployments: true },
    })

    // Source now only has tmpl-l1.
    await CourseBuilderService.propagateLessonsToVariant('pub-1', tutorId, [
      { id: 'tmpl-l1', title: 'Template Lesson' },
    ])

    const live = store.getLiveLessons('pub-1')
    const ids = live.map(l => l.lessonId).sort()
    expect(ids).toEqual(['pub-l1', 'pub-l2'])
  })

  it('deletes a non-deployed target lesson that no longer exists in the source', async () => {
    const tutorId = 'tutor-1'
    seedCourse('tmpl-1', tutorId, [{ lessonId: 'tmpl-l1', title: 'Template Lesson' }])
    seedCourse('pub-1', tutorId, [
      { lessonId: 'pub-l1', title: 'Variant Lesson', sourceLessonId: 'tmpl-l1' },
      { lessonId: 'pub-l2', title: 'Orphan Lesson', sourceLessonId: 'tmpl-l2' },
    ])

    await CourseBuilderService.propagateLessonsToVariant('pub-1', tutorId, [
      { id: 'tmpl-l1', title: 'Template Lesson' },
    ])

    const live = store.getLiveLessons('pub-1')
    expect(live.map(l => l.lessonId)).toEqual(['pub-l1'])
  })
})
