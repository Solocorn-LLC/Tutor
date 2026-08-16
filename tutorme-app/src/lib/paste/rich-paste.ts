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

export async function uploadPastedImage(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetchWithCsrf('/api/uploads/documents', {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error('Image upload failed')
  const data = (await res.json()) as { url?: string }
  if (!data.url) throw new Error('No image URL returned')
  return data.url
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
  const hasImage = /]+>/.test(lowerHtml)
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
    handlers.onHtml(sanitizeSlideHtml(html))
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
