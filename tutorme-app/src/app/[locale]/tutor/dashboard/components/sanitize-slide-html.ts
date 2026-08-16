const SPAN_STYLES = new Set(['font-size', 'color', 'font-family'])
const TABLE_STYLES = new Set([
  'border-collapse',
  'border',
  'border-spacing',
  'width',
  'min-width',
  'max-width',
  'background-color',
  'color',
  'text-align',
  'vertical-align',
  'margin',
  'float',
])
const CELL_STYLES = new Set([
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'width',
  'min-width',
  'max-width',
  'background-color',
  'color',
  'text-align',
  'vertical-align',
  'font-weight',
  'font-style',
  'font-size',
  'font-family',
  'white-space',
])
const IMG_STYLES = new Set([
  'max-width',
  'max-height',
  'width',
  'height',
  'display',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'float',
  'border',
  'border-radius',
  'transform',
])
const SVG_STYLES = new Set([
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'fill-opacity',
  'stroke-opacity',
  'opacity',
  'display',
  'transform',
  'font-size',
  'font-family',
  'text-anchor',
  'dominant-baseline',
])

const SVG_ATTRS = new Set([
  'xmlns',
  'xmlns:xlink',
  'viewbox',
  'width',
  'height',
  'preserveaspectratio',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'd',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'points',
  'transform',
  'opacity',
  'class',
  'id',
  'role',
  'aria-label',
  'aria-hidden',
  'focusable',
  'marker',
  'marker-start',
  'marker-end',
  'mask',
  'clip-path',
  'fill-rule',
  'fill-opacity',
  'stroke-opacity',
  'font-size',
  'font-family',
  'text-anchor',
  'dominant-baseline',
  'dx',
  'dy',
])

interface TagConfig {
  keep?: boolean
  block?: boolean
  attrs?: string[]
  styleProps?: Set<string>
}

const TAG_CONFIG: Record<string, TagConfig> = {
  br: { keep: true },
  div: { keep: true, block: true },
  p: { keep: true, block: true },
  span: { keep: true, styleProps: SPAN_STYLES },
  table: {
    keep: true,
    attrs: ['style', 'border', 'cellpadding', 'cellspacing', 'width'],
    styleProps: TABLE_STYLES,
  },
  thead: { keep: true, attrs: ['style'], styleProps: TABLE_STYLES },
  tbody: { keep: true, attrs: ['style'], styleProps: TABLE_STYLES },
  tfoot: { keep: true, attrs: ['style'], styleProps: TABLE_STYLES },
  tr: { keep: true, attrs: ['style'], styleProps: TABLE_STYLES },
  th: {
    keep: true,
    attrs: ['style', 'colspan', 'rowspan', 'scope'],
    styleProps: CELL_STYLES,
  },
  td: { keep: true, attrs: ['style', 'colspan', 'rowspan'], styleProps: CELL_STYLES },
  caption: { keep: true, attrs: ['style'], styleProps: TABLE_STYLES },
  colgroup: { keep: true, attrs: ['style', 'span'], styleProps: TABLE_STYLES },
  col: { keep: true, attrs: ['style', 'span', 'width'], styleProps: TABLE_STYLES },
  img: {
    keep: true,
    attrs: ['src', 'alt', 'width', 'height', 'style', 'title'],
    styleProps: IMG_STYLES,
  },
  svg: { keep: true, attrs: Array.from(SVG_ATTRS), styleProps: SVG_STYLES },
  g: { keep: true, attrs: Array.from(SVG_ATTRS), styleProps: SVG_STYLES },
  path: { keep: true, attrs: Array.from(SVG_ATTRS), styleProps: SVG_STYLES },
  rect: { keep: true, attrs: Array.from(SVG_ATTRS), styleProps: SVG_STYLES },
  circle: { keep: true, attrs: Array.from(SVG_ATTRS), styleProps: SVG_STYLES },
  ellipse: { keep: true, attrs: Array.from(SVG_ATTRS), styleProps: SVG_STYLES },
  line: { keep: true, attrs: Array.from(SVG_ATTRS), styleProps: SVG_STYLES },
  polyline: { keep: true, attrs: Array.from(SVG_ATTRS), styleProps: SVG_STYLES },
  polygon: { keep: true, attrs: Array.from(SVG_ATTRS), styleProps: SVG_STYLES },
  text: { keep: true, attrs: Array.from(SVG_ATTRS), styleProps: SVG_STYLES },
  tspan: { keep: true, attrs: Array.from(SVG_ATTRS), styleProps: SVG_STYLES },
  defs: { keep: true, attrs: Array.from(SVG_ATTRS), styleProps: SVG_STYLES },
  use: { keep: true, attrs: Array.from(SVG_ATTRS), styleProps: SVG_STYLES },
  title: { keep: true, attrs: Array.from(SVG_ATTRS), styleProps: SVG_STYLES },
  desc: { keep: true, attrs: Array.from(SVG_ATTRS), styleProps: SVG_STYLES },
}

