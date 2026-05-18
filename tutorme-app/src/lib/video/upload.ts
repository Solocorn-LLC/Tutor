/**
 * GCS video upload: presigned PUT URL for direct browser upload.
 *
 * Uses GCS_VIDEO_BUCKET when configured, otherwise falls back to GCS_BUCKET.
 * Set GCS_VIDEO_BUCKET, GCS_BUCKET, GCP_PROJECT_ID, GCP_SA_KEY.
 */

import { createPresignedUploadUrl, isGcsConfigured } from '@/lib/storage/gcs'

const VIDEO_BUCKET = process.env.GCS_VIDEO_BUCKET || ''

export interface PresignResult {
  uploadUrl: string
  publicUrl: string
  key: string
  uploadHeaders?: Record<string, string>
}

/**
 * Check whether video upload to GCS is available.
 * Requires either GCS_VIDEO_BUCKET or GCS_BUCKET to be set.
 */
export function isVideoGcsConfigured(): boolean {
  return isGcsConfigured() || !!VIDEO_BUCKET
}

export async function getPresignedPutUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 3600
): Promise<PresignResult | null> {
  try {
    if (!isGcsConfigured() && !VIDEO_BUCKET) return null
    const { uploadUrl, publicUrl, uploadHeaders } = await createPresignedUploadUrl(
      key,
      contentType,
      false,
      VIDEO_BUCKET || undefined
    )
    return { uploadUrl, publicUrl: publicUrl ?? uploadUrl.split('?')[0], key, uploadHeaders }
  } catch {
    return null
  }
}

export { isGcsConfigured }
