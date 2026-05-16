import { eq, inArray, desc } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  contentProgress,
  contentItem,
  courseEnrollment,
  course,
  courseLesson,
  courseLessonProgress,
  courseProgress,
  taskSubmission,
  builderTask,
} from '@/lib/db/schema'
import { ProgressItem, ProgressItemType } from './types'

export type ProgressFilter = {
  type?: ProgressItemType
}

export async function fetchVideoProgress(studentId: string): Promise<ProgressItem[]> {
  const rows = await drizzleDb
    .select({
      progressId: contentProgress.progressId,
      contentId: contentProgress.contentId,
      progress: contentProgress.progress,
      completed: contentProgress.completed,
      lastPosition: contentProgress.lastPosition,
      updatedAt: contentProgress.updatedAt,
      title: contentItem.title,
      subject: contentItem.subject,
      contentType: contentItem.type,
    })
    .from(contentProgress)
    .innerJoin(contentItem, eq(contentProgress.contentId, contentItem.contentId))
    .where(eq(contentProgress.studentId, studentId))
    .orderBy(desc(contentProgress.updatedAt))

  return rows.map(row => ({
    id: row.contentId,
    type: 'video' as const,
    title: row.title,
    progress: row.progress,
    completed: row.completed,
    lastAccessedAt: row.updatedAt ?? undefined,
    metadata: {
      progressId: row.progressId,
      subject: row.subject,
      contentType: row.contentType,
      lastPosition: row.lastPosition,
    },
  }))
}

export async function fetchLessonProgress(studentId: string): Promise<ProgressItem[]> {
  const enrollments = await drizzleDb
    .select({ courseId: courseEnrollment.courseId })
    .from(courseEnrollment)
    .where(eq(courseEnrollment.studentId, studentId))

  const courseIds = enrollments.map(e => e.courseId)
  if (courseIds.length === 0) return []

  const lessons = await drizzleDb
    .select({
      lessonId: courseLesson.lessonId,
      title: courseLesson.title,
      courseId: courseLesson.courseId,
      order: courseLesson.order,
    })
    .from(courseLesson)
    .where(inArray(courseLesson.courseId, courseIds))

  const allLessonIds = lessons.map(l => l.lessonId)
  if (allLessonIds.length === 0) return []

  const progressRows =
    allLessonIds.length > 0
      ? await drizzleDb
          .select()
          .from(courseLessonProgress)
          .where(eq(courseLessonProgress.studentId, studentId))
      : []

  const progressMap = new Map(progressRows.map(p => [p.lessonId, p]))

  const coursesData =
    courseIds.length > 0
      ? await drizzleDb.select().from(course).where(inArray(course.courseId, courseIds))
      : []
  const courseMap = new Map(coursesData.map(c => [c.courseId, c]))

  return lessons.map(lesson => {
    const lp = progressMap.get(lesson.lessonId)
    const status = lp?.status ?? 'NOT_STARTED'
    const isCompleted = status === 'COMPLETED'
    const isInProgress = status === 'IN_PROGRESS'

    return {
      id: lesson.lessonId,
      type: 'lesson' as const,
      title: lesson.title,
      progress: isCompleted ? 100 : isInProgress ? 50 : 0,
      completed: isCompleted,
      lastAccessedAt: lp?.updatedAt ?? undefined,
      metadata: {
        courseId: lesson.courseId,
        courseName: courseMap.get(lesson.courseId)?.name ?? '',
        order: lesson.order,
        status,
        score: lp?.score ?? null,
        completedAt: lp?.completedAt ?? null,
      },
    }
  })
}

