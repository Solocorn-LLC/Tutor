'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useCallback } from 'react'
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
  className?: string
  style?: React.CSSProperties
}

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

export const TaskSlideTextEditor = forwardRef<TaskSlideTextEditorRef, TaskSlideTextEditorProps>(
  function TaskSlideTextEditor(
    { html, onHtmlChange, readOnly, placeholder, className, style },
    ref
  ) {
    const divRef = useRef<HTMLDivElement>(null)
    // Track the last HTML we emitted or wrote so we can avoid re-syncing the
    // DOM and clobbering the user's cursor.
    const lastHtmlRef = useRef('')

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
    }, [html])

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
        }
      }
    }, [onHtmlChange])

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
          // Collapse the selection to the end of the inserted span.
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

    const isEmpty = !html || html.replace(/<[^>]+>/g, '').trim() === ''

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
          onPaste={handlePaste}
          onInput={emitHtml}
          onBlur={emitHtml}
        />
        {placeholder && isEmpty && !readOnly && (
          <div className="pointer-events-none absolute inset-0 p-6 leading-relaxed text-slate-400">
            {placeholder}
          </div>
        )}
      </div>
    )
  }
)

TaskSlideTextEditor.displayName = 'TaskSlideTextEditor'
