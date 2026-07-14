/**
 * READ-ONLY audit for document URLs that will expire, complementing the
 * durability fix in #1030.
 *
 * The app displays every stored document through the same-origin by-key proxy,
 * which streams via the service account (no signature, no TTL). It can serve by
 * key from either a stored `fileKey` OR a key recovered from a path-style GCS
 * URL (`storage.googleapis.com/<bucket>/<key>`). A document only truly expires
 * when it has a `fileUrl`, no usable `fileKey`, AND no recoverable key — a bare
 * or virtual-hosted signed URL with nothing to re-sign from.
 *
 * This scans every doc-bearing surface (TutorAsset flat columns,
 * CourseLesson.builderData JSONB, DeployedMaterial.content JSONB), classifies
 * each URL with the SAME helpers the display layer uses (so the audit can never
 * drift from reality), and reports the AT-RISK set.
 *
 * Makes NO writes (pure SELECT). Run against the target database:
 *   DATABASE_URL=... npx tsx src/scripts/audit-expiring-doc-urls.ts
 */

import { isNotNull } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { tutorAsset, courseLesson, deployedMaterial } from '@/lib/db/schema'
import { isProxyableKey, extractStorageKeyFromUrl } from '@/lib/storage/doc-url'

export type Verdict =
  | 'has-fileKey' // durable: stored key streams by-key
  | 'resignable-url' // durable: key recovered from a path-style GCS URL
  | 'durable-proxy' // durable: already a same-origin proxy / serve-upload URL
  | 'transient' // no url, or blob:/data: (uploader-only, not a persistence risk)
  | 'AT-RISK' // has a fileUrl but no usable/recoverable key — expires at TTL

/** Classify one document by the durability outcome the display resolver produces. */
export function classifyDocUrl(fileUrl: unknown, fileKey: unknown): Verdict {
  if (isProxyableKey(typeof fileKey === 'string' ? fileKey : undefined)) return 'has-fileKey'
  if (typeof fileUrl !== 'string' || fileUrl.length === 0) return 'transient'
  if (fileUrl.startsWith('blob:') || fileUrl.startsWith('data:')) return 'transient'
  if (fileUrl.startsWith('/')) return 'durable-proxy'
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    return isProxyableKey(extractStorageKeyFromUrl(fileUrl)) ? 'resignable-url' : 'AT-RISK'
  }
  return 'transient'
}

export interface DocUrlHit {
  source: string
  rowId: string
  path: string
  host: string
  verdict: Verdict
}

/** Recursively collect every node carrying a fileUrl/url string. */
function walk(obj: unknown, source: string, rowId: string, path: string, out: DocUrlHit[]): void {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, source, rowId, `${path}[${i}]`, out))
    return
  }
  const rec = obj as Record<string, unknown>
  const url = rec.fileUrl ?? rec.url
  if (typeof url === 'string' && url.length > 0) {
    let host = url.slice(0, 24)
    try {
      host = new URL(url).hostname || host
    } catch {
      /* relative or non-URL — keep the prefix */
    }
    out.push({
      source,
      rowId,
      path: path || '(root)',
      host,
      verdict: classifyDocUrl(url, rec.fileKey),
    })
  }
  for (const [k, v] of Object.entries(rec)) {
    if (v && typeof v === 'object') walk(v, source, rowId, path ? `${path}.${k}` : k, out)
  }
}

/** Scan all doc-bearing surfaces and return every document-URL node found. */
export async function auditExpiringDocUrls(): Promise<DocUrlHit[]> {
  const hits: DocUrlHit[] = []

  const assets = await drizzleDb
    .select({ id: tutorAsset.assetId, url: tutorAsset.url, fileKey: tutorAsset.fileKey })
    .from(tutorAsset)
    .where(isNotNull(tutorAsset.url))
  for (const r of assets) {
    walk({ fileUrl: r.url, fileKey: r.fileKey }, 'TutorAsset', r.id, '', hits)
  }

  const lessons = await drizzleDb
    .select({ id: courseLesson.lessonId, builderData: courseLesson.builderData })
    .from(courseLesson)
    .where(isNotNull(courseLesson.builderData))
  for (const r of lessons) walk(r.builderData, 'CourseLesson.builderData', r.id, '', hits)

  const mats = await drizzleDb
    .select({ id: deployedMaterial.id, content: deployedMaterial.content })
    .from(deployedMaterial)
    .where(isNotNull(deployedMaterial.content))
  for (const r of mats) walk(r.content, 'DeployedMaterial.content', r.id, '', hits)

  return hits
}

if (require.main === module) {
  auditExpiringDocUrls()
    .then(hits => {
      const bySource: Record<string, Record<Verdict, number>> = {}
      for (const h of hits) {
        bySource[h.source] ??= {
          'has-fileKey': 0,
          'resignable-url': 0,
          'durable-proxy': 0,
          transient: 0,
          'AT-RISK': 0,
        }
        bySource[h.source][h.verdict]++
      }

      console.log(`\nScanned ${hits.length} document-URL node(s) across 3 sources.\n`)
      for (const [src, counts] of Object.entries(bySource)) {
        console.log(`  ${src}`)
        for (const [v, n] of Object.entries(counts)) if (n) console.log(`    ${v.padEnd(16)} ${n}`)
      }

      const atRisk = hits.filter(h => h.verdict === 'AT-RISK')
      console.log(`\n${'='.repeat(60)}`)
      if (atRisk.length === 0) {
        console.log('✓ 0 at-risk docs. Every fileUrl is durable (stored key, URL-')
        console.log('  recoverable key, same-origin proxy) or transient. No expiry risk.')
      } else {
        console.log(`⚠️  ${atRisk.length} AT-RISK doc URL(s): no usable/recoverable key.`)
        const byHost: Record<string, number> = {}
        for (const h of atRisk) byHost[h.host] = (byHost[h.host] || 0) + 1
        console.log('  host breakdown:', byHost)
        console.log('')
        for (const h of atRisk.slice(0, 25)) {
          console.log(`  ${h.source}  id=${h.rowId}  @ ${h.path}  host=${h.host}`)
        }
        if (atRisk.length > 25) console.log(`  … and ${atRisk.length - 25} more`)
      }
      console.log('='.repeat(60) + '\n')
      return process.exit(0)
    })
    .catch(err => {
      console.error('audit failed:', err)
      process.exit(1)
    })
}
