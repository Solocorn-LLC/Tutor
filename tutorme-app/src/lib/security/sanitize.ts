/**
 * XSS prevention: sanitize user input before rendering or storing.
 * Pure-JS implementation — no DOM library dependency so it works safely
 * in both Next.js client bundles and webpack-bundled server code.
 */

// Tags that are safe to keep (basic formatting only)
const ALLOWED_TAGS = new Set([
  'b',
  'i',
  'em',
  'strong',
  'a',
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'span',
  'div',
])

// Attributes allowed on <a>
const ALLOWED_ATTRS_A = new Set(['href', 'target', 'rel', 'class'])
// Attributes allowed on all other safe tags
const ALLOWED_ATTRS_GENERAL = new Set(['class'])

const JS_PROTOCOL_REGEX = /javascript:/gi
const DATA_PROTOCOL_REGEX = /data:/gi

/**
 * Extract allowed attributes from a raw attribute string and rebuild them.
 */
function rebuildAttrs(rawAttrs: string, allowedSet: Set<string>): string {
  const attrs: string[] = []
  // Match attr="value" or attr='value'
  const quoted = /\s([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*["']([^"']*)["']/gi
  let m: RegExpExecArray | null
  while ((m = quoted.exec(rawAttrs)) !== null) {
    const name = m[1].toLowerCase()
    if (allowedSet.has(name)) {
      let value = m[2]
      if (name === 'href') {
        value = value.replace(JS_PROTOCOL_REGEX, '').replace(DATA_PROTOCOL_REGEX, '')
      }
      attrs.push(`${name}="${value}"`)
    }
  }
  return attrs.length ? ' ' + attrs.join(' ') : ''
}

/**
 * Sanitize HTML by stripping dangerous tags/attributes and allowing a safe
 * subset of formatting tags.  Operates entirely with string replacements so
 * it is safe to import in both client components and API routes.
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') return ''

  // Strip dangerous protocols from raw text
  let text = input.replace(JS_PROTOCOL_REGEX, '').replace(DATA_PROTOCOL_REGEX, '')

  // Remove event-handler attributes from every tag first
  text = text.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
  text = text.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '')

  // Process each HTML tag
  return text.replace(
    /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g,
    (match, slash, tagName, rawAttrs) => {
      const lowerTag = tagName.toLowerCase()

      // Disallowed tag → drop the tag wrapper (text between open/close remains)
      if (!ALLOWED_TAGS.has(lowerTag)) {
        return ''
      }

      // Closing tag
      if (slash) {
        return `</${lowerTag}>`
      }

      // Self-closing
      if (lowerTag === 'br') {
        return '<br />'
      }

      // Opening tag: rebuild with only safe attributes
      if (lowerTag === 'a') {
        return `<a${rebuildAttrs(rawAttrs, ALLOWED_ATTRS_A)}>`
      }

      return `<${lowerTag}${rebuildAttrs(rawAttrs, ALLOWED_ATTRS_GENERAL)}>`
    }
  )
}

/**
 * Sanitize and optionally truncate to a max length (for DB/store).
 */
export function sanitizeHtmlWithMax(input: string, maxLength: number = 50_000): string {
  const s = sanitizeHtml(input)
  if (s.length <= maxLength) return s
  return s.slice(0, maxLength)
}

/**
 * Escape HTML entities so the string is safe for use in text nodes or attributes.
 */
export function escapeHtml(input: string): string {
  if (typeof input !== 'string') return ''
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
  }
  return input.replace(/[&<>"'/]/g, c => map[c] ?? c)
}

/**
 * Sanitize for display in a context where only safe text is allowed (e.g. profile name, bio).
 * Prefer escapeHtml when rendering in React (React escapes by default); use this for legacy or raw HTML.
 */
export function sanitizeForDisplay(input: string): string {
  return escapeHtml(sanitizeHtml(input))
}
