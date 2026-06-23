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

function isTopBlockingElement(el: Element): boolean {
  const style = window.getComputedStyle(el)
  const rect = el.getBoundingClientRect()

  // Exclude elements that are clearly sidebars (tall and narrow, positioned at left/right)
  // A top-blocking element should:
  // 1. Be relatively wide (span most of the viewport width)
  // 2. Not be extremely tall relative to its width (not a sidebar)
  const viewportWidth = window.innerWidth
  const widthRatio = rect.width / viewportWidth

  // If the element spans less than 40% of the viewport width, it's likely a sidebar
  if (widthRatio < 0.4) return false

  // If the element is taller than it is wide by a large margin, it's likely a sidebar
  if (rect.height > rect.width * 2) return false

  return true
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

    // Skip sidebars and other non-top-blocking elements
    if (!isTopBlockingElement(el)) continue

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

  const isWindowScroller = scroller === window
  const scrollerEl = isWindowScroller ? null : (scroller as HTMLElement)
  const scrollerRect = scrollerEl?.getBoundingClientRect()
  const scrollerTop = scrollerRect ? scrollerRect.top : 0
  const viewportHeight = isWindowScroller ? window.innerHeight : scrollerEl!.clientHeight

  const rect = el.getBoundingClientRect()
  const panelHeight = rect.height
  const availableHeight = Math.max(0, viewportHeight - stickyOffset - margin * 2)

  let delta = 0

  if (block === 'nearest') {
    // Minimal scroll to bring the element into view
    const isAbove = rect.top < scrollerTop + stickyOffset + margin
    const isBelow = rect.bottom > scrollerTop + viewportHeight - margin

    if (isAbove && isBelow) {
      // Element spans the viewport — scroll to show top
      delta = rect.top - (scrollerTop + stickyOffset + margin)
    } else if (isAbove) {
      // Element is above the visible area — scroll down to show top
      delta = rect.top - (scrollerTop + stickyOffset + margin)
    } else if (isBelow) {
      // Element is below the visible area — scroll up to show bottom
      delta = rect.bottom - (scrollerTop + viewportHeight - margin)
    }
    // If neither isAbove nor isBelow, element is fully visible — no scroll needed
  } else if (block === 'start') {
    // Scroll so the top of the element is just below the sticky offset
    const desiredTop = scrollerTop + stickyOffset + margin
    if (rect.top > desiredTop + 1 || rect.top < desiredTop - 1) {
      delta = rect.top - desiredTop
    }
  } else {
    // block === 'end' (default)
    // If the panel is taller than the available viewport, scroll its top into view
    // just below the sticky offset. Otherwise scroll so the full panel is visible.
    if (panelHeight > availableHeight) {
      const desiredTop = scrollerTop + stickyOffset + margin
      if (rect.top > desiredTop + 1 || rect.top < desiredTop - 1) {
        delta = rect.top - desiredTop
      }
    } else {
      const desiredBottom = scrollerTop + viewportHeight - margin
      if (rect.bottom > desiredBottom + 1) {
        delta = rect.bottom - desiredBottom
      }
    }
  }

  if (delta !== 0) {
    smoothScrollBy(scroller, delta)
  }
}
