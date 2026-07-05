import * as React from 'react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export interface AutoTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  disableAutoResize?: boolean
  maxRows?: number
}

export const AutoTextarea = React.forwardRef<HTMLTextAreaElement, AutoTextareaProps>(
  ({ className, value, onChange, onKeyDown, disableAutoResize, maxRows, ...props }, ref) => {
    const internalRef = React.useRef<HTMLTextAreaElement>(null)
    const textareaRef = (ref as any) || internalRef

    const triggerChange = (target: HTMLTextAreaElement, newValue: string, newCursorPos: number) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set
      nativeInputValueSetter?.call(target, newValue)
      const event = new Event('input', { bubbles: true })
      target.dispatchEvent(event)

      setTimeout(() => {
        target.setSelectionRange(newCursorPos, newCursorPos)
      }, 0)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDown?.(e)
      if (e.defaultPrevented) return

      const target = e.currentTarget
      const val = target.value
      const selectionStart = target.selectionStart
      const selectionEnd = target.selectionEnd

      if (e.key === 'Enter') {
        const linesBeforeCursor = val.substring(0, selectionStart).split('\n')
        const currentLine = linesBeforeCursor[linesBeforeCursor.length - 1]

        const match = currentLine.match(/^(\s*)((?:\d+\.)+|\d+\.|[a-z]\.|[ivx]+\.|-|[*])\s(.*)$/i)

        if (match) {
          e.preventDefault()
          const indent = match[1]
          const numbering = match[2]
          const content = match[3]

          if (!content.trim()) {
            const newValue =
              val.substring(0, selectionStart - currentLine.length) +
              indent +
              val.substring(selectionEnd)
            triggerChange(target, newValue, selectionStart - currentLine.length + indent.length)
            return
          }

          let nextNumbering = ''

          if (numbering === '-' || numbering === '*') {
            nextNumbering = numbering
          } else if (/^[a-z]\.$/i.test(numbering) && !/^[ivx]+\.$/i.test(numbering)) {
            const charCode = numbering.charCodeAt(0)
            nextNumbering = String.fromCharCode(charCode + 1) + '.'
          } else if (/\d+\.$/.test(numbering)) {
            const parts = numbering.split('.').filter(Boolean)
            const lastNum = parseInt(parts[parts.length - 1], 10)
            if (!isNaN(lastNum)) {
              parts[parts.length - 1] = (lastNum + 1).toString()
              nextNumbering = parts.join('.') + '.'
            } else {
              nextNumbering = numbering
            }
          } else if (/^[ivx]+\.$/i.test(numbering)) {
            // Basic roman numeral support just repeats 'i.' as a fallback,
            // doing real increment is possible but 'i. ' implies level 3 list
            nextNumbering = 'i.'
          } else {
            nextNumbering = numbering
          }

          const insertText = `\n${indent}${nextNumbering} `
          const newValue =
            val.substring(0, selectionStart) + insertText + val.substring(selectionEnd)

          triggerChange(target, newValue, selectionStart + insertText.length)
        }
      } else if (e.key === 'Tab') {
        const linesBeforeCursor = val.substring(0, selectionStart).split('\n')
        const currentLine = linesBeforeCursor[linesBeforeCursor.length - 1]
        const match = currentLine.match(/^(\s*)((?:\d+\.)+|[a-z]\.|[ivx]+\.|-|[*])\s(.*)$/i)

        if (match && selectionStart === selectionEnd) {
          e.preventDefault()
          const indent = match[1]
          const numbering = match[2]
          const content = match[3]
          const lineStartIdx = selectionStart - currentLine.length

          if (!e.shiftKey) {
            // Indent
            if (indent.length >= 4) return // Max 3 levels (0, 2, 4)

            const newIndent = indent + '  '
            let newNum = numbering

            if (numbering !== '-' && numbering !== '*') {
              if (indent.length === 0) newNum = 'a.'
              else if (indent.length === 2) newNum = 'i.'
            }

            const replacedLine = `${newIndent}${newNum} ${content}`
            const newValue =
              val.substring(0, lineStartIdx) + replacedLine + val.substring(selectionEnd)
            const diff = replacedLine.length - currentLine.length
            triggerChange(target, newValue, selectionStart + diff)
          } else {
            // Outdent
            if (indent.length === 0) return

            const newIndent = indent.length >= 2 ? indent.substring(0, indent.length - 2) : ''
            let newNum = numbering

            if (numbering !== '-' && numbering !== '*') {
              if (newIndent.length === 0) newNum = '1.'
              else if (newIndent.length === 2) newNum = 'a.'
            }

            const replacedLine = `${newIndent}${newNum} ${content}`
            const newValue =
              val.substring(0, lineStartIdx) + replacedLine + val.substring(selectionEnd)
            const diff = replacedLine.length - currentLine.length
            triggerChange(target, newValue, Math.max(0, selectionStart + diff))
          }
        } else if (!e.shiftKey && selectionStart === selectionEnd) {
          e.preventDefault()
          const insertText = `  `
          const newValue =
            val.substring(0, selectionStart) + insertText + val.substring(selectionEnd)
          triggerChange(target, newValue, selectionStart + 2)
        }
      }
    }

    React.useEffect(() => {
      if (disableAutoResize) return
      const target = internalRef.current || (ref as any)?.current
      if (target) {
        const manualHeight = props.style?.height
        target.style.height = 'auto'
        const autoHeight = target.scrollHeight
        let finalHeight = autoHeight
        if (maxRows) {
          const lineHeight = parseInt(window.getComputedStyle(target).lineHeight) || 20
          const maxHeight = maxRows * lineHeight
          if (autoHeight > maxHeight) {
            finalHeight = maxHeight
            target.classList.add('overflow-y-auto', 'scrollbar-none')
          } else {
            target.classList.remove('overflow-y-auto', 'scrollbar-none')
          }
        }
        if (manualHeight && typeof manualHeight === 'string') {
          const manualPx = parseInt(manualHeight)
          if (!isNaN(manualPx) && manualPx > finalHeight) {
            target.style.height = `${manualPx}px`
          } else {
            target.style.height = `${finalHeight}px`
          }
        } else {
          target.style.height = `${finalHeight}px`
        }
      }
    }, [value, props.style?.height, disableAutoResize, maxRows])

    return (
      <div className={cn('relative w-full', disableAutoResize && 'h-full')}>
        <Textarea
          ref={textareaRef}
          className={cn('w-full pb-8 transition-all duration-200', className)}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          {...props}
        />
      </div>
    )
  }
)
AutoTextarea.displayName = 'AutoTextarea'
