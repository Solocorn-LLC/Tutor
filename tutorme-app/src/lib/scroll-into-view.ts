/**
 * Scroll helpers that work across window-level and nested scrollable containers,
 * accounting for fixed/sticky top UI.
 */

function isScrollableStyle(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el)
  const overflow = style.overflow + style.overflowY + style.overflowX
  return /(auto|scroll)/.test(overflow)
}

export function getScrollableAncestor(el: Element): HTMLElement | Window {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    // Radix ScrollArea uses a viewport with `overflow: hidden` but is still the
    // element that scrolls. Detect it by its data attribute first.
    if (node.hasAttribute('data-radix-scroll-area-viewport')) {
      return node
    }
    if (isScrollableStyle(node)) {
      return node
    }
    node = node.parentElement
  }
  return window
}

function isStuckAtTop(el: Element, scroller: Element | Window): boolean {
  const style = window.getComputedStyle(el)
  const position = style.position
  const rect = el.getBoundingClientRect()

  if (position === 'fixed') {
    // Only count fixed elements that are actually visible and anchored at the top.
    const top = parseFloat(style.top)
    return style.display !== 'none' && style.visibility !== 'hidden' && top <= 0
  }

  if (position === 'sticky') {
    // A sticky element is "stuck" when its viewport top is at (or above) its
    // sticky offset. We use a 1px threshold to avoid floating-point noise.
    const top = parseFloat(style.top)
    return rect.top <= top + 1 && rect.top >= -1
  }

  return false
}

export function getStickyTopOffset(scroller: Element | Window): number {
  if (typeof document === 'undefined') return 0

  // Limit the search to elements that are likely fixed/sticky. Tailwind uses
  // the literal `fixed` and `sticky` utility classes, so this is cheap and safe.
  const candidates = document.querySelectorAll('[class*="fixed"], [class*="sticky"]')
  let offset = 0
  const counted = new Set<Element>()

  for (const el of candidates) {
    if (!isStuckAtTop(el, scroller)) continue
    if (counted.has(el)) continue

    const rect = el.getBoundingClientRect()
    if (rect.height <= 0) continue

    offset += rect.height
    counted.add(el)
  }

  return offset
}

export interface ScrollIntoViewOptions {
  margin?: number
  block?: 'start' | 'end' | 'nearest'
}

function overrideSmoothScrollTemporarily() {
  // Some pages (e.g. landing page) force `scroll-behavior: auto !important`.
  // We temporarily override it so our programmatic scroll can be smooth.
  const html = document.documentElement
  const hadImportant = html.style.getPropertyPriority('scroll-behavior') === 'important'
  const previousValue = html.style.scrollBehavior

  html.style.setProperty('scroll-behavior', 'smooth', 'important')

  return () => {
    if (hadImportant && previousValue) {
      html.style.setProperty('scroll-behavior', previousValue, 'important')
    } else {
      html.style.removeProperty('scroll-behavior')
    }
  }
}

function smoothScrollBy(scroller: HTMLElement | Window, top: number) {
  const restore =
    scroller === window && typeof document !== 'undefined'
      ? overrideSmoothScrollTemporarily()
      : null

  scroller.scrollBy({ top, behavior: 'smooth' })

  if (restore) {
    window.setTimeout(restore, 600)
  }
}

export function scrollElementIntoView(el: Element, options: ScrollIntoViewOptions = {}): void {
  if (typeof window === 'undefined') return

  const { margin = 16, block = 'end' } = options
  const scroller = getScrollableAncestor(el)
  const stickyOffset = getStickyTopOffset(scroller)

  const viewportHeight =
    scroller === window ? window.innerHeight : (scroller as HTMLElement).clientHeight

  const rect = el.getBoundingClientRect()
  const panelHeight = rect.height
  const availableHeight = Math.max(0, viewportHeight - stickyOffset - margin * 2)

  // If the panel is taller than the available viewport, scroll its top into view
  // just below the sticky offset. Otherwise scroll so the full panel is visible.
  let delta = 0

  if (panelHeight > availableHeight) {
    const desiredTop = stickyOffset + margin
    if (rect.top > desiredTop + 1 || rect.top < desiredTop - 1) {
      delta = rect.top - desiredTop
    }
  } else {
    const desiredBottom = viewportHeight - margin
    if (rect.bottom > desiredBottom + 1) {
      delta = rect.bottom - desiredBottom
    }
  }

  if (delta !== 0) {
    smoothScrollBy(scroller, delta)
  }
}
