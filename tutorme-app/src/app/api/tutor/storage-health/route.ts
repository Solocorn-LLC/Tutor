/**
 * GET /api/tutor/storage-health
 *
 * One-shot diagnostic for document storage. It exercises the exact operations
 * the builder relies on and reports which succeed, so a "Failed to fetch PDF" /
 * "Document not found in storage" incident can be pinned to config in seconds:
 *
 *   1. write      — upload a tiny object to the tutor's documents/ prefix
 *   2. readByKey  — download it back by key (service-account read; the resilient path)
 *   3. signedUrl  — mint a presigned URL and fetch it (exercises iam signBlob)
 *   4. cleanup    — delete the test object
 *
 * If `signedUrl` fails while `readByKey` succeeds, the deploy is missing
 * `iam.serviceAccounts.signBlob` — signed URLs then fall back to public URLs that
 * 403 under uniform bucket-level access (the by-key path is the workaround). If
 * `readByKey` fails too, the object isn't persisting (bucket / creds problem).
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/middleware'
import type { Session } from 'next-auth'
import {
  isGcsConfigured,
  uploadBuffer,
  downloadBuffer,
  createPresignedDownloadUrl,
  deleteObject,
} from '@/lib/storage/gcs'

export const runtime = 'nodejs'

interface StepResult {
  ok: boolean
  detail?: string
}

export const GET = withAuth(async (_request: NextRequest, session: Session) => {
  if (!isGcsConfigured()) {
    return NextResponse.json({
      gcsConfigured: false,
      note: 'GCS is not configured — uploads use the local-disk fallback, which is per-instance and ephemeral on Cloud Run (cross-instance reads fail). Set the GCS bucket + service-account credentials.',
    })
  }

  const key = `documents/${session.user.id}/_healthcheck-${Date.now()}.txt`
  const payload = Buffer.from(`storage-health ${new Date().toISOString()}`, 'utf8')
  const steps: Record<string, StepResult> = {}

  // 1. write
  try {
    await uploadBuffer(payload, key, 'text/plain', false)
    steps.write = { ok: true }
  } catch (err) {
    steps.write = { ok: false, detail: err instanceof Error ? err.message : String(err) }
    return NextResponse.json({ gcsConfigured: true, healthy: false, steps }, { status: 200 })
  }

  // 2. readByKey (service-account read — the path the builder falls back to)
  try {
    const buf = await downloadBuffer(key)
    steps.readByKey = buf?.equals(payload)
      ? { ok: true }
      : { ok: false, detail: buf ? 'content mismatch' : 'object not found after write' }
  } catch (err) {
    steps.readByKey = { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }

  // 3. signedUrl round-trip (exercises signBlob)
  try {
    const url = await createPresignedDownloadUrl(key, 300)
    const res = await fetch(url)
    steps.signedUrl = res.ok
      ? { ok: true }
      : {
          ok: false,
          detail: `fetch returned ${res.status} (signed URL may have fallen back to a public URL — check signBlob)`,
        }
  } catch (err) {
    steps.signedUrl = { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }

  // 4. cleanup (best-effort)
  try {
    await deleteObject(key)
    steps.cleanup = { ok: true }
  } catch (err) {
    steps.cleanup = { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }

  const healthy = steps.write.ok && steps.readByKey.ok && steps.signedUrl.ok
  return NextResponse.json({ gcsConfigured: true, healthy, steps })
})
