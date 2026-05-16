import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { getParamAsync } from '@/lib/api/params'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  course,
  courseEnrollment,
  deployedMaterial,
  liveSession,
  profile,
  sessionParticipant,
  studentTaskReport,
  taskSubmission,
} from '@/lib/db/schema'
import { and, asc, eq, inArray } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req, session, context) => {
  const tutorId = session.user.id
  const sessionId = await getParamAsync(context.params, 'sessionId')

  if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
  }

  const [sessionRow] = await drizzleDb
    .select({
      id: liveSession.sessionId,
      tutorId: liveSession.tutorId,
      courseId: liveSession.courseId,
      title: liveSession.title,
      scheduledAt: liveSession.scheduledAt,
      status: liveSession.status,
    })
    .from(liveSession)
    .where(eq(liveSession.sessionId, sessionId))
    .limit(1)

  if (!sessionRow) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (sessionRow.tutorId !== tutorId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (!sessionRow.courseId) {
    return NextResponse.json({ error: 'Session is missing courseId' }, { status: 400 })
  }

  const courseId = sessionRow.courseId

  const [courseRow] = await drizzleDb
    .select({ id: course.courseId, name: course.name })
    .from(course)
    .where(eq(course.courseId, courseId))
    .limit(1)

  const participants = await drizzleDb
    .select({
      studentId: sessionParticipant.studentId,
      studentName: profile.name,
    })
    .from(sessionParticipant)
    .leftJoin(profile, eq(sessionParticipant.studentId, profile.userId))
    .where(eq(sessionParticipant.sessionId, sessionId))

  const enrolled = await drizzleDb
    .select({
      studentId: courseEnrollment.studentId,
      studentName: profile.name,
    })
    .from(courseEnrollment)
    .leftJoin(profile, eq(courseEnrollment.studentId, profile.userId))
    .where(eq(courseEnrollment.courseId, courseId))

  const deployed = await drizzleDb
    .select({
      id: deployedMaterial.id,
      sessionId: deployedMaterial.sessionId,
      courseId: deployedMaterial.courseId,
      type: deployedMaterial.type,
      itemId: deployedMaterial.itemId,
      title: deployedMaterial.title,
      sessionSequence: deployedMaterial.sessionSequence,
      deployedAt: deployedMaterial.deployedAt,
    })
    .from(deployedMaterial)
    .where(and(eq(deployedMaterial.sessionId, sessionId), eq(deployedMaterial.courseId, courseId)))
    .orderBy(asc(deployedMaterial.deployedAt))

  const itemIds = Array.from(
    new Set(
      deployed
        .filter(d => d.type === 'task' || d.type === 'assessment' || d.type === 'homework')
        .map(d => d.itemId)
    )
  )

  const studentIds = Array.from(
    new Set(
      [...participants.map(p => p.studentId), ...enrolled.map(s => s.studentId)].filter(
        Boolean
      ) as string[]
    )
  )

  const submissions =
    itemIds.length === 0 || studentIds.length === 0
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
          })
          .from(taskSubmission)
          .where(
            and(
              inArray(taskSubmission.taskId, itemIds),
              inArray(taskSubmission.studentId, studentIds)
            )
          )

  const reports =
    studentIds.length === 0
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
              eq(studentTaskReport.courseId, courseId),
              inArray(studentTaskReport.studentId, studentIds)
            )
          )

  return NextResponse.json({
    course: courseRow || { id: courseId, name: 'Course' },
    session: {
      id: sessionRow.id,
      title: sessionRow.title,
      scheduledAt: sessionRow.scheduledAt,
      status: sessionRow.status,
    },
    participants,
    enrolled,
    deployed,
    submissions,
    reports,
  })
})
