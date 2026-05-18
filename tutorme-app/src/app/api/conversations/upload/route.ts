/**
 * File Upload API for Message Attachments
 * POST /api/conversations/upload
 *
 * Upload files to be attached to messages
 * Supports: images, documents, PDFs
 * Max file size: 10MB
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import { storeFile } from '@/lib/storage/service'
import crypto from 'crypto'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
}

export const POST = withAuth(async (req: NextRequest, session) => {
  const userId = session.user.id

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const ext = ALLOWED_TYPES[file.type]
    if (!ext) {
      return NextResponse.json(
        { error: 'File type not allowed', allowedTypes: Object.keys(ALLOWED_TYPES) },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large', maxSize: '10MB' }, { status: 400 })
    }

    // Generate unique key
    const fileHash = crypto.randomBytes(16).toString('hex')
    const fileName = `${fileHash}${ext}`
    const key = `messages/${userId}/${fileName}`

    // Store via unified service (GCS or local)
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const result = await storeFile(buffer, key, file.type)

    return NextResponse.json({
      success: true,
      file: {
        id: fileHash,
        name: file.name,
        url: result.url,
        key: result.key,
        type: file.type,
        size: file.size,
        isLocal: result.isLocal,
      },
    })
  } catch (error) {
    console.error('File upload error:', error)
    return handleApiError(error, 'Failed to upload file', 'api/conversations/upload/route.ts')
  }
})

// Get upload configuration
export const GET = withAuth(async () => {
  return NextResponse.json({
    maxFileSize: MAX_FILE_SIZE,
    allowedTypes: Object.keys(ALLOWED_TYPES),
  })
})
