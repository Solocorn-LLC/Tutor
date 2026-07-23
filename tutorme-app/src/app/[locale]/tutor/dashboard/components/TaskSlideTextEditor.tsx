'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { sanitizeSlideHtml, isSlideHtml } from './sanitize-slide-html'

export interface TaskSlideTextEditorRef {
  applyFormat: (format: { fontSize?: number; color?: string }) => boolean
}

interface TaskSlideTextEditorProps {
  html: string
  onHtmlChange: (html: string) => void
  readOnly?: boolean
  placeholder?: string
  className?: string
  style?: React.CSSProperties
}

export const TaskSlideTextEditor = forwardRef<TaskSlideTextEditorRef, TaskSlideTextEditorProps>(
  function TaskSlideTextEditor(
    { html, onHtmlChange, readOnly, placeholder, className, style },
    ref
  ) {
    const divRef = useRef<HTMLDivElement>(null)
    // Start with a sentinel value so the first effect always initialises the editor
    // from the external html, even when it matches the prop on first render.
    const lastHtmlRef = useRef('')

    // Load external html changes without clobbering the editor while the user is typing.
    useEffect(() => {
      const el = divRef.current
      if (!el || html === lastHtmlRef.current) return
      lastHtmlRef.current = html

      if (isSlideHtml(html)) {
        el.innerHTML = sanitizeSlideHtml(html)
      } else {
        el.textContent = html
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
        applyFormat: ({ fontSize, color }) => {
          const el = divRef.current
          if (!el || readOnly) return false
          const selection = window.getSelection()
          if (!selection || selection.rangeCount === 0) return false
          const range = selection.getRangeAt(0)
          if (range.collapsed) return false

          const styles: string[] = []
          if (fontSize !== undefined) styles.push(`font-size: ${fontSize}px`)
          if (color !== undefined) styles.push(`color: ${color}`)
          if (styles.length === 0) return false

          const extracted = range.extractContents()
          const span = document.createElement('span')
          span.setAttribute('style', styles.join('; '))
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

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
      e.preventDefault()
      const text = e.clipboardData.getData('text/plain')
      document.execCommand('insertText', false, text)
    }, [])

    const isEmpty = !html || html.replace(/<[^>]+>/g, '').trim() === ''

    return (
      <div className={cn('relative h-full w-full', className)} style={style}>
        <div
          ref={divRef}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          className={cn(
            'h-full w-full resize-none overflow-hidden border-0 bg-transparent p-12 leading-relaxed text-[#1F2933] focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
            readOnly && 'cursor-default'
          )}
          style={style}
          onPaste={handlePaste}
          onInput={emitHtml}
          onBlur={emitHtml}
        />
        {placeholder && isEmpty && !readOnly && (
          <div className="pointer-events-none absolute inset-0 p-12 leading-relaxed text-slate-400">
            {placeholder}
          </div>
        )}
      </div>
    )
  }
)

// Mount-time content for plain text is set via the effect so React does not warn about
// mismatched textContent / innerHTML. We render empty __html for plain text and populate
// it in the effect with textContent.

TaskSlideTextEditor.displayName = 'TaskSlideTextEditor'
