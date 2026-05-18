/**
 * POST /api/student/assignments/[taskId]/upload
 *
 * Handles file uploads for essay/project type assignments.
 * Accepts: PDF, PNG, JPG, DOCX (max 10MB)
 * Stores files in GCS when configured, otherwise in persistent local storage.
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { getServerSession, authOptions } from '@/lib/auth'
import { getParamAsync } from '@/lib/api/params'
import { storeFile } from '@/lib/storage/service'
import { randomUUID } from 'crypto'

const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<Record<string, string | string[]>>
  }
) {
  const session = await getServerSession(authOptions, request)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const studentId = session.user.id
  const taskId = await getParamAsync(context.params, 'taskId')
  if (!taskId) {
    return NextResponse.json({ error: 'Task ID required' }, { status: 400 })
  }

  // Validate taskId format to prevent path traversal (should be UUID-like)
  if (!/^[a-zA-Z0-9\-_]+$/.test(taskId) || taskId.length > 100) {
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type not allowed. Accepted: PDF, PNG, JPG, DOCX` },
        { status: 400 }
      )
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: `File too large. Maximum size: 10MB` }, { status: 400 })
    }

    // Generate unique key
    const ext = file.name.slice(file.name.lastIndexOf('.')) || ''
    const safeName = file.name
      .replace(ext, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 50)
    const key = `submissions/${studentId}/${taskId}/${safeName}_${Date.now()}_${randomUUID().slice(0, 8)}${ext}`

    // Store via unified service (GCS or local)
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await storeFile(buffer, key, file.type)

    return NextResponse.json({
      success: true,
      file: {
        url: result.url,
        key: result.key,
        name: file.name,
        size: file.size,
        type: file.type,
        isLocal: result.isLocal,
      },
    })
  } catch (error) {
    console.error('File upload failed:', error)
    return handleApiError(
      error,
      'Upload failed',
      'api/student/assignments/[taskId]/upload/route.ts'
    )
  }
}