export async function fetchCourseProgress(studentId: string): Promise<ProgressItem[]> {
  const enrollments = await drizzleDb
    .select()
    .from(courseEnrollment)
    .where(eq(courseEnrollment.studentId, studentId))

  const courseIds = enrollments.map(e => e.courseId)
  if (courseIds.length === 0) return []

  const coursesData =
    courseIds.length > 0
      ? await drizzleDb.select().from(course).where(inArray(course.courseId, courseIds))
      : []
  const courseMap = new Map(coursesData.map(c => [c.courseId, c]))

  const progressRows =
    courseIds.length > 0
      ? await drizzleDb
          .select()
          .from(courseProgress)
          .where(eq(courseProgress.studentId, studentId))
      : []
  const progressMap = new Map(progressRows.map(p => [p.courseId, p]))

  const lessons =
    courseIds.length > 0
      ? await drizzleDb
          .select({
            lessonId: courseLesson.lessonId,
            courseId: courseLesson.courseId,
          })
          .from(courseLesson)
          .where(inArray(courseLesson.courseId, courseIds))
      : []

  const lessonsByCourse = new Map<string, number>()
  for (const l of lessons) {
    lessonsByCourse.set(l.courseId, (lessonsByCourse.get(l.courseId) ?? 0) + 1)
  }

  return enrollments.map(enrollment => {
    const courseRow = courseMap.get(enrollment.courseId)
    const cp = progressMap.get(enrollment.courseId)
    const totalLessons = lessonsByCourse.get(enrollment.courseId) ?? 0
    const lessonsCompleted = cp?.lessonsCompleted ?? 0

    let progress = 0
    if (cp?.isCompleted) {
      progress = 100
    } else if (totalLessons > 0) {
      progress = Math.round((lessonsCompleted / totalLessons) * 100)
    }

    return {
      id: enrollment.courseId,
      type: 'course' as const,
      title: courseRow?.name ?? '',
      progress,
      completed: cp?.isCompleted ?? false,
      lastAccessedAt: cp?.completedAt ?? enrollment.lastActivity ?? undefined,
      metadata: {
        enrollmentId: enrollment.enrollmentId,
        lessonsCompleted,
        totalLessons,
        averageScore: cp?.averageScore ?? null,
        enrolledAt: enrollment.enrolledAt,
      },
    }
  })
}

export async function fetchTaskProgress(studentId: string): Promise<ProgressItem[]> {
  const rows = await drizzleDb
    .select({
      submissionId: taskSubmission.submissionId,
      taskId: taskSubmission.taskId,
      score: taskSubmission.score,
      maxScore: taskSubmission.maxScore,
      status: taskSubmission.status,
      submittedAt: taskSubmission.submittedAt,
      timeSpent: taskSubmission.timeSpent,
      attempts: taskSubmission.attempts,
      title: builderTask.title,
      courseId: builderTask.courseId,
      lessonId: builderTask.lessonId,
    })
    .from(taskSubmission)
    .innerJoin(builderTask, eq(taskSubmission.taskId, builderTask.taskId))
    .where(eq(taskSubmission.studentId, studentId))
    .orderBy(desc(taskSubmission.submittedAt))

  return rows.map(row => {
    const isGraded = row.status === 'GRADED'
    const isSubmitted = row.status === 'SUBMITTED'

    return {
      id: row.taskId,
      type: 'task' as const,
      title: row.title,
      progress: isGraded ? 100 : isSubmitted ? 50 : 0,
      completed: isGraded || isSubmitted,
      lastAccessedAt: row.submittedAt ?? undefined,
      metadata: {
        submissionId: row.submissionId,
        score: row.score,
        maxScore: row.maxScore,
        status: row.status,
        timeSpent: row.timeSpent,
        attempts: row.attempts,
        courseId: row.courseId,
        lessonId: row.lessonId,
      },
    }
  })
}

export async function getStudentProgress(
  studentId: string,
  filter?: ProgressFilter
): Promise<ProgressItem[]> {
  const typesToFetch: ProgressItemType[] = filter?.type
    ? [filter.type]
    : ['video', 'lesson', 'course', 'task']

  const promises: Promise<ProgressItem[]>[] = []

  if (typesToFetch.includes('video')) promises.push(fetchVideoProgress(studentId))
  if (typesToFetch.includes('lesson')) promises.push(fetchLessonProgress(studentId))
  if (typesToFetch.includes('course')) promises.push(fetchCourseProgress(studentId))
  if (typesToFetch.includes('task')) promises.push(fetchTaskProgress(studentId))

  const results = await Promise.all(promises)
  const combined = results.flat()

  combined.sort((a, b) => {
    const aTime = a.lastAccessedAt?.getTime() ?? 0
    const bTime = b.lastAccessedAt?.getTime() ?? 0
    return bTime - aTime
  })

  return combined
}
