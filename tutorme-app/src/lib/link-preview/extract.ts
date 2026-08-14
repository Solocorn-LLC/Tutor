import { isIP } from 'node:net'
import { isValidPreviewUrl } from './detect-urls'
import type { LinkPreviewMetadata } from './types'

const MAX_REDIRECTS = 5
const FETCH_TIMEOUT_MS = 5000
const MAX_BODY_BYTES = 5 * 1024 * 1024 // 5 MB

const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'])

const BLOCKED_HOSTNAME_SUFFIXES = ['.local', '.internal', '.localhost']

const BLOCKED_CONTENT_KEYWORDS = [
  'porn',
  'xxx',
  'sex',
  'adult',
  'casino',
  'gambling',
  'betting',
  'warez',
  'crack',
  'keygen',
]

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) {
    return false
  }
  const [a, b, c] = parts
  if (a === 127) return true
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 0) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::1') return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // fc00::/7
  if (lower.startsWith('fe80:')) return true
  return false
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(lower)) return true
  if (BLOCKED_HOSTNAME_SUFFIXES.some(suffix => lower.endsWith(suffix))) return true
  return false
}

function isBlockedHost(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return true
  }
  const hostname = parsed.hostname
  if (isBlockedHostname(hostname)) return true
  const ipVersion = isIP(hostname)
  if (ipVersion === 4) return isPrivateIpv4(hostname)
  if (ipVersion === 6) return isPrivateIpv6(hostname)
  // Hostname without a dot looks internal.
  if (!hostname.includes('.')) return true
  return false
}

function isBlockedContent(text: string): boolean {
  const lower = text.toLowerCase()
  return BLOCKED_CONTENT_KEYWORDS.some(kw => lower.includes(kw))
}

function resolveUrl(base: string, relative: string): string {
  try {
    return new URL(relative, base).href
  } catch {
    return relative
  }
}

function sanitizeText(text: string | undefined): string | undefined {
  if (!text) return undefined
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length === 0) return undefined
  return trimmed.slice(0, 500)
}

function getFileTypeFromContentType(contentType: string): string | undefined {
  const type = contentType.split(';')[0]?.trim().toLowerCase()
  if (!type) return undefined
  if (type.startsWith('application/pdf')) return 'PDF'
  if (type.startsWith('image/')) return 'Image'
  if (type.startsWith('video/')) return 'Video'
  if (type.startsWith('audio/')) return 'Audio'
  if (type.includes('zip') || type.includes('compressed')) return 'Archive'
  if (type.includes('json')) return 'JSON'
  if (type.includes('xml')) return 'XML'
  if (type.startsWith('text/')) {
    const parts = type.split('/')
    return parts[1] ? parts[1].toUpperCase() : 'Document'
  }
  return type
}

function getFileTypeFromPath(pathname: string): string | undefined {
  const ext = pathname.split('.').pop()?.toLowerCase()
  if (!ext) return undefined
  const map: Record<string, string> = {
    pdf: 'PDF',
    jpg: 'Image',
    jpeg: 'Image',
    png: 'Image',
    gif: 'Image',
    webp: 'Image',
    svg: 'Image',
    mp4: 'Video',
    webm: 'Video',
    mov: 'Video',
    mp3: 'Audio',
    wav: 'Audio',
    zip: 'Archive',
    rar: 'Archive',
    '7z': 'Archive',
    json: 'JSON',
    xml: 'XML',
    txt: 'Text',
    doc: 'Document',
    docx: 'Document',
  }
  return map[ext]
}

function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return true
  return contentType.toLowerCase().includes('text/html')
}

function isFileContentType(contentType: string | null): boolean {
  if (!contentType) return false
  const lower = contentType.toLowerCase()
  if (lower.startsWith('image/')) return true
  if (lower.startsWith('video/')) return true
  if (lower.startsWith('audio/')) return true
  if (lower.includes('application/')) return true
  if (lower.includes('text/plain')) return true
  return false
}

function extractMeta(html: string, finalUrl: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? sanitizeText(titleMatch[1]) : undefined

  const metaTags: Record<string, string> = {}
  const metaRegex =
    /<meta[^>]*(?:property|name)=["']([^"']+)["'][^>]*content=["']([^"']*)["']|<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']([^"']+)["']/gi
  let match: RegExpExecArray | null
  while ((match = metaRegex.exec(html)) !== null) {
    const key = (match[1] || match[4] || '').toLowerCase()
    const value = match[2] ?? match[3] ?? ''
    if (key && value) metaTags[key] = value
  }

  const description = sanitizeText(metaTags['og:description'] || metaTags['description'])
  const ogTitle = sanitizeText(metaTags['og:title'])
  const ogImage = metaTags['og:image'] ? resolveUrl(finalUrl, metaTags['og:image']) : undefined
  const ogSiteName = sanitizeText(metaTags['og:site_name'])

  const faviconRegex =
    /<link[^>]*rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["']|<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut icon|icon|apple-touch-icon)["']/gi
  let favicon: string | undefined
  let favMatch: RegExpExecArray | null
  while ((favMatch = faviconRegex.exec(html)) !== null) {
    const href = favMatch[1] || favMatch[2]
    if (href) {
      favicon = resolveUrl(finalUrl, href)
      break
    }
  }
  if (!favicon) {
    try {
      favicon = new URL('/favicon.ico', finalUrl).href
    } catch {
      // ignore
    }
  }

  return {
    title: ogTitle || title,
    description,
    imageUrl: ogImage,
    faviconUrl: favicon,
    siteName: ogSiteName,
  }
}

export function extractYoutubeVideoId(inputUrl: string): string | undefined {
  try {
    const parsed = new URL(inputUrl)
    const hostname = parsed.hostname.replace(/^(www\.|m\.)/, '')

    if (hostname === 'youtube.com' || hostname === 'music.youtube.com') {
      if (parsed.pathname.startsWith('/watch')) {
        return parsed.searchParams.get('v') || undefined
      }
      const liveMatch = parsed.pathname.match(/^\/live\/([a-zA-Z0-9_-]+)/)
      if (liveMatch) return liveMatch[1]
      const embedMatch = parsed.pathname.match(/^\/embed\/([a-zA-Z0-9_-]+)/)
      if (embedMatch) return embedMatch[1]
      const shortsMatch = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/)
      if (shortsMatch) return shortsMatch[1]
      const vMatch = parsed.pathname.match(/^\/v\/([a-zA-Z0-9_-]+)/)
      if (vMatch) return vMatch[1]
    }

    if (hostname === 'youtu.be') {
      const match = parsed.pathname.match(/^\/([a-zA-Z0-9_-]+)/)
      return match ? match[1] : undefined
    }
  } catch {
    // ignore malformed URLs
  }
  return undefined
}

function getYoutubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

type YoutubeOEmbedResponse = {
  title?: string
  author_name?: string
  author_url?: string
  type?: string
  provider_name?: string
  provider_url?: string
  thumbnail_url?: string
  thumbnail_width?: number
  thumbnail_height?: number
  html?: string
  width?: number
  height?: number
  version?: string
}

function isYoutubeUrl(inputUrl: string): boolean {
  return extractYoutubeVideoId(inputUrl) !== undefined
}

async function fetchYoutubeOEmbed(url: string): Promise<LinkPreviewMetadata> {
  const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
  const response = await fetchWithRedirects(oEmbedUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TutorBot/1.0; +https://tutorme.com)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`YouTube oEmbed error ${response.status}`)
  }

  const data = (await response.json()) as YoutubeOEmbedResponse
  const videoId = extractYoutubeVideoId(url)

  return {
    url,
    title: data.title || (videoId ? 'YouTube video' : 'YouTube'),
    description: data.author_name || undefined,
    imageUrl: data.thumbnail_url || (videoId ? getYoutubeThumbnailUrl(videoId) : undefined),
    faviconUrl: undefined,
    siteName: data.provider_name || 'YouTube',
    contentType: response.headers.get('content-type') || 'application/json',
    isFile: false,
    fileName: undefined,
    fileType: undefined,
  }
}

async function fetchWithRedirects(
  url: string,
  options: RequestInit,
  depth = 0
): Promise<Response & { finalUrl: string }> {
  if (depth > MAX_REDIRECTS) {
    throw new Error('Too many redirects')
  }
  if (isBlockedHost(url)) {
    throw new Error('URL is not allowed')
  }

  const response = await fetch(url, options)
  const status = response.status

  if ([301, 302, 303, 307, 308].includes(status)) {
    const location = response.headers.get('location')
    if (!location) {
      throw new Error('Redirect without location header')
    }
    const nextUrl = resolveUrl(url, location)
    return fetchWithRedirects(nextUrl, options, depth + 1)
  }

  return Object.assign(response, { finalUrl: url })
}

export async function fetchLinkPreview(url: string): Promise<LinkPreviewMetadata> {
  if (!isValidPreviewUrl(url)) {
    throw new Error('Invalid URL')
  }

  if (isBlockedHost(url)) {
    throw new Error('URL is not allowed')
  }

  // YouTube pages are huge and often exceed our body limit. Use the lightweight
  // oEmbed API to get title, author, and thumbnail without parsing HTML.
  if (isYoutubeUrl(url)) {
    try {
      return await fetchYoutubeOEmbed(url)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'YouTube preview failed'
      throw new Error(message)
    }
  }

  let response: Response & { finalUrl: string }
  try {
    response = await fetchWithRedirects(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TutorBot/1.0; +https://tutorme.com)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Request timed out')
    }
    throw error
  }

  const finalUrl = response.finalUrl
  const contentType = response.headers.get('content-type') || ''

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`)
  }

  const urlObj = new URL(finalUrl)
  const fileName = urlObj.pathname.split('/').pop() || undefined

  // If the response points directly to a file, return file metadata without parsing HTML.
  if (isFileContentType(contentType) || !isHtmlContentType(contentType)) {
    const fileType = getFileTypeFromContentType(contentType) || getFileTypeFromPath(urlObj.pathname)
    const isImage = contentType.toLowerCase().startsWith('image/') || fileType === 'Image'
    return {
      url: finalUrl,
      title: fileName || fileType || 'File',
      description: fileType ? `${fileType} file` : undefined,
      imageUrl: isImage ? finalUrl : undefined,
      faviconUrl: undefined,
      siteName: urlObj.hostname,
      contentType,
      isFile: true,
      fileName,
      fileType,
    }
  }

  let html: string
  try {
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > MAX_BODY_BYTES) {
      throw new Error('Response body too large')
    }
    html = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Failed to read response body'
    throw new Error(reason)
  }

  if (isBlockedContent(html)) {
    throw new Error('Content not allowed')
  }

  const meta = extractMeta(html, finalUrl)
  const videoId = extractYoutubeVideoId(finalUrl)

  return {
    url: finalUrl,
    title: meta.title,
    description: meta.description,
    imageUrl: meta.imageUrl || (videoId ? getYoutubeThumbnailUrl(videoId) : undefined),
    faviconUrl: meta.faviconUrl,
    siteName: meta.siteName || (videoId ? 'YouTube' : undefined),
    contentType,
    isFile: false,
    fileName,
    fileType: undefined,
  }
}
