const ALLOWED_TAG = 'SPAN'
const ALLOWED_STYLES = new Set(['font-size', 'color'])

export function isSlideHtml(value: string): boolean {
  return /<[a-z][\s>]/i.test(value)
}

export function sanitizeSlideHtml(html: string): string {
  if (typeof document === 'undefined') return html
  if (!html || !html.includes('<')) return html

  const container = document.createElement('div')
  container.innerHTML = html

  const elements = Array.from(container.querySelectorAll('*'))
  for (const el of elements) {
    if (el.tagName !== ALLOWED_TAG) {
      // Unwrap the disallowed element, preserving its children.
      const parent = el.parentNode
      if (parent) {
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el)
        }
        parent.removeChild(el)
      }
    } else {
      // Clean the style attribute, keeping only allowed declarations.
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
  }

  return container.innerHTML
}
