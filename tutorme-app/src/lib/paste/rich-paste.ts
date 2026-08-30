import { sanitizeSlideHtml } from '@/app/[locale]/tutor/dashboard/components/sanitize-slide-html'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'

interface PasteEventLike {
  preventDefault(): void
  clipboardData: DataTransfer | null
}

export interface RichPasteHandlers {
  /** One or more image files were pasted. The handler uploads/inserts them. */
  onImage?: (file: File) => void | Promise<void>
  /** A pasted HTML table (sanitized). */
  onTable?: (html: string) => void
  /** A pasted LaTeX formula rendered to SVG. */
  onFormula?: (svg: string) => void | Promise<void>
  /** Other pasted HTML (sanitized). Only used when no table/image/svg is found. */
  onHtml?: (html: string) => void
  /** Plain text fallback. */
  onText?: (text: string) => void
  /**
   * Optional image uploader used when pasted HTML contains inline images whose
   * src is not already a safe persistent URL (e.g. data: or blob: URIs).
   * Returns the uploaded URL and, when available, the durable storage key.
   * The URL replaces the original src and the key is stored as data-file-key
   * so the image can be re-streamed after the signed URL expires.
   */
  onUploadImage?: (src: string) => Promise<{ url: string; key?: string }>
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function extractImageFiles(dataTransfer: DataTransfer): File[] {
  const files: File[] = []
  if (dataTransfer.files) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i]
      if (file.type.startsWith('image/')) files.push(file)
    }
  }
  if (files.length === 0 && dataTransfer.items) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i]
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
  }
  return files
}

export function extractFirstTable(html: string): string | null {
  if (typeof document === 'undefined') return null
  const div = document.createElement('div')
  div.innerHTML = html
  const table = div.querySelector('table')
  return table ? table.outerHTML : null
}

export function dataUrlToFile(dataUrl: string, fileName = 'pasted-image.png'): File | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  const mimeType = match[1]
  const base64 = match[2]
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new File([bytes], fileName, { type: mimeType })
  } catch {
    return null
  }
}

export async function urlToFile(url: string, fileName = 'pasted-image.png'): Promise<File | null> {
  if (url.startsWith('data:')) {
    return dataUrlToFile(url, fileName)
  }
  try {
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return null
    const blob = await res.blob()
    return new File([blob], fileName, { type: blob.type || 'image/png' })
  } catch {
    return null
  }
}

function isRemoteHttpUrl(src: string): boolean {
  return /^https?:\/\//i.test(src.trim())
}

function isUploadableImageSrc(src: string): boolean {
  const trimmed = src.trim()
  if (!trimmed) return false
  if (isRemoteHttpUrl(trimmed)) return false
  if (trimmed.startsWith('/')) return false
  return true
}

export function extractImageSrcs(html: string): string[] {
  if (typeof document === 'undefined') return []
  const div = document.createElement('div')
  div.innerHTML = html
  const imgs = Array.from(div.querySelectorAll('img'))
  const srcs = imgs.map(img => img.getAttribute('src')).filter((src): src is string => !!src)
  return Array.from(new Set(srcs))
}

/**
 * Convert inline images in pasted HTML to persistent URLs. Only non-HTTP(S)
 * src values are uploaded; remote images are left untouched. Images that cannot
 * be uploaded are removed so the editor does not end up with broken links.
 * When the uploader returns a storage key, it is stored as data-file-key so
 * renderers can resolve a fresh durable URL after the signed URL expires.
 */
export async function uploadImagesInHtml(
  html: string,
  upload: (src: string) => Promise<{ url: string; key?: string }>
): Promise<string> {
  if (typeof document === 'undefined') return html
  const div = document.createElement('div')
  div.innerHTML = html
  const imgs = Array.from(div.querySelectorAll('img'))

  for (const img of imgs) {
    const src = img.getAttribute('src')
    if (!src || !isUploadableImageSrc(src)) continue
    try {
      const { url, key } = await upload(src)
      img.setAttribute('src', url)
      if (key) img.setAttribute('data-file-key', key)
    } catch {
      img.remove()
    }
  }

  return div.innerHTML
}

