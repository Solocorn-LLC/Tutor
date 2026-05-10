import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import os from 'os'
import { eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { avatarStorage } from '@/lib/db/schema'

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

    const userId = pathSegments[0]

    // 1. Check database first (persistent storage for Cloud Run / ephemeral fs)
    try {
      const row = await drizzleDb
        .select({ data: avatarStorage.data })
        .from(avatarStorage)
        .where(eq(avatarStorage.userId, userId))
        .limit(1)

      if (row[0]?.data) {
        const data = row[0].data
        // If stored as a data URL, extract the base64 part
        if (data.startsWith('data:image/webp;base64,')) {
          const base64 = data.slice('data:image/webp;base64,'.length)
          const buffer = Buffer.from(base64, 'base64')
          return new NextResponse(buffer, {
            headers: {
              'Content-Type': 'image/webp',
              'Cache-Control': 'public, max-age=3600',
            },
          })
        }
        // If stored as raw base64 (legacy db entries)
        const buffer = Buffer.from(data, 'base64')
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      }
    } catch (dbError) {
      console.warn('[public avatar] DB lookup failed:', dbError)
    }

    // 2. Fallback to local filesystem (legacy / development)
    const relativePath = pathSegments.join(path.sep)
    const candidates = [
      path.join(os.tmpdir(), 'tutorme_uploads', 'avatars', relativePath),
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

    // 3. Fallback to GCS
    try {
      const { isGcsConfigured, downloadBuffer } = await import('@/lib/storage/gcs')
      if (isGcsConfigured()) {
        const gcsKey = `avatars/${pathSegments.join('/')}`
        const data = await downloadBuffer(gcsKey)
        if (data) {
          const body = new Uint8Array(data)
          return new NextResponse(body, {
            headers: {
              'Content-Type': getContentType(gcsKey),
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          })
        }
      }
    } catch {
      // Ignore and fall through.
    }

    return new NextResponse('File not found', { status: 404 })
  } catch (error) {
    console.error('[public avatar] Error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
