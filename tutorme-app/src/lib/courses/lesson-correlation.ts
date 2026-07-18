/**
 * Correlate a (course-family) task's lesson onto a specific scoped course's lesson.
 *
 * The in-session deploy panel pulls the whole template↔published course family so
 * tasks authored under any variant are found, but template and published-variant
 * lessons don't share ids. A published lesson records the template lesson it was
 * copied from in `sourceLessonId`, so a template lesson and its published copies all
 * resolve to the same "root" (`sourceLessonId || id`). Order is a last-resort
 * fallback — and only for orders that identify exactly one lesson, since
 * `CourseLesson.order` has no unique constraint (a duplicate order would otherwise
 * mis-nest a task). When nothing correlates, the input lessonId is returned
 * unchanged (the client then shows it under "Other tasks").
 */

export interface ScopedLessonMeta {
  lessonId: string
  order: number | null
  sourceLessonId: string | null
}

export function buildScopedLessonResolver(lessons: ScopedLessonMeta[]) {
  const scopedIds = new Set(lessons.map(l => l.lessonId))
  const byRoot = new Map<string, string>()
  const byOrder = new Map<number, string>()
  const orderCount = new Map<number, number>()
  for (const l of lessons)
    if (typeof l.order === 'number') orderCount.set(l.order, (orderCount.get(l.order) ?? 0) + 1)
  for (const l of lessons) {
    byRoot.set(l.sourceLessonId || l.lessonId, l.lessonId)
    if (typeof l.order === 'number' && orderCount.get(l.order) === 1)
      byOrder.set(l.order, l.lessonId)
  }
  return (
    lessonId: string | null,
    sourceId: string | null,
    order: number | null
  ): string | null => {
    if (!lessonId) return null
    if (scopedIds.has(lessonId)) return lessonId // already a scoped lesson
    const root = sourceId || lessonId
    return (
      byRoot.get(root) ?? (typeof order === 'number' ? byOrder.get(order) : undefined) ?? lessonId // truly foreign — leave as-is (client shows it under "Other tasks")
    )
  }
}