const DANGEROUS_CSS = /javascript:|expression\(|@import|-moz-binding|behavior:\s*url/i

export function isSlideHtml(value: string): boolean {
  return /<[a-z][\s>]/i.test(value)
}

function normalizeWhitespace(html: string): string {
  return html.replace(/\r\n/g, '\n')
}

function hasVisibleContent(node: Node): boolean {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element
    if (el.tagName === 'IMG' || el.tagName === 'SVG') return true
  }
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

function isSafeImageSrc(src: string): boolean {
  const trimmed = src.trim()
  if (!trimmed) return false
  if (/^https?:\/\//i.test(trimmed)) return true
  if (trimmed.startsWith('/')) return true
  return false
}

function filterStyle(value: string, allowed: Set<string> | undefined): string | null {
  if (!allowed || !value) return null
  const declarations = value
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
  const allowedDeclarations = declarations.filter(d => {
    const colonIndex = d.indexOf(':')
    if (colonIndex < 0) return false
    const prop = d.slice(0, colonIndex).trim().toLowerCase()
    if (!allowed.has(prop)) return false
    const val = d.slice(colonIndex + 1).trim()
    if (DANGEROUS_CSS.test(val)) return false
    return true
  })
  return allowedDeclarations.length > 0 ? allowedDeclarations.join('; ') : null
}

export function sanitizeSlideHtml(html: string): string {
  if (typeof document === 'undefined') return html
  if (!html || !html.includes('<')) return html

  const container = document.createElement('div')
  container.innerHTML = normalizeWhitespace(html)

  // Process deepest nodes first so children are cleaned before parents are
  // unwrapped or validated.
  const elements = Array.from(container.querySelectorAll('*'))
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]
    const tag = el.tagName.toLowerCase()

    if (tag === 'script' || tag === 'style' || tag === 'noscript') {
      el.remove()
      continue
    }

    const config = TAG_CONFIG[tag]
    if (!config?.keep) {
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

    if (config.block && !hasVisibleContent(el)) {
      // Replace empty blocks with a single line break.
      const br = document.createElement('br')
      el.parentNode?.replaceChild(br, el)
      continue
    }

    const allowedAttrs = new Set((config.attrs || []).map(a => a.toLowerCase()))

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()

      if (name === 'style') {
        const filtered = filterStyle(attr.value, config.styleProps)
        if (filtered) {
          el.setAttribute('style', filtered)
        } else {
          el.removeAttribute('style')
        }
        continue
      }

      if (!allowedAttrs.has(name)) {
        el.removeAttribute(attr.name)
        continue
      }

      // Validate attribute values that can carry URLs or references.
      if (tag === 'img' && name === 'src' && !isSafeImageSrc(attr.value)) {
        el.removeAttribute('src')
      }
      if (tag === 'use' && (name === 'href' || name === 'xlink:href')) {
        if (!attr.value.trim().startsWith('#')) {
          el.removeAttribute(attr.name)
        }
      }
    }

    // Drop image tags that lost their safe src.
    if (tag === 'img' && !el.getAttribute('src')) {
      el.remove()
    }
  }

  return container.innerHTML
}
