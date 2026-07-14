/**
 * Durable document URL resolution — client-safe (no server-only imports, so it
 * can run in browser components).
 *
 * Stored documents must NEVER be displayed via a raw GCS signed URL: those carry
 * a TTL and die (users see "document unavailable" days later). Instead every doc
 * is served through the same-origin by-key proxy (`/api/proxy-file?key=…`), which
 * streams the object with the service account's read access — no signature, no
 * expiry.
 *
 * The important trick: we can serve by key even when a `fileKey` was never
 * persisted, by recovering the object key from a path-style GCS URL. That makes
 * legacy documents (uploaded before `fileKey` was stored) durable without any
 * data backfill.
 *
 * Keep this file free of `@google-cloud/storage` / node imports.
 */

/** Object-key prefixes the by-key proxy is allowed to stream (mirror of the
 *  allowlist in src/app/api/proxy-file/route.ts). */
export const PROXYABLE_KEY_PREFIXES = ['documents', 'assets', 'resources', 'messages'] as const

const PROXYABLE_KEY_RE = new RegExp(`^(?:${PROXYABLE_KEY_PREFIXES.join('|')})/`)

/** True when `key` is a safe, proxyable object key (known prefix, no traversal). */
export function isProxyableKey(key: string | null | undefined): key is string {
  return (
    typeof key === 'string' && key.length > 0 && !key.includes('..') && PROXYABLE_KEY_RE.test(key)
  )
}

/**
 * Recover the GCS object key from a path-style public/presigned GCS URL
 * (`https://storage.googleapis.com/<bucket>/<key>?…`). Query params (the
 * signature) are dropped. Returns null for any non-GCS or virtual-hosted URL.
 *
 * Mirror of extractGcsKeyFromPublicUrl in src/lib/storage/gcs.ts — duplicated
 * here so this module stays client-safe.
 */
export function extractStorageKeyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'storage.googleapis.com') return null
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    if (pathParts.length < 2) return null
    return pathParts.slice(1).join('/') // drop the bucket segment
  } catch {
    return null
  }
}

export interface DocSource {
  fileUrl?: string | null
  fileKey?: string | null
}

/**
 * Resolve a document to a durable, same-origin display URL.
 *
 * Order of preference:
 *  1. Stored `fileKey`      → `/api/proxy-file?key=…`   (durable, no expiry)
 *  2. Key recovered from a  → `/api/proxy-file?key=…`   (durable; rescues docs
 *     path-style GCS URL                                  saved without a key)
 *  3. Already a same-origin proxy / API URL → returned unchanged (already durable)
 *  4. Foreign http(s) URL   → `/api/proxy-file?url=…`   (server re-signs GCS /
 *                                                         streams; best effort)
 *  5. blob:/data:/relative  → returned unchanged (transient or already local)
 *
 * Returns '' when there is nothing displayable.
 */
export function resolveDocDisplayUrl(source: DocSource | null | undefined): string {
  if (!source) return ''
  const fileKey = source.fileKey ?? undefined
  const fileUrl = source.fileUrl ?? ''

  // 1. Stored key.
  if (isProxyableKey(fileKey)) {
    return `/api/proxy-file?key=${encodeURIComponent(fileKey)}`
  }

  if (!fileUrl) return ''

  // 5a. Already same-origin (proxy, serve-upload, or any relative URL) — durable
  //     or local already; don't wrap it again.
  if (fileUrl.startsWith('/')) return fileUrl
  // 5b. Transient client-only URLs — only resolve in the uploader's own browser.
  if (fileUrl.startsWith('blob:') || fileUrl.startsWith('data:')) return fileUrl

  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    // 2. Recover the key from a path-style GCS URL → stream by key (durable).
    const recovered = extractStorageKeyFromUrl(fileUrl)
    if (isProxyableKey(recovered)) {
      return `/api/proxy-file?key=${encodeURIComponent(recovered)}`
    }
    // 4. Foreign URL — let the server refresh/stream it.
    return `/api/proxy-file?url=${encodeURIComponent(fileUrl)}`
  }

  return fileUrl
}

/**
 * Whether a document can actually be shown to a viewer other than its uploader.
 * A blob:/data: URL only resolves in the browser that created it, and an empty
 * URL never reached storage — both are unavailable elsewhere.
 */
export function isDocDisplayable(source: DocSource | null | undefined): boolean {
  if (!source) return false
  if (isProxyableKey(source.fileKey ?? undefined)) return true
  const url = source.fileUrl ?? ''
  return url.length > 0 && !url.startsWith('blob:') && !url.startsWith('data:')
}
