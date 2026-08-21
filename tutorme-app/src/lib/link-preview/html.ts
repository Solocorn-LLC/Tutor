function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Remove the exact URL text from an HTML string, preserving surrounding text.
 * URLs inside element attributes are skipped because only text nodes are scanned.
 * Whitespace immediately adjacent to a removed URL is also removed to avoid double
 * spaces; any remaining runs of whitespace are collapsed to a single space.
 */
export function removeStandaloneUrlsFromHtml(html: string, urls: string[]): string {
  if (typeof document === 'undefined' || urls.length === 0) return html

  const container = document.createElement('div')
  container.innerHTML = html

  function removeUrlFromText(text: string, url: string): string {
    const escaped = escapeRegex(url)
    const regex = new RegExp(escaped, 'g')
    let result = ''
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
      const matchStart = match.index
      const matchEnd = matchStart + url.length
      result += text.slice(lastIndex, matchStart)

      // Strip one adjacent whitespace character so "hello <url> world" becomes
      // "hello world", not "hello  world".
      let end = matchEnd
      if (text[end] && /\s/.test(text[end])) {
        end += 1
      } else if (matchStart > 0 && /\s/.test(text[matchStart - 1])) {
        // Whitespace was already included in the kept prefix; trim it back.
        result = result.slice(0, -1)
      }

      lastIndex = end
    }

    result += text.slice(lastIndex)
    return result.replace(/\s{2,}/g, ' ')
  }

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent || ''
      for (const url of urls) {
        if (!text.includes(url)) continue
        text = removeUrlFromText(text, url)
      }
      node.textContent = text
      return
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      Array.from(node.childNodes).forEach(child => walk(child))
    }
  }

  walk(container)
  return container.innerHTML
}

export function appendUrlToHtml(html: string, url: string): string {
  const trimmed = html.trim()
  if (!trimmed) return `<div>${url}</div>`
  const separator = trimmed.match(/<br\s*\/?>$/i) ? '' : '<br>'
  return `${trimmed}${separator}<div>${url}</div>`
}
