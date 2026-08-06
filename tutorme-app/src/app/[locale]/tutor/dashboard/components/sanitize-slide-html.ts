const ALLOWED_STYLES = new Set(['font-size', 'color', 'font-family'])

export function isSlideHtml(value: string): boolean {
  return /<[a-z][\s>]/i.test(value)
}

function normalizeWhitespace(html: string): string {
  return html.replace(/\r\n/g, '\n')
}

function hasVisibleContent(node: Node): boolean {
  const children = Array.from(node.childNodes)
  if (children.length === 0) return false
  return children.some(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      return child.textContent?.replace(/\s/g, '').length ? true : false
    }
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element
      if (el.tagName === 'BR') return true
      return hasVisibleContent(child)
    }
    return false
  })
}

export function sanitizeSlideHtml(html: string): string {
  if (typeof document === 'undefined') return html
  if (!html || !html.includes('<')) return html

  const container = document.createElement('div')
  container.innerHTML = normalizeWhitespace(html)

  const elements = Array.from(container.querySelectorAll('*'))
  for (const el of elements) {
    const tag = el.tagName

    if (tag === 'BR') {
      // Keep line breaks as-is.
      continue
    }

    if (tag === 'DIV' || tag === 'P') {
      if (!hasVisibleContent(el)) {
        // Replace empty blocks with a single line break.
        const br = document.createElement('br')
        el.parentNode?.replaceChild(br, el)
      } else {
        // Block wrappers are preserved structurally, but we strip any inline
        // styles from them because formatting is stored on <span> elements.
        el.removeAttribute('style')
        for (const attr of Array.from(el.attributes)) {
          if (attr.name !== 'style') {
            el.removeAttribute(attr.name)
          }
        }
      }
      continue
    }

    if (tag !== 'SPAN') {
      // Unwrap the disallowed element, preserving its children.
      const parent = el.parentNode
      if (parent) {
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el)
        }
        parent.removeChild(el)
      }
      continue
    }

    // Clean the style attribute on <span>, keeping only allowed declarations.
    const style = el.getAttribute('style')
    if (style) {
      const declarations = style
        .split(';')
        .map(s => s.trim())
        .filter(Boolean)
      const allowed = declarations.filter(d => {
        const prop = d.split(':')[0].trim().toLowerCase()
        return ALLOWED_STYLES.has(prop)
      })
      if (allowed.length > 0) {
        el.setAttribute('style', allowed.join('; '))
      } else {
        el.removeAttribute('style')
      }
    }
    // Remove any non-style attributes.
    for (const attr of Array.from(el.attributes)) {
      if (attr.name !== 'style') {
        el.removeAttribute(attr.name)
      }
    }
  }

  return container.innerHTML
}
