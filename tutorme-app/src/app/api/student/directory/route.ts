import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  courseEnrollment,
  course,
  profile,
  deployedMaterial,
  studentTaskReport,
  sessionParticipant,
  liveSession,
} from '@/lib/db/schema'
import { eq, inArray, and, isNotNull, isNull } from 'drizzle-orm'
import { expandFamilyWithMap } from '@/lib/courses/variant-family'
import { refreshDocumentUrls } from '@/lib/storage/gcs'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  async (request, session) => {
    const studentId = session.user.id
    const errors: string[] = []

    // Self-heal: ensure directory tables exist (handles schema drift / missing migrations)
    try {
      await drizzleDb.execute(
        `CREATE TABLE IF NOT EXISTS "DeployedMaterial" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "sessionId" text NOT NULL REFERENCES "LiveSession"("id") ON DELETE CASCADE,
        "courseId" text NOT NULL REFERENCES "Course"("id") ON DELETE CASCADE,
        "type" text NOT NULL,
        "itemId" text NOT NULL,
        "title" text NOT NULL,
        "content" jsonb,
        "sessionSequence" integer NOT NULL,
        "deployedAt" timestamp with time zone NOT NULL DEFAULT now()
      )`
      )
      await drizzleDb.execute(
        `CREATE INDEX IF NOT EXISTS "DeployedMaterial_sessionId_idx" ON "DeployedMaterial"("sessionId")`
      )
      await drizzleDb.execute(
        `CREATE INDEX IF NOT EXISTS "DeployedMaterial_courseId_idx" ON "DeployedMaterial"("courseId")`
      )
      await drizzleDb.execute(
        `CREATE INDEX IF NOT EXISTS "DeployedMaterial_type_idx" ON "DeployedMaterial"("type")`
      )
      await drizzleDb.execute(
        `CREATE INDEX IF NOT EXISTS "DeployedMaterial_deployedAt_idx" ON "DeployedMaterial"("deployedAt")`
      )
      await drizzleDb.execute(
        `CREATE INDEX IF NOT EXISTS "DeployedMaterial_sessionId_sessionSequence_idx" ON "DeployedMaterial"("sessionId", "sessionSequence")`
      )
    } catch (err: any) {
      console.error('Self-heal DeployedMaterial failed:', err?.message)
    }

    try {
      await drizzleDb.execute(
        `CREATE TABLE IF NOT EXISTS "StudentTaskReport" (
        "id" text PRIMARY KEY NOT NULL,
        "studentId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "tutorId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "courseId" text,
        "taskId" text,
        "type" text NOT NULL,
        "title" text NOT NULL,
        "status" text NOT NULL DEFAULT 'requested',
        "strengths" jsonb,
        "weaknesses" jsonb,
        "overallComments" text,
        "score" double precision,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        "sentAt" timestamp with time zone
      )`
      )
    } catch (err: any) {
      console.error('Self-heal StudentTaskReport failed:', err?.message)
    }

    // --- 1. Fetch enrollments ---
    let enrollments: {
      studentId: string | null
      courseId: string | null
      courseName: string | null
      tutorId: string | null
      tutorName: string | null
    }[] = []
    try {
      enrollments = await drizzleDb
        .select({
          studentId: courseEnrollment.studentId,
          courseId: course.courseId,
          courseName: course.name,
          tutorId: course.creatorId,
          tutorName: profile.name,
        })
        .from(courseEnrollment)
        .innerJoin(course, eq(courseEnrollment.courseId, course.courseId))
        .leftJoin(profile, eq(course.creatorId, profile.userId))
        .where(eq(courseEnrollment.studentId, studentId))
    } catch (err: any) {
      errors.push(`enrollments query failed: ${err?.message || String(err)}`)
      // Return early with empty directory but show the error
      return NextResponse.json({ directory: {}, errors }, { status: 200 })
    }

    // Also include courses the student is a PARTICIPANT in (1-on-1 / group live
    // sessions) — they join by a booking seat, not courseEnrollment, so without
    // this a participant-only student sees an empty directory. Same shape as an
    // enrollment; unioned + deduped by courseId below.
    try {
      const participantCourses = await drizzleDb
        .selectDistinct({
          studentId: sessionParticipant.studentId,
          courseId: course.courseId,
          courseName: course.name,
          tutorId: course.creatorId,
          tutorName: profile.name,
        })
        .from(sessionParticipant)
        .innerJoin(liveSession, eq(liveSession.sessionId, sessionParticipant.sessionId))
        .innerJoin(course, eq(course.courseId, liveSession.courseId))
        .leftJoin(profile, eq(course.creatorId, profile.userId))
        .where(
          and(
            eq(sessionParticipant.studentId, studentId),
            isNotNull(liveSession.courseId),
            isNull(course.deletedAt)
          )
        )
      const seen = new Set(enrollments.map(e => e.courseId))
      for (const p of participantCourses) {
        if (p.courseId && !seen.has(p.courseId)) {
          seen.add(p.courseId)
          enrollments.push(p)
        }
      }
    } catch (err: any) {
      errors.push(`participant courses query failed: ${err?.message || String(err)}`)
    }

    if (enrollments.length === 0) {
      return NextResponse.json({ directory: {}, errors })
    }

    // Expand enrolled (published) ids to the variant family (so template-scoped
    // materials/reports are fetched) with a map back to the enrolled id for
    // attributing each item to the right course node in the tree.
    const { ids: courseIds, toEnrolled } = await expandFamilyWithMap(
      enrollments.map(e => e.courseId).filter((id): id is string => id != null)
    )

    // --- 2. Fetch deployed materials ---
    let deployedMaterials: any[] = []
    try {
      deployedMaterials = await drizzleDb
        .select()
        .from(deployedMaterial)
        .where(inArray(deployedMaterial.courseId, courseIds))
        .orderBy(deployedMaterial.deployedAt)
    } catch (err: any) {
      errors.push(`deployedMaterials query failed: ${err?.message || String(err)}`)
    }

    // --- 3. Fetch student reports ---
    let studentReports: any[] = []
    try {
      studentReports = await drizzleDb
        .select()
        .from(studentTaskReport)
        .where(
          and(
            eq(studentTaskReport.studentId, studentId),
            eq(studentTaskReport.status, 'sent'),
            inArray(studentTaskReport.courseId, courseIds)
          )
        )
    } catch (err: any) {
      errors.push(`studentReports query failed: ${err?.message || String(err)}`)
    }

    // Build the directory tree using courseId as keys to avoid name collisions
    const directory: Record<string, Record<string, any>> = {}

    enrollments.forEach(en => {
      const tutorKey = en.tutorName ? `Tutor@${en.tutorName.replace(/\s+/g, '')}` : 'Tutor@Unknown'
      const courseKey = en.courseName || 'Unnamed Course'

      if (!directory[tutorKey]) directory[tutorKey] = {}
      if (!directory[tutorKey][courseKey]) {
        directory[tutorKey][courseKey] = {
          courseId: en.courseId,
          tasks: [],
          assessments: [],
          homework: [],
          materials: [],
          reports: [],
          recordedSessions: [],
        }
      }
    })

    // Populate individual reports
    studentReports.forEach(report => {
      if (!report.courseId) return
      const ownerId = toEnrolled.get(report.courseId) ?? report.courseId
      const en = enrollments.find(e => e.courseId === ownerId)
      if (!en) return

      const tutorKey = en.tutorName ? `Tutor@${en.tutorName.replace(/\s+/g, '')}` : 'Tutor@Unknown'
      const courseKey = en.courseName || 'Unnamed Course'

      if (!directory[tutorKey]?.[courseKey]) return

      const item = {
        id: report.reportId,
        itemId: report.taskId || report.reportId,
        title: report.title,
        type: 'report',
        deployedAt: report.sentAt || report.updatedAt,
        content: {
          strengths: report.strengths,
          weaknesses: report.weaknesses,
          overallComments: report.overallComments,
          score: report.score,
        },
        sessionId: null,
        courseId: report.courseId,
        courseName: en.courseName,
      }

      directory[tutorKey][courseKey].reports.push(item)
    })

    // Populate materials into their respective folders
    // Sort descending so the last is on top — safely handle null deployedAt
    const sortedMaterials = [...deployedMaterials].sort((a, b) => {
      const aTime = a?.deployedAt ? new Date(a.deployedAt).getTime() : 0
      const bTime = b?.deployedAt ? new Date(b.deployedAt).getTime() : 0
      return bTime - aTime
    })

    for (const material of sortedMaterials) {
      const ownerId = toEnrolled.get(material.courseId) ?? material.courseId
      const en = enrollments.find(e => e.courseId === ownerId)
      if (!en) continue

      const tutorKey = en.tutorName ? `Tutor@${en.tutorName.replace(/\s+/g, '')}` : 'Tutor@Unknown'
      const courseKey = en.courseName || 'Unnamed Course'

      if (!directory[tutorKey]?.[courseKey]) continue

      const seqLabel = material.sessionSequence ? ` (s${material.sessionSequence})` : ''
      const formattedTitle = `${material.title}${seqLabel}`

      // Refresh any GCS document URLs in the content before sending to student
      const refreshedContent = await refreshDocumentUrls(material.content)

      const item = {
        id: material.id,
        itemId: material.itemId,
        title: formattedTitle,
        type: material.type,
        deployedAt: material.deployedAt,
        content: refreshedContent,
        sessionId: material.sessionId,
        courseId: material.courseId,
        courseName: en.courseName,
      }

      switch (material.type) {
        case 'task':
          directory[tutorKey][courseKey].tasks.push(item)
          break
        case 'assessment':
          directory[tutorKey][courseKey].assessments.push(item)
          break
        case 'homework':
          directory[tutorKey][courseKey].homework.push(item)
          break
        case 'asset':
          // Documents / resources the tutor deployed in a live session. Without
          // this case they were silently dropped from the Directory.
          directory[tutorKey][courseKey].materials.push(item)
          break
        case 'recording':
          directory[tutorKey][courseKey].recordedSessions.push(item)
          break
        case 'report':
          directory[tutorKey][courseKey].reports.push(item)
          break
      }
    }

    return NextResponse.json({ directory, errors })
  },
  { role: 'STUDENT' }
)
