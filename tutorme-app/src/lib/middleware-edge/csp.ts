/**
 * Build a strict Content-Security-Policy.
 *
 * CSP Directive Explanations:
 * - default-src 'self': Default to same-origin for all resource types
 * - script-src: Allows scripts from self, inline (nonce-based in future), and eval for Next.js
 * - style-src 'self' 'unsafe-inline': Allows inline styles (required by many UI libraries)
 * - img-src: Allows images from self, data URIs, blobs, and HTTPS
 * - font-src: Allows fonts from self and data URIs
 * - connect-src: Allows connections to self, HTTPS APIs, and WebSocket
 * - frame-src 'self': Allows framing of same-origin content only
 * - frame-ancestors 'self': Prevents clickjacking by only allowing same-origin framing
 * - base-uri 'self': Restricts base tag to same-origin
 * - form-action 'self': Restricts form submissions to same-origin
 * - object-src 'none': Disables Flash and other plugins
 *
 * TODO: Implement nonce-based CSP for inline scripts to remove 'unsafe-inline'
 * This requires generating nonces in middleware and passing to _document.tsx
 */
export function getCspHeader(): string {
  const isDev = process.env.NODE_ENV !== 'production'

  const directives = [
    "default-src 'self'",
    // 'unsafe-eval' is REQUIRED in production too: the Daily.co video SDK loads
    // its call-machine bundle and evaluates it (EvalError otherwise → video never
    // joins), and Daily serves that bundle from *.daily.co via a blob. Without
    // these, live video is fully broken. (Next.js dynamic imports also use eval.)
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.daily.co blob:",
    // 'unsafe-inline' for styles is widely used; allow Google Fonts stylesheets.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    // https:/wss: already cover Daily's API + signalling websockets.
    "connect-src 'self' https: wss:",
    // Camera/mic + screen-share tracks and Daily media arrive as blob: and
    // mediastream:; without media-src they'd fall back to default-src 'self'.
    "media-src 'self' blob: mediastream: https://*.daily.co",
    // Daily runs its call machine in blob-backed web workers.
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "frame-src 'self' https://*.daily.co https://*.dailyhq.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // Report violations to help identify issues
    'report-uri /api/csp-report',
  ]

  if (!isDev) {
    directives.push('upgrade-insecure-requests')
  }

  return directives.join('; ')
}
