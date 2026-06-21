/**
 * GET /api/public/avatars
 *
 * Lists the preset avatars students can choose from. Public (under /api/public,
 * so reachable before login — e.g. during registration/onboarding). Reads
 * `public/avatars/` at request time, so dropping a new image into that folder
 * (and deploying) makes it available immediately — no code change required.
 */

import { NextResponse } from 'next/server'
import { readdir } from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i

export async function GET() {
  try {
    const dir = path.join(process.cwd(), 'public', 'avatars')
    const files = await readdir(dir)
    const avatars = files
      .filter(f => IMAGE_EXT.test(f))
      // Natural sort so avatar-2 comes before avatar-10.
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .map(f => ({
        name: f.replace(/\.[^.]+$/, ''),
        url: `/avatars/${f}`,
      }))
    return NextResponse.json({ avatars })
  } catch {
    // Folder missing / unreadable — return an empty gallery rather than erroring.
    return NextResponse.json({ avatars: [] })
  }
}
