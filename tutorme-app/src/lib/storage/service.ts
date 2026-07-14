/**
 * Unified Storage Service
 *
 * GCS-first with persistent local-directory fallback for development.
 *
 * Required env vars for GCS:
 *   GCS_BUCKET
 *   GCP_PROJECT_ID
 *   GCP_SA_KEY (JSON service-account key)
 *
 * Optional env vars:
 *   LOCAL_STORAGE_DIR — override the default local fallback directory
 *                       (default: {cwd}/.local-storage)
 */

import { writeFile, mkdir, readFile, unlink, access } from 'fs/promises'
import path from 'path'

// ─── Config ───────────────────────────────────────────────────────────────────

const LOCAL_STORAGE_DIR =
  process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), '.local-storage')

// ─── Lazy GCS imports ─────────────────────────────────────────────────────────

async function getGcsHelpers() {
  const { isGcsConfigured, uploadBuffer, deleteObject, createPresignedDownloadUrl } =
    await import('./gcs')
  return { isGcsConfigured, uploadBuffer, deleteObject, createPresignedDownloadUrl }
}

// ─── Local helpers ────────────────────────────────────────────────────────────

function getLocalPath(key: string): string {
  // Prevent directory traversal in the key
  const safeKey = key
    .split('/')
    .filter(Boolean)
    .filter(segment => !segment.includes('..') && !segment.includes('\\'))
    .join(path.sep)
  return path.join(LOCAL_STORAGE_DIR, safeKey)
}

async function saveLocal(buffer: Buffer, key: string): Promise<void> {
  const localPath = getLocalPath(key)
  await mkdir(path.dirname(localPath), { recursive: true })
  await writeFile(localPath, buffer)
}

async function readLocal(key: string): Promise<Buffer | null> {
  try {
    return await readFile(getLocalPath(key))
  } catch {
    return null
  }
}

async function deleteLocal(key: string): Promise<void> {
  try {
    await unlink(getLocalPath(key))
  } catch {
    // ignore
  }
}

async function existsLocal(key: string): Promise<boolean> {
  try {
    await access(getLocalPath(key))
    return true
  } catch {
    return false
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface StoreResult {
  url: string
  key: string
  isLocal: boolean
}

/**
 * Store a file. Tries GCS first; falls back to persistent local storage.
 */
export async function storeFile(
  buffer: Buffer,
  key: string,
  mimeType: string,
  isPublic: boolean = false
): Promise<StoreResult> {
  const { isGcsConfigured, uploadBuffer } = await getGcsHelpers()

  if (isGcsConfigured()) {
    const result = await uploadBuffer(buffer, key, mimeType, isPublic)
    // The bucket has uniform bucket-level access + public-access-prevention, so the
    // raw `storage.googleapis.com/...` URL is NOT readable (403). For private files
    // (the default) return the authenticated serve-upload path, which resolves to a
    // fresh signed URL on access. Only genuinely public assets keep the direct URL.
    return { url: isPublic ? result.url : `/api/serve-upload/${key}`, key, isLocal: false }
  }

  // Local fallback
  await saveLocal(buffer, key)
  return { url: `/api/serve-upload/${key}`, key, isLocal: true }
}

/**
 * Get a signed URL for temporary access to a file.
 * When GCS is configured, returns a fresh v4 signed URL.
 * Otherwise returns the local serve-upload path.
 */
export async function getFileUrl(
  key: string,
  filename?: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const { isGcsConfigured, createPresignedDownloadUrl } = await getGcsHelpers()

  if (isGcsConfigured()) {
    return createPresignedDownloadUrl(key, expiresInSeconds, filename)
  }

  return `/api/serve-upload/${key}`
}

/**
 * Delete a file from whichever backend it lives on.
 */
export async function removeFile(key: string): Promise<void> {
  const { isGcsConfigured, deleteObject } = await getGcsHelpers()

  if (isGcsConfigured()) {
    // deleteObject also removes the `<key>.pdf` sibling rendered from a raw
    // Office doc (see gcs.ts), so the derived PDF doesn't orphan.
    await deleteObject(key).catch(() => {})
  }

  await deleteLocal(key)
  // Mirror the sibling cleanup for local storage.
  if (!key.endsWith('.pdf')) await deleteLocal(`${key}.pdf`)
}

/**
 * Read a file as a Buffer. Tries GCS first, then local fallback.
 */
export async function readFileBuffer(key: string): Promise<Buffer | null> {
  const { isGcsConfigured } = await getGcsHelpers()

  if (isGcsConfigured()) {
    const { downloadBuffer } = await import('./gcs')
    const buf = await downloadBuffer(key)
    if (buf) return buf
  }

  return readLocal(key)
}

/** Cheap existence check (metadata/stat — no download). GCS first, then local. */
export async function fileExists(key: string): Promise<boolean> {
  const { isGcsConfigured } = await getGcsHelpers()

  if (isGcsConfigured()) {
    const { objectExists } = await import('./gcs')
    if (await objectExists(key)) return true
  }

  return existsLocal(key)
}

/**
 * Check whether the configured backend is local (not GCS).
 */
export async function isUsingLocalStorage(): Promise<boolean> {
  const { isGcsConfigured } = await getGcsHelpers()
  return !isGcsConfigured()
}
