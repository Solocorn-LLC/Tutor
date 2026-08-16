'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { cn } from '@/lib/utils'
import { sanitizeSlideHtml, isSlideHtml } from './sanitize-slide-html'
import {
  handleRichPaste,
  uploadPastedImage,
  urlToFile,
  insertHtmlAtCaret,
  escapeHtml,
} from '@/lib/paste/rich-paste'

export interface TaskSlideTextEditorRef {
  applyFormat: (format: { fontFamily?: string; fontSize?: number; color?: string }) => boolean
}

interface TaskSlideTextEditorProps {
  html: string
  onHtmlChange: (html: string) => void
  readOnly?: boolean
  placeholder?: string
  /** When true the placeholder is hidden even when html contains no text (e.g. link previews). */
  hasExternalContent?: boolean
  className?: string
  style?: React.CSSProperties
}

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

function getTextOffset(container: Node, node: Node | null, offset: number): number {
  let count = 0
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null)
  let n: Node | null
  while ((n = walker.nextNode())) {
    if (n === node) return count + Math.min(offset, n.textContent?.length || 0)
    count += n.textContent?.length || 0
  }
  return count
}

function setCaretAtTextOffset(container: Node, targetOffset: number): void {
  let count = 0
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null)
  let n: Node | null
  while ((n = walker.nextNode())) {
    const len = n.textContent?.length || 0
    if (count + len >= targetOffset) {
      const range = document.createRange()
      range.setStart(n, Math.max(0, targetOffset - count))
      range.collapse(true)
      const sel = window.getSelection()
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(range)
      }
      return
    }
    count += len
  }
}

function hasVisualHtmlContent(html: string): boolean {
  if (!html) return false
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]+>/g, '').trim().length > 0
  }
  const div = document.createElement('div')
  div.innerHTML = html
  const walker = document.createTreeWalker(
    div,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    null
  )
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.replace(/\s/g, '').length) return true
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName.toLowerCase()
      if (tag === 'img' || tag === 'svg' || tag === 'table') return true
    }
  }
  return false
}

function getRelativeRect(el: Element, container: Element) {
  const elRect = el.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  return {
    top: elRect.top - containerRect.top,
    left: elRect.left - containerRect.left,
    width: elRect.width,
    height: elRect.height,
  }
}

interface ImageOverlayProps {
  container: HTMLElement
  img: HTMLImageElement
  version: number
  onResizeStart: (handle: ResizeHandle, e: React.MouseEvent) => void
  onMoveStart: (e: React.MouseEvent) => void
}

function ImageOverlay({ container, img, version, onResizeStart, onMoveStart }: ImageOverlayProps) {
  const [rect, setRect] = useState(getRelativeRect(img, container))

  useLayoutEffect(() => {
    if (!img || !container) return
    setRect(getRelativeRect(img, container))
  }, [img, container, version])

  const handle = (pos: ResizeHandle, className: string) => (
    <div
      key={pos}
      className={cn(
        'pointer-events-auto absolute h-2.5 w-2.5 rounded-full border border-white bg-blue-500 shadow-sm',
        className
      )}
      onMouseDown={e => onResizeStart(pos, e)}
    />
  )

  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
    >
      <div className="absolute inset-0 border-2 border-blue-500/60" />
      {handle('nw', '-left-1 -top-1 cursor-nw-resize')}
      {handle('ne', '-right-1 -top-1 cursor-ne-resize')}
      {handle('sw', '-bottom-1 -left-1 cursor-sw-resize')}
      {handle('se', '-bottom-1 -right-1 cursor-se-resize')}
      <div
        className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-move rounded bg-blue-500/80 px-1 py-0.5 text-[9px] font-semibold text-white opacity-0 transition-opacity hover:opacity-100"
        onMouseDown={onMoveStart}
      >
        Move
      </div>
    </div>
  )
}

