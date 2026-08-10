function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isStandaloneInText(text: string, url: string, index: number): boolean {
  const before = text[index - 1]
  const after = text[index + url.length]
  return (!before || /\s/.test(before)) && (!after || /\s/.test(after))
}

export function removeStandaloneUrlsFromHtml(html: string, urls: string[]): string {
  if (typeof document === 'undefined' || urls.length === 0) return html

  const container = document.createElement('div')
  container.innerHTML = html

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent || ''
      for (const url of urls) {
        const escaped = escapeRegex(url)
        const regex = new RegExp(escaped, 'g')
        let match: RegExpExecArray | null
        const removals: number[] = []
        while ((match = regex.exec(text)) !== null) {
          if (isStandaloneInText(text, url, match.index)) {
            removals.push(match.index)
          }
        }
        // Remove from the end so indices stay valid.
        for (let i = removals.length - 1; i >= 0; i--) {
          const idx = removals[i]
          text = text.slice(0, idx) + text.slice(idx + url.length)
        }
      }
      text = text.replace(/\s{2,}/g, ' ').trim()
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
