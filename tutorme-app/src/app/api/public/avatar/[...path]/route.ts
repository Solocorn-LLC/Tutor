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

    // When GCS is configured it is the primary storage for avatars.
    // Check GCS first so that current uploads are served immediately
    // and stale DB entries never shadow them.
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
      // Ignore and continue to fallback storages.
    }

    // Fallback 1: database (used when GCS is not configured or file missing in GCS).
    // Validate the stored data so we never serve an empty / corrupted image.
    try {
      const row = await drizzleDb
        .select({ data: avatarStorage.data })
        .from(avatarStorage)
        .where(eq(avatarStorage.userId, userId))
        .limit(1)

      if (row[0]?.data) {
        const data = row[0].data.trim()
        if (data.length > 0) {
          let buffer: Buffer | null = null
          // If stored as a data URL, extract the base64 part
          if (data.startsWith('data:image/webp;base64,')) {
            const base64 = data.slice('data:image/webp;base64,'.length)
            buffer = Buffer.from(base64, 'base64')
          } else if (data.startsWith('data:')) {
            // Other data URL formats — extract after the comma
            const commaIndex = data.indexOf(',')
            if (commaIndex > 0) {
              const base64 = data.slice(commaIndex + 1)
              buffer = Buffer.from(base64, 'base64')
            }
          } else {
            // Raw base64 (legacy db entries)
            buffer = Buffer.from(data, 'base64')
          }

          if (buffer && buffer.length > 0) {
            return new NextResponse(new Uint8Array(buffer), {
              headers: {
                'Content-Type': 'image/webp',
                'Cache-Control': 'public, max-age=3600',
              },
            })
          }
        }
      }
    } catch (dbError) {
      console.warn('[public avatar] DB lookup failed:', dbError)
    }

    // Fallback 2: local filesystem (legacy / development)
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

    return new NextResponse('File not found', { status: 404 })
  } catch (error) {
    console.error('[public avatar] Error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
