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
import { expandToCourseFamily } from '@/lib/courses/variant-family'

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

  // A session normally carries a courseId, but ad-hoc sessions (and rooms whose
  // in-memory courseId drifted from the DB row) may not. Don't hard-fail —
  // submissions are anchored to the session, so we can still surface them.
  const courseId = sessionRow.courseId || ''
  // The session's courseId may be the template while enrollments/reports live
  // under the published variant (or vice versa) — match the whole family.
  const courseFamily = courseId ? await expandToCourseFamily([courseId]) : []

  const [courseRow] = courseId
    ? await drizzleDb
        .select({ id: course.courseId, name: course.name })
        .from(course)
        .where(eq(course.courseId, courseId))
        .limit(1)
    : []

  const participants = await drizzleDb
    .select({
      studentId: sessionParticipant.studentId,
      studentName: profile.name,
    })
    .from(sessionParticipant)
    .leftJoin(profile, eq(sessionParticipant.studentId, profile.userId))
    .where(eq(sessionParticipant.sessionId, sessionId))

  const enrolled = courseId
    ? await drizzleDb
        .select({
          studentId: courseEnrollment.studentId,
          studentName: profile.name,
        })
        .from(courseEnrollment)
        .leftJoin(profile, eq(courseEnrollment.studentId, profile.userId))
        .where(inArray(courseEnrollment.courseId, courseFamily))
    : []

  // Anchor deployed materials to the SESSION only — not also to the session's
  // courseId. A submission persisted under a slightly different course anchor
  // (e.g. the live room's in-memory courseId differing from liveSession.courseId)
  // would otherwise be filtered out here even though it belongs to this session,
  // making completed work invisible in the submissions panel.
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
    .where(eq(deployedMaterial.sessionId, sessionId))
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
              inArray(studentTaskReport.courseId, courseFamily),
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
