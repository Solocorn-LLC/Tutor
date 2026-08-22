/**
 * GCS audio upload helpers.
 *
 * Uses GCS_AUDIO_BUCKET when configured, otherwise falls back to GCS_BUCKET.
 * Set GCS_AUDIO_BUCKET, GCS_BUCKET, GCP_PROJECT_ID, GCP_SA_KEY.
 */

import { createPresignedUploadUrl, isGcsConfigured } from '@/lib/storage/gcs'

const AUDIO_BUCKET = process.env.GCS_AUDIO_BUCKET || ''

export interface AudioPresignResult {
  uploadUrl: string
  publicUrl: string
  key: string
  uploadHeaders?: Record<string, string>
}

/**
 * Check whether audio upload to GCS is available.
 * Requires either GCS_AUDIO_BUCKET or GCS_BUCKET to be set.
 */
export function isAudioGcsConfigured(): boolean {
  return isGcsConfigured() || !!AUDIO_BUCKET
}

/**
 * Generate a presigned PUT URL for direct browser upload of an audio file.
 */
export async function getPresignedPutUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 900
): Promise<AudioPresignResult | null> {
  try {
    if (!isAudioGcsConfigured()) return null
    const { uploadUrl, publicUrl, uploadHeaders } = await createPresignedUploadUrl(
      key,
      contentType,
      false,
      AUDIO_BUCKET || undefined
    )
    return { uploadUrl, publicUrl: publicUrl ?? uploadUrl.split('?')[0], key, uploadHeaders }
  } catch {
    return null
  }
}