/**
 * Detect a single delimited LaTeX expression in the pasted text.
 * Returns null if the text does not look like exactly one inline or display
 * formula (surrounding whitespace is allowed).
 */
export function extractLatex(text: string): string | null {
  const trimmed = text.trim()
  const display = /^\$\$([\s\S]+?)\$\$$|^\\\[([\s\S]+?)\\\]$/.exec(trimmed)
  if (display) return display[1] ?? display[2]
  const inline = /^\$([\s\S]+?)\$$|^\\\(([\s\S]+?)\\\)$/.exec(trimmed)
  if (inline) return inline[1] ?? inline[2]
  return null
}

export async function renderFormula(latex: string): Promise<string> {
  const res = await fetchWithCsrf('/api/whiteboard/render-formula', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latex, display: true }),
  })
  if (!res.ok) throw new Error('Formula render failed')
  const data = (await res.json()) as { svg?: string }
  if (typeof data.svg !== 'string') throw new Error('Invalid formula response')
  return data.svg
}

export async function uploadPastedImage(file: File): Promise<{ url: string; key?: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetchWithCsrf('/api/uploads/documents', {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error('Image upload failed')
  const data = (await res.json()) as { url?: string; key?: string }
  if (!data.url) throw new Error('No image URL returned')
  return { url: data.url, key: data.key }
}

export function insertHtmlAtCaret(html: string): void {
  if (typeof document === 'undefined') return
  // execCommand works inside contentEditable even when there is no current
  // selection; the browser inserts at the caret if one exists.
  document.execCommand('insertHTML', false, html)
}

/**
 * Inspect a paste event and route rich content to the appropriate handler.
 * Returns true when the paste was handled (and default behavior was prevented).
 * Returns false when nothing matched, leaving the caller free to fall back to
 * default plain-text paste.
 */
export async function handleRichPaste(
  event: PasteEventLike,
  handlers: RichPasteHandlers
): Promise<boolean> {
  const dt = event.clipboardData
  if (!dt) return false

  // 1. Pasted image files take highest priority.
  const imageFiles = extractImageFiles(dt)
  if (imageFiles.length > 0) {
    if (!handlers.onImage) return false
    event.preventDefault()
    for (const file of imageFiles) {
      await handlers.onImage(file)
    }
    return true
  }

  const html = dt.getData('text/html')
  const lowerHtml = html.toLowerCase()
  const hasTable = /<table[\s>]/.test(lowerHtml)
  const hasImage = /<img[\s>]/.test(lowerHtml)
  const hasSvg = /<svg[\s>]/.test(lowerHtml)

  // 2. HTML with a table -> route to the table handler.
  if (hasTable && handlers.onTable) {
    const tableHtml = extractFirstTable(html)
    if (tableHtml) {
      event.preventDefault()
      handlers.onTable(sanitizeSlideHtml(tableHtml))
      return true
    }
  }

  // 3. HTML with images or SVG -> general HTML handler.
  if ((hasImage || hasSvg) && handlers.onHtml) {
    event.preventDefault()
    const processedHtml = handlers.onUploadImage
      ? await uploadImagesInHtml(html, handlers.onUploadImage)
      : html
    handlers.onHtml(sanitizeSlideHtml(processedHtml))
    return true
  }

  // 4. Plain text that looks like LaTeX -> formula handler.
  const text = dt.getData('text/plain')
  if (text && handlers.onFormula) {
    const latex = extractLatex(text)
    if (latex) {
      event.preventDefault()
      try {
        const svg = await renderFormula(latex)
        await handlers.onFormula(svg)
      } catch {
        if (handlers.onText) handlers.onText(text)
      }
      return true
    }
  }

  // 5. Non-rich HTML fallback.
  if (html && handlers.onHtml) {
    event.preventDefault()
    handlers.onHtml(sanitizeSlideHtml(html))
    return true
  }

  // 6. Plain text fallback.
  if (text && handlers.onText) {
    event.preventDefault()
    handlers.onText(text)
    return true
  }

  return false
}
