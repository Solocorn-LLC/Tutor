/**
 * POST /api/tutor/resources/upload-proxy
 *
 * Server-side upload proxy. Stores files in GCS when configured,
 * otherwise falls back to persistent local storage.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import { inferResourceType, generateResourceKey } from '@/lib/storage/gcs'
import { storeFile } from '@/lib/storage/service'
import { validateFileUpload } from '@/lib/security/file-upload'

const MAX_SIZE = 100 * 1024 * 1024 // 100MB

// Allowed MIME types for resources
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/zip',
]

export const POST = withAuth(
  async (req: NextRequest, session) => {
    const tutorId = session.user.id

    try {
      const formData = await req.formData()
      const file = formData.get('file') as File | null

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }

      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: 'File exceeds 100MB limit' }, { status: 400 })
      }

      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `File type '${file.type}' is not allowed` },
          { status: 400 }
        )
      }

      // Validate filename to prevent path traversal
      const validation = validateFileUpload(file.name, file.size, MAX_SIZE)
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }

      const key = generateResourceKey(tutorId, validation.sanitizedName)
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await storeFile(buffer, key, file.type)
      const type = inferResourceType(file.type)

      return NextResponse.json({
        success: true,
        url: result.url,
        key: result.key,
        type,
        isLocal: result.isLocal,
      })
    } catch (error) {
      console.error('[upload-proxy] Error:', error)
      return handleApiError(error, 'Upload failed', 'api/tutor/resources/upload-proxy/route.ts')
    }
  },
  { role: 'TUTOR' }
)
