/**
 * POST /api/uploads/audio
 *
 * Upload an audio file for a task slide. Stores in GCS_AUDIO_BUCKET (or
 * GCS_BUCKET as fallback) and returns a durable same-origin proxy URL.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, handleApiError } from '@/lib/api/middleware'
import type { Session } from 'next-auth'
import path from 'path'
import { isAudioGcsConfigured } from '@/lib/audio/upload'
import { uploadBuffer, isGcsConfigured } from '@/lib/storage/gcs'

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
  'audio/webm',
]

const EXT_TO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function resolveMimeType(file: File): string | null {
  const provided = file.type?.toLowerCase()
  if (provided && ALLOWED_AUDIO_MIME_TYPES.includes(provided)) return provided
  const ext = path.extname(file.name || '').toLowerCase()
  return EXT_TO_MIME[ext] || null
}

export const POST = withCsrf(
  withAuth(async (request: NextRequest, session: Session) => {
    try {
      if (!isAudioGcsConfigured()) {
        return NextResponse.json(
          { error: 'Audio storage is not configured. Set GCS_AUDIO_BUCKET or GCS_BUCKET.' },
          { status: 503 }
        )
      }

      const formData = await request.formData()
      const file = formData.get('file')

      if (!file || typeof (file as any).arrayBuffer !== 'function') {
        return NextResponse.json({ error: 'Audio file is required' }, { status: 400 })
      }

      const fileObj = file as File

      if (fileObj.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json({ error: 'Audio file too large (max 50MB)' }, { status: 413 })
      }

      const mimeType = resolveMimeType(fileObj)
      if (!mimeType) {
        return NextResponse.json(
          { error: 'Unsupported audio format. Use MP3, WAV, M4A, OGG, or WEBM.' },
          { status: 400 }
        )
      }

      const safeName = sanitizeFileName(fileObj.name || 'audio')
      const ext = path.extname(safeName) || `.${mimeType.split('/')[1]}`
      const uuid = crypto.randomUUID()
      const storedName = `${path.basename(safeName, ext)}-${uuid}${ext}`
      const userId = session.user.id
      const key = `audio/${userId}/${storedName}`

      const bytes = Buffer.from(await fileObj.arrayBuffer())

      const bucketName =
        process.env.GCS_AUDIO_BUCKET || (isGcsConfigured() ? process.env.GCS_BUCKET : undefined)
      if (!bucketName) {
        return NextResponse.json({ error: 'Audio storage bucket not available' }, { status: 503 })
      }

      const { key: storedKey } = await uploadBuffer(bytes, key, mimeType, false, bucketName)
      const proxyUrl = `/api/proxy-file?key=${encodeURIComponent(storedKey)}`

      return NextResponse.json({
        url: proxyUrl,
        key: storedKey,
        name: fileObj.name,
        mimeType,
        size: fileObj.size,
      })
    } catch (err: any) {
      console.error('[uploads/audio] error:', err)
      return handleApiError(err, 'Failed to upload audio', 'api/uploads/audio/route.ts')
    }
  })
)
