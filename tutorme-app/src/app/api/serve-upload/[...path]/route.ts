import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import os from 'os'
import { withAuth } from '@/lib/api/middleware'
import { canReadUploadKey } from '@/lib/security/upload-access'

const LOCAL_STORAGE_DIR =
  process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), '.local-storage')

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.webm') return 'video/webm'
  if (ext === '.mp4') return 'video/mp4'
  if (ext === '.doc') return 'application/msword'
  if (ext === '.docx')
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (ext === '.xls') return 'application/vnd.ms-excel'
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (ext === '.ppt') return 'application/vnd.ms-powerpoint'
  if (ext === '.pptx')
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  if (ext === '.txt') return 'text/plain'
  return 'application/octet-stream'
}

export const GET = withAuth(async (request: NextRequest, session: any, context: any) => {
  try {
    const params = await context.params
    const pathSegments = params.path as string[]
    if (!pathSegments || pathSegments.length === 0) {
      return new NextResponse('Invalid path', { status: 400 })
    }

    // Prevent directory traversal attacks
    if (pathSegments.some(segment => segment.includes('..') || segment.includes('/'))) {
      return new NextResponse('Invalid path', { status: 400 })
    }

    // Authorize access based on the upload key convention (default-deny)
    if (!(await canReadUploadKey(session, pathSegments))) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    const relativePath = pathSegments.join(path.sep)

    // Try persistent local storage first
    const candidates = [
      path.join(LOCAL_STORAGE_DIR, relativePath),
      // Legacy fallback: old tmp directory (for files uploaded before migration)
      path.join(os.tmpdir(), 'tutorme_uploads', ...pathSegments),
    ]

    for (const filePath of candidates) {
      try {
        const data = await readFile(filePath)
        return new NextResponse(data, {
          headers: {
            'Content-Type': getContentType(filePath),
            'Cache-Control': 'public, max-age=3600',
          },
        })
      } catch {
        // Try next candidate.
      }
    }

    return new NextResponse('File not found', { status: 404 })
  } catch (error) {
    console.error('[serve-upload] Error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
})
