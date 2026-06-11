/**
 * Authorization helpers for accessing/deleting files stored under the upload
 * key conventions used across the app:
 *  - documents/{ownerId}/{filename}
 *  - submissions/{studentId}/{taskId}/{filename}
 *  - tutors/{tutorId}/resources/{uuid}{ext}
 *
 * Used by serve-upload (read) and uploads/cleanup (delete) to prevent IDOR —
 * any pattern not recognized here is denied by default.
 */
import type { Session } from 'next-auth'
import { and, eq, or } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { resource, resourceShare } from '@/lib/db/schema'
import { tutorHasStudent } from './tutor-student-access'

function normalizeRole(role: unknown): string {
  if (typeof role !== 'string') return ''
  return role.trim().toUpperCase()
}

/**
 * Can this user read the file stored at the given key (path segments)?
 * Allows the owner, plus tutors for their own students' documents/submissions,
 * plus public/shared tutor resources.
 */
export async function canReadUploadKey(
  session: Session,
  pathSegments: string[]
): Promise<boolean> {
  const userId = session.user.id
  const role = normalizeRole(session.user.role)

  if (pathSegments[0] === 'documents' && pathSegments.length >= 2) {
    const ownerId = pathSegments[1]
    if (ownerId === userId) return true
    return role === 'TUTOR' && (await tutorHasStudent(userId, ownerId))
  }

  if (pathSegments[0] === 'submissions' && pathSegments.length >= 3) {
    const studentId = pathSegments[1]
    if (studentId === userId) return true
    return role === 'TUTOR' && (await tutorHasStudent(userId, studentId))
  }

  if (pathSegments[0] === 'tutors' && pathSegments[2] === 'resources' && pathSegments.length >= 4) {
    const tutorId = pathSegments[1]
    if (tutorId === userId) return true

    const key = pathSegments.join('/')

    const [direct] = await drizzleDb
      .select({ resourceId: resource.resourceId })
      .from(resource)
      .where(
        and(eq(resource.key, key), or(eq(resource.tutorId, userId), eq(resource.isPublic, true))!)
      )
      .limit(1)
    if (direct) return true

    const [shared] = await drizzleDb
      .select({ shareId: resourceShare.shareId })
      .from(resource)
      .innerJoin(resourceShare, eq(resourceShare.resourceId, resource.resourceId))
      .where(
        and(
          eq(resource.key, key),
          or(eq(resourceShare.recipientId, userId), eq(resourceShare.sharedWithAll, true))!
        )
      )
      .limit(1)
    return !!shared
  }

  return false
}

/**
 * Can this user delete the file stored at the given key? Owner-only —
 * no sharing exception, unlike read access.
 */
export function canDeleteUploadKey(session: Session, key: string): boolean {
  const userId = session.user.id
  const segments = key.split('/')

  if (segments[0] === 'documents' && segments.length >= 2) {
    return segments[1] === userId
  }

  if (segments[0] === 'submissions' && segments.length >= 3) {
    return segments[1] === userId
  }

  if (segments[0] === 'tutors' && segments[2] === 'resources' && segments.length >= 4) {
    return segments[1] === userId
  }

  return false
}
