import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import os from 'os'

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.webp') return 'image/webp'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

function sanitizeSegments(input: string[]): string[] {
  return input.filter(Boolean).filter(seg => !seg.includes('..') && !seg.includes('\\'))
}

export async function GET(_req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const params = await context.params
    const pathSegments = sanitizeSegments(params.path ?? [])
    if (pathSegments.length < 2) {
      return new NextResponse('Invalid path', { status: 400 })
    }

    const relativePath = pathSegments.join(path.sep)
    const candidates = [
      // New fallback location used by saveAvatar.
      path.join(os.tmpdir(), 'tutorme_uploads', 'avatars', relativePath),
      // Legacy location used by older avatar uploads.
      path.join(process.cwd(), 'public', 'uploads', 'avatars', relativePath),
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
    console.error('[public avatar] Error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