export const TaskSlideTextEditor = forwardRef<TaskSlideTextEditorRef, TaskSlideTextEditorProps>(
  function TaskSlideTextEditor(
    { html, onHtmlChange, readOnly, placeholder, hasExternalContent, className, style },
    ref
  ) {
    const divRef = useRef<HTMLDivElement>(null)
    // Track the last HTML we emitted or wrote so we can avoid re-syncing the
    // DOM and clobbering the user's cursor.
    const lastHtmlRef = useRef('')
    const selectedImgRef = useRef<HTMLImageElement | null>(null)
    const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null)
    const [overlayTick, setOverlayTick] = useState(0)

    const updateSelectedImg = useCallback((img: HTMLImageElement | null) => {
      selectedImgRef.current = img
      setSelectedImg(img)
    }, [])

    // Load external html changes without clobbering the editor while the user is typing.
    useEffect(() => {
      const el = divRef.current
      if (!el || html === lastHtmlRef.current) return
      lastHtmlRef.current = html

      const sanitized = isSlideHtml(html) ? sanitizeSlideHtml(html) : html
      if (el.innerHTML === sanitized) return

      // Preserve cursor position by text offset when we must rewrite innerHTML.
      const selection = window.getSelection()
      const savedOffset =
        selection && selection.rangeCount > 0 && el.contains(selection.anchorNode)
          ? getTextOffset(el, selection.anchorNode, selection.anchorOffset)
          : null

      el.innerHTML = sanitized

      if (savedOffset !== null) {
        setCaretAtTextOffset(el, savedOffset)
      }

      // If the selected image still exists in the new DOM, keep it selected.
      if (selectedImgRef.current && el.contains(selectedImgRef.current)) {
        setSelectedImg(selectedImgRef.current)
        setOverlayTick(t => t + 1)
      } else if (!selectedImgRef.current || !el.contains(selectedImgRef.current)) {
        updateSelectedImg(null)
      }
    }, [html, updateSelectedImg])

    const emitHtml = useCallback(() => {
      const el = divRef.current
      if (!el) return
      const raw = el.innerHTML
      const sanitized = sanitizeSlideHtml(raw)
      if (sanitized !== lastHtmlRef.current) {
        lastHtmlRef.current = sanitized
        onHtmlChange(sanitized)
        // If sanitization changed the markup, sync it back to the DOM so the two stay aligned.
        if (sanitized !== raw) {
          el.innerHTML = sanitized
          if (selectedImgRef.current && !el.contains(selectedImgRef.current)) {
            updateSelectedImg(null)
          }
        }
      }
    }, [onHtmlChange, updateSelectedImg])

    useImperativeHandle(
      ref,
      () => ({
        applyFormat: ({ fontFamily, fontSize, color }) => {
          const el = divRef.current
          if (!el || readOnly) return false
          const selection = window.getSelection()
          if (!selection || selection.rangeCount === 0) return false
          const range = selection.getRangeAt(0)

          if (!el.contains(range.commonAncestorContainer)) return false

          const styles: string[] = []
          if (fontFamily !== undefined) styles.push(`font-family: ${fontFamily}`)
          if (fontSize !== undefined) styles.push(`font-size: ${fontSize}px`)
          if (color !== undefined) styles.push(`color: ${color}`)
          if (styles.length === 0) return false

          const styleString = styles.join('; ')

          if (range.collapsed) {
            const span = document.createElement('span')
            span.setAttribute('style', styleString)
            const anchor = document.createTextNode('\u200B')
            span.appendChild(anchor)
            range.insertNode(span)

            const newRange = document.createRange()
            newRange.setStart(anchor, 0)
            newRange.collapse(true)
            selection.removeAllRanges()
            selection.addRange(newRange)

            emitHtml()
            return true
          }

          const extracted = range.extractContents()
          const span = document.createElement('span')
          span.setAttribute('style', styleString)
          span.appendChild(extracted)
          range.insertNode(span)
          range.collapse(false)
          selection.removeAllRanges()
          selection.addRange(range)

          emitHtml()
          return true
        },
      }),
      [readOnly, emitHtml]
    )

    const handlePaste = useCallback(
      async (e: React.ClipboardEvent) => {
        const handled = await handleRichPaste(e, {
          onImage: async file => {
            try {
              const url = await uploadPastedImage(file)
              insertHtmlAtCaret(
                `<img src="${escapeHtml(url)}" alt="${escapeHtml(file.name)}" style="max-width:100%">`
              )
              emitHtml()
            } catch (err) {
              console.error('Failed to upload pasted image', err)
            }
          },
          onTable: html => {
            insertHtmlAtCaret(html)
            emitHtml()
          },
          onFormula: svg => {
            insertHtmlAtCaret(svg)
            emitHtml()
          },
          onHtml: html => {
            insertHtmlAtCaret(html)
            emitHtml()
          },
          onUploadImage: async src => {
            const file = await urlToFile(src, 'pasted-image.png')
            if (!file) throw new Error('Could not read pasted image')
            return uploadPastedImage(file)
          },
          onText: text => {
            document.execCommand('insertText', false, text)
            emitHtml()
          },
        })

        if (!handled) {
          e.preventDefault()
          const text = e.clipboardData.getData('text/plain')
          document.execCommand('insertText', false, text)
          emitHtml()
        }
      },
      [emitHtml]
    )

    const startResize = useCallback(
      (handle: ResizeHandle, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const img = selectedImgRef.current
        const el = divRef.current
        if (!img || !el || readOnly) return

        const startX = e.clientX
        const startY = e.clientY
        const rect = img.getBoundingClientRect()
        const startWidth = rect.width
        const startHeight = rect.height
        const aspect = startWidth / startHeight

        // Remove max-width constraint while the user is explicitly resizing.
        const previousMaxWidth = img.style.maxWidth
        img.style.maxWidth = 'none'

        const onMove = (ev: MouseEvent) => {
          const dxRaw = ev.clientX - startX
          const dyRaw = ev.clientY - startY
          const dx = handle.includes('w') ? -dxRaw : dxRaw
          const dy = handle.includes('n') ? -dyRaw : dyRaw
          const scale = Math.max(dx / startWidth, dy / startHeight, -0.9) + 1
          const newWidth = Math.max(24, startWidth * scale)
          const newHeight = newWidth / aspect
          img.style.width = `${Math.round(newWidth)}px`
          img.style.height = `${Math.round(newHeight)}px`
          setOverlayTick(t => t + 1)
        }

        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          if (previousMaxWidth) {
            img.style.maxWidth = previousMaxWidth
          } else {
            img.style.removeProperty('max-width')
          }
          emitHtml()
        }

        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      },
      [emitHtml, readOnly]
    )

    const startMove = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const img = selectedImgRef.current
        const el = divRef.current
        if (!img || !el || readOnly) return

        const startX = e.clientX
        const startY = e.clientY
        const transform = img.style.transform || ''
        const match = /translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/.exec(transform)
        const startTx = match ? parseFloat(match[1]) : 0
        const startTy = match ? parseFloat(match[2]) : 0

        const onMove = (ev: MouseEvent) => {
          const dx = ev.clientX - startX
          const dy = ev.clientY - startY
          img.style.transform = `translate(${startTx + dx}px, ${startTy + dy}px)`
          setOverlayTick(t => t + 1)
        }

        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          emitHtml()
        }

        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      },
      [emitHtml, readOnly]
    )

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        const el = divRef.current
        if (!el || readOnly) return
        const target = e.target
        if (target instanceof HTMLImageElement && el.contains(target)) {
          e.preventDefault()
          if (selectedImgRef.current === target) {
            startMove(e)
            return
          }
          updateSelectedImg(target)
          setOverlayTick(t => t + 1)
          return
        }
        if (selectedImgRef.current) {
          updateSelectedImg(null)
        }
      },
      [readOnly, startMove, updateSelectedImg]
    )

    // Clicking outside the editor deselects the active image.
    useEffect(() => {
      const handleDocMouseDown = (e: MouseEvent) => {
        if (!divRef.current) return
        if (!divRef.current.contains(e.target as Node)) {
          updateSelectedImg(null)
        }
      }
      document.addEventListener('mousedown', handleDocMouseDown)
      return () => document.removeEventListener('mousedown', handleDocMouseDown)
    }, [updateSelectedImg])

    // Keep the overlay positioned correctly when the window is resized.
    useEffect(() => {
      const handleResize = () => setOverlayTick(t => t + 1)
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }, [])

    const isEmpty = !hasVisualHtmlContent(html) && !hasExternalContent

    return (
      <div className={cn('relative h-full w-full', className)} style={style}>
        <div
          ref={divRef}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          className={cn(
            'h-full w-full resize-none overflow-hidden border-0 bg-transparent p-6 leading-relaxed text-[#1F2933] focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
            readOnly && 'cursor-default'
          )}
          onMouseDown={handleMouseDown}
          onPaste={handlePaste}
          onInput={emitHtml}
          onBlur={emitHtml}
        />
        {placeholder && isEmpty && !readOnly && (
          <div className="pointer-events-none absolute inset-0 p-6 leading-relaxed text-slate-400">
            {placeholder}
          </div>
        )}
        {selectedImg && divRef.current && !readOnly && (
          <ImageOverlay
            container={divRef.current}
            img={selectedImg}
            version={overlayTick}
            onResizeStart={startResize}
            onMoveStart={startMove}
          />
        )}
      </div>
    )
  }
)

TaskSlideTextEditor.displayName = 'TaskSlideTextEditor'
