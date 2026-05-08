/**
 * GCS Storage Service
 *
 * Wraps @google-cloud/storage for file storage operations.
 *
 * Required env vars:
 *   GCS_BUCKET
 *   GCP_PROJECT_ID
 *   GCP_SA_KEY (JSON string)
 */

import { randomUUID } from 'crypto'
import path from 'path'

// ─── Config ───────────────────────────────────────────────────────────────────

const BUCKET = process.env.GCS_BUCKET || ''
const PROJECT_ID = process.env.GCP_PROJECT_ID || ''
const SA_KEY = process.env.GCP_SA_KEY || ''
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024 // 100 MB

// Dynamically import @google-cloud/storage to avoid build issues
let Storage: typeof import('@google-cloud/storage').Storage | null = null
let cachedStorage: import('@google-cloud/storage').Storage | null = null

async function getStorage() {
  if (cachedStorage) return cachedStorage
  if (!Storage) {
    const gcs = await import('@google-cloud/storage')
    Storage = gcs.Storage
  }
  if (SA_KEY) {
    let credentials: Record<string, unknown>
    try {
      credentials = JSON.parse(SA_KEY) as Record<string, unknown>
    } catch {
      throw new Error('GCP_SA_KEY must be valid JSON')
    }
    cachedStorage = new Storage({
      projectId: PROJECT_ID || (credentials.project_id as string | undefined),
      credentials,
    })
    return cachedStorage
  }

  cachedStorage = new Storage({
    ...(PROJECT_ID ? { projectId: PROJECT_ID } : {}),
  })
  return cachedStorage
}

// Check if GCS is configured
export function isGcsConfigured(): boolean {
  return !!BUCKET
}

function buildPublicUrl(key: string): string {
  return `https://storage.googleapis.com/${BUCKET}/${key}`
}

// ─── Presigned PUT URL ────────────────────────────────────────────────────────

interface PresignedUploadResult {
  uploadUrl: string
  key: string
  publicUrl: string | null
  uploadHeaders?: Record<string, string>
}

/**
 * Generate a presigned PUT URL for direct browser-to-GCS upload.
 * Expires in 15 minutes.
 */
export async function createPresignedUploadUrl(
  key: string,
  mimeType: string,
  isPublic: boolean = false
): Promise<PresignedUploadResult> {
  const storage = await getStorage()
  const file = storage.bucket(BUCKET).file(key)

  const uploadHeaders = isPublic ? { 'x-goog-acl': 'public-read' } : undefined

  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000,
    contentType: mimeType,
    ...(uploadHeaders ? { extensionHeaders: uploadHeaders } : {}),
  })

  const publicUrl = isPublic ? buildPublicUrl(key) : null

  return { uploadUrl, key, publicUrl, ...(uploadHeaders ? { uploadHeaders } : {}) }
}

// ─── Presigned GET URL ────────────────────────────────────────────────────────

/**
 * Generate a presigned GET URL for temporary access to a private file.
 * Default expiry: 1 hour.
 */
export async function createPresignedDownloadUrl(
  key: string,
  expiresInSeconds: number = 3600,
  filename?: string
): Promise<string> {
  const storage = await getStorage()
  const file = storage.bucket(BUCKET).file(key)

  const [downloadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresInSeconds * 1000,
    ...(filename
      ? {
          responseDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
        }
      : {}),
  })

  return downloadUrl
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete an object from GCS.
 */
export async function deleteObject(key: string): Promise<void> {
  const storage = await getStorage()
  await storage.bucket(BUCKET).file(key).delete({ ignoreNotFound: true })
}

// ─── Key Generation ───────────────────────────────────────────────────────────

/**
 * Generate a unique key for a resource.
 * Pattern: {prefix}/{uuid}{ext}
 */
export function generateResourceKey(
  tutorId: string,
  filename: string,
  prefix: string = 'resources'
): string {
  const ext = path.extname(filename).toLowerCase()
  const uuid = randomUUID()
  return `tutors/${tutorId}/${prefix}/${uuid}${ext}`
}

/**
 * Infer resource type from MIME type.
 */
export function inferResourceType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType === 'application/pdf' || mimeType.includes('word') || mimeType.startsWith('text/'))
    return 'document'
  if (mimeType.includes('excel') || mimeType.includes('sheet') || mimeType.includes('csv'))
    return 'spreadsheet'
  return 'other'
}

// ─── Upload Local File ────────────────────────────────────────────────────────

/**
 * Uploads a local file directly to GCS.
 */
export async function uploadLocalFile(
  localPath: string,
  key: string,
  mimeType: string,
  isPublic: boolean = false
): Promise<{ url: string; key: string }> {
  const storage = await getStorage()
  const bucket = storage.bucket(BUCKET)

  await bucket.upload(localPath, {
    destination: key,
    metadata: {
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000',
    },
  })

  if (isPublic) {
    await bucket.file(key).makePublic()
  }

  return {
    url: buildPublicUrl(key),
    key,
  }
}

// ─── Upload Buffer ────────────────────────────────────────────────────────────

/**
 * Uploads a Buffer directly to GCS.
 */
export async function uploadBuffer(
  buffer: Buffer,
  key: string,
  mimeType: string,
  isPublic: boolean = false
): Promise<{ url: string; key: string }> {
  const storage = await getStorage()
  const bucket = storage.bucket(BUCKET)
  const file = bucket.file(key)

  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000',
    },
  })

  if (isPublic) {
    await file.makePublic()
  }

  return {
    url: buildPublicUrl(key),
    key,
  }
}

export async function downloadBuffer(key: string): Promise<Buffer | null> {
  const storage = await getStorage()
  const bucket = storage.bucket(BUCKET)
  const file = bucket.file(key)
  try {
    const [buf] = await file.download()
    return buf
  } catch (error: any) {
    const code = error?.code
    if (code === 404) return null
    throw error
  }
}

export { MAX_UPLOAD_BYTES }
