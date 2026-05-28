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

function buildPublicUrl(key: string, bucketName?: string): string {
  return `https://storage.googleapis.com/${bucketName || BUCKET}/${key}`
}

// ─── URL Refresh Utilities ────────────────────────────────────────────────────

/**
 * Extract the GCS object key from a public or presigned GCS URL.
 * Uses proper URL parsing so query parameters are not included in the key.
 * Returns null if the URL is not a valid GCS URL.
 */
export function extractGcsKeyFromPublicUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'storage.googleapis.com') return null
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    if (pathParts.length < 2) return null
    // pathParts[0] = bucket, pathParts[1..] = object key
    return pathParts.slice(1).join('/')
  } catch {
    return null
  }
}

/**
 * Check if a URL is a GCS public URL.
 */
export function isGcsPublicUrl(url: string): boolean {
  return extractGcsKeyFromPublicUrl(url) !== null
}

/**
 * Refresh a GCS URL by generating a fresh presigned download URL.
 * If the URL is not a GCS public URL, returns it unchanged.
 * If GCS is not configured, returns the URL unchanged.
 */
export async function refreshGcsUrl(
  url: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  if (!isGcsConfigured()) return url
  const key = extractGcsKeyFromPublicUrl(url)
  if (!key) return url
  try {
    return await createPresignedDownloadUrl(key, expiresInSeconds)
  } catch (err: any) {
    // If signed URL generation fails (e.g. missing iam.serviceAccounts.signBlob
    // permission), fall back to the public URL rather than failing the upload.
    console.warn('[GCS] Signed URL generation failed, using public URL:', err?.message || err)
    return url
  }
}

/**
 * Refresh document URLs in any object recursively.
 * Prefers `fileKey` for generating fresh presigned URLs (more reliable than regex parsing URLs).
 * Falls back to regex-based URL refresh for backward compatibility.
 */
export async function refreshDocumentUrls<T>(obj: T): Promise<T> {
  if (!obj || typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    const result = []
    for (const item of obj) {
      result.push(await refreshDocumentUrls(item))
    }
    return result as unknown as T
  }

  const record = obj as Record<string, unknown>

  // If this object has both fileKey and fileUrl, use fileKey to refresh
  const fileKey = record.fileKey
  const fileUrl = record.fileUrl
  if (
    typeof fileKey === 'string' &&
    fileKey.length > 0 &&
    typeof fileUrl === 'string' &&
    isGcsConfigured()
  ) {
    const refreshed = { ...record }
    refreshed.fileUrl = await createPresignedDownloadUrl(fileKey, 3600)
    // Recursively refresh nested objects
    for (const [key, value] of Object.entries(refreshed)) {
      if (key !== 'fileUrl' && typeof value === 'object' && value !== null) {
        refreshed[key] = await refreshDocumentUrls(value)
      }
    }
    return refreshed as T
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key === 'fileUrl' && typeof value === 'string' && isGcsPublicUrl(value)) {
      result[key] = await refreshGcsUrl(value)
    } else if (typeof value === 'object' && value !== null) {
      result[key] = await refreshDocumentUrls(value)
    } else {
      result[key] = value
    }
  }

  return result as T
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
 * @param bucketName - Optional override bucket (defaults to GCS_BUCKET)
 */
export async function createPresignedUploadUrl(
  key: string,
  mimeType: string,
  isPublic: boolean = false,
  bucketName?: string
): Promise<PresignedUploadResult> {
  const storage = await getStorage()
  const targetBucket = bucketName || BUCKET
  const file = storage.bucket(targetBucket).file(key)

  const uploadHeaders = isPublic ? { 'x-goog-acl': 'public-read' } : undefined

  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000,
    contentType: mimeType,
    ...(uploadHeaders ? { extensionHeaders: uploadHeaders } : {}),
  })

  const publicUrl = isPublic ? buildPublicUrl(key, targetBucket) : null

  return { uploadUrl, key, publicUrl, ...(uploadHeaders ? { uploadHeaders } : {}) }
}

// ─── Presigned GET URL ────────────────────────────────────────────────────────

/**
 * Generate a presigned GET URL for temporary access to a private file.
 * Default expiry: 1 hour.
 * @param bucketName - Optional override bucket (defaults to GCS_BUCKET)
 */
export async function createPresignedDownloadUrl(
  key: string,
  expiresInSeconds: number = 3600,
  filename?: string,
  bucketName?: string
): Promise<string> {
  const storage = await getStorage()
  const file = storage.bucket(bucketName || BUCKET).file(key)

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
 * @param bucketName - Optional override bucket (defaults to GCS_BUCKET)
 */
export async function deleteObject(key: string, bucketName?: string): Promise<void> {
  const storage = await getStorage()
  await storage
    .bucket(bucketName || BUCKET)
    .file(key)
    .delete({ ignoreNotFound: true })
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
    try {
      await bucket.file(key).makePublic()
    } catch (err: any) {
      // Uniform bucket-level access prevents per-object ACL changes.
      // The file is already uploaded; signed URLs still work.
      // Catch ALL makePublic errors so the upload itself never fails
      // just because public ACLs can't be applied.
      console.warn('[GCS] makePublic skipped:', err?.message || err)
    }
  }

  return {
    url: buildPublicUrl(key),
    key,
  }
}

// ─── Upload Buffer ────────────────────────────────────────────────────────────

/**
 * Uploads a Buffer directly to GCS.
 * @param bucketName - Optional override bucket (defaults to GCS_BUCKET)
 */
export async function uploadBuffer(
  buffer: Buffer,
  key: string,
  mimeType: string,
  isPublic: boolean = false,
  bucketName?: string
): Promise<{ url: string; key: string }> {
  const storage = await getStorage()
  const targetBucket = bucketName || BUCKET
  const bucket = storage.bucket(targetBucket)
  const file = bucket.file(key)

  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000',
    },
  })

  if (isPublic) {
    try {
      await file.makePublic()
    } catch (err: any) {
      // Uniform bucket-level access prevents per-object ACL changes.
      // The file is already uploaded; signed URLs still work.
      // Catch ALL makePublic errors so the upload itself never fails
      // just because public ACLs can't be applied.
      console.warn('[GCS] makePublic skipped:', err?.message || err)
    }
  }

  return {
    url: buildPublicUrl(key, targetBucket),
    key,
  }
}

/**
 * Download a file from GCS as a Buffer.
 * @param bucketName - Optional override bucket (defaults to GCS_BUCKET)
 */
export async function downloadBuffer(key: string, bucketName?: string): Promise<Buffer | null> {
  const storage = await getStorage()
  const bucket = storage.bucket(bucketName || BUCKET)
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
