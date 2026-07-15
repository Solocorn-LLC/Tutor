import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  course,
  courseEnrollment,
  courseLesson,
  deployedMaterial,
  liveSession,
  profile,
  sessionParticipant,
  studentTaskReport,
  taskSubmission,
} from '@/lib/db/schema'
import { and, eq, inArray, isNull, asc } from 'drizzle-orm'
import { expandToCourseFamily } from '@/lib/courses/variant-family'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (request, session, context) => {
  const courseId = await getParamAsync(context.params, 'id')
  const tutorId = session.user.id

  if (!courseId || courseId === 'undefined' || courseId === 'null') {
    return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
  }

  const courseRow = await drizzleDb
    .select({
      id: course.courseId,
      name: course.name,
      creatorId: course.creatorId,
    })
    .from(course)
    .where(eq(course.courseId, courseId))
    .limit(1)

  if (!courseRow[0]) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  }

  if (courseRow[0].creatorId !== tutorId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Content (lessons/sessions/enrollments/materials/reports) can sit under either
  // the template or the published variant id, so scope them to the whole family.
  const courseFamily = await expandToCourseFamily([courseId])

  const lessons = await drizzleDb
    .select({
      id: courseLesson.lessonId,
      title: courseLesson.title,
      order: courseLesson.order,
    })
    .from(courseLesson)
    .where(and(inArray(courseLesson.courseId, courseFamily), isNull(courseLesson.deletedAt)))
    .orderBy(asc(courseLesson.order))

  const sessions = await drizzleDb
    .select({
      id: liveSession.sessionId,
      title: liveSession.title,
      scheduledAt: liveSession.scheduledAt,
      status: liveSession.status,
    })
    .from(liveSession)
    .where(and(inArray(liveSession.courseId, courseFamily), eq(liveSession.tutorId, tutorId)))
    .orderBy(asc(liveSession.scheduledAt))

  const sessionIds = sessions.map(s => s.id).filter(Boolean)
  const sessionParticipants =
    sessionIds.length === 0
      ? []
      : await drizzleDb
          .select({
            sessionId: sessionParticipant.sessionId,
            studentId: sessionParticipant.studentId,
            studentName: profile.name,
          })
          .from(sessionParticipant)
          .leftJoin(profile, eq(sessionParticipant.studentId, profile.userId))
          .where(inArray(sessionParticipant.sessionId, sessionIds))

  const enrolledStudents = await drizzleDb
    .select({
      studentId: courseEnrollment.studentId,
      studentName: profile.name,
    })
    .from(courseEnrollment)
    .leftJoin(profile, eq(courseEnrollment.studentId, profile.userId))
    .where(inArray(courseEnrollment.courseId, courseFamily))

  const deployed =
    sessionIds.length === 0
      ? []
      : await drizzleDb
          .select({
            id: deployedMaterial.id,
            sessionId: deployedMaterial.sessionId,
            courseId: deployedMaterial.courseId,
            type: deployedMaterial.type,
            itemId: deployedMaterial.itemId,
            title: deployedMaterial.title,
            sessionSequence: deployedMaterial.sessionSequence,
            lessonId: deployedMaterial.lessonId,
            deployedAt: deployedMaterial.deployedAt,
          })
          .from(deployedMaterial)
          .where(
            and(
              inArray(deployedMaterial.courseId, courseFamily),
              inArray(deployedMaterial.sessionId, sessionIds)
            )
          )

  const deployedItemIds = Array.from(
    new Set(
      deployed
        .filter(d => d.type === 'task' || d.type === 'assessment' || d.type === 'homework')
        .map(d => d.itemId)
    )
  )

  const studentIds = Array.from(
    new Set(
      [
        ...enrolledStudents.map(s => s.studentId),
        ...sessionParticipants.map(p => p.studentId),
      ].filter(Boolean) as string[]
    )
  )

  const submissions =
    deployedItemIds.length === 0 || studentIds.length === 0
      ? []
      : await drizzleDb
          .select({
            submissionId: taskSubmission.submissionId,
            taskId: taskSubmission.taskId,
            studentId: taskSubmission.studentId,
            status: taskSubmission.status,
            score: taskSubmission.score,
            maxScore: taskSubmission.maxScore,
            submittedAt: taskSubmission.submittedAt,
            answers: taskSubmission.answers,
          })
          .from(taskSubmission)
          .where(
            and(
              inArray(taskSubmission.taskId, deployedItemIds),
              inArray(taskSubmission.studentId, studentIds)
            )
          )

  const reports =
    deployedItemIds.length === 0 || studentIds.length === 0
      ? []
      : await drizzleDb
          .select({
            id: studentTaskReport.reportId,
            studentId: studentTaskReport.studentId,
            tutorId: studentTaskReport.tutorId,
            courseId: studentTaskReport.courseId,
            taskId: studentTaskReport.taskId,
            type: studentTaskReport.type,
            title: studentTaskReport.title,
            status: studentTaskReport.status,
            strengths: studentTaskReport.strengths,
            weaknesses: studentTaskReport.weaknesses,
            overallComments: studentTaskReport.overallComments,
            score: studentTaskReport.score,
            createdAt: studentTaskReport.createdAt,
            updatedAt: studentTaskReport.updatedAt,
            sentAt: studentTaskReport.sentAt,
          })
          .from(studentTaskReport)
          .where(
            and(
              eq(studentTaskReport.tutorId, tutorId),
              inArray(studentTaskReport.courseId, courseFamily),
              inArray(studentTaskReport.studentId, studentIds)
            )
          )

  return NextResponse.json({
    course: { id: courseRow[0].id, name: courseRow[0].name },
    lessons,
    sessions,
    deployed,
    sessionParticipants,
    enrolledStudents,
    submissions,
    reports,
  })
})
