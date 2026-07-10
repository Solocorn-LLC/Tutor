'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, AtSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AutoTextarea } from '@/components/ui/auto-textarea'

export interface MentionItem {
  id: string
  type:
    | 'lesson'
    | 'task'
    | 'assessment'
    | 'extension'
    | 'dmi'
    | 'course'
    | 'session'
    | 'student'
    | string
  label: string
  subtitle?: string
}

interface MentionTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  mentionItems: MentionItem[]
  disableAutoResize?: boolean
  maxRows?: number
}

const MENTION_REGEX = /@\[([^\]]+)\]\(([^:]+):([^)]+)\)/g

export function MentionTextarea({
  mentionItems,
  className,
  value,
  onChange,
  disableAutoResize,
  maxRows,
  ...props
}: MentionTextareaProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [cursorPos, setCursorPos] = useState(0)
  const [dropdownPos, setDropdownPos] = useState<{
    bottom: number
    left: number
    width: number
  } | null>(null)
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const textValue = String(value || '')

  useEffect(() => {
    setMounted(true)
  }, [])

  const parsedMentions = useMemo(() => {
    const mentions: { type: string; id: string; label: string; index: number }[] = []
    let match
    while ((match = MENTION_REGEX.exec(textValue)) !== null) {
      mentions.push({
        label: match[1],
        type: match[2],
        id: match[3],
        index: match.index,
      })
    }
    return mentions
  }, [textValue])

  const filteredItems = useMemo(() => {
    if (!query) return mentionItems.slice(0, 50)
    const lower = query.toLowerCase()
    return mentionItems
      .filter(
        item =>
          item.label.toLowerCase().includes(lower) ||
          item.subtitle?.toLowerCase().includes(lower) ||
          item.type.toLowerCase().includes(lower)
      )
      .slice(0, 50)
  }, [mentionItems, query])

  const updateDropdownPosition = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const rect = textarea.getBoundingClientRect()
    setDropdownPos({
      bottom: window.innerHeight - rect.top + 4,
      left: rect.left,
      width: rect.width,
    })
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(e)
      const val = e.target.value
      const pos = e.target.selectionStart ?? 0
      setCursorPos(pos)

      // Check if we're in a mention context
      const beforeCursor = val.slice(0, pos)
      const lastAt = beforeCursor.lastIndexOf('@')
      if (lastAt !== -1) {
        const between = beforeCursor.slice(lastAt + 1)
        // Only open if @ is at word boundary and no closing bracket yet
        if (!between.includes(' ') && !between.includes('\n') && !between.includes(']')) {
          setQuery(between)
          setOpen(true)
          setHighlightedIndex(0)
          updateDropdownPosition()
          return
        }
      }
      setOpen(false)
      setQuery('')
    },
    [onChange, updateDropdownPosition]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!open) {
        props.onKeyDown?.(e)
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex(i => (i + 1) % filteredItems.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex(i => (i - 1 + filteredItems.length) % filteredItems.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const item = filteredItems[highlightedIndex]
        if (item) insertMention(item)
        return
      }
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }

      props.onKeyDown?.(e)
    },
    [open, filteredItems, highlightedIndex, props]
  )

  const insertMention = useCallback(
    (item: MentionItem) => {
      const textarea = textareaRef.current
      if (!textarea) return

      const val = textarea.value
      const beforeCursor = val.slice(0, cursorPos)
      const lastAt = beforeCursor.lastIndexOf('@')
      if (lastAt === -1) return

      const before = val.slice(0, lastAt)
      const token = `@[${item.label}](${item.type}:${item.id})`
      const after = val.slice(cursorPos)
      const newValue = before + token + ' ' + after

      // Programmatically update
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set
      nativeSetter?.call(textarea, newValue)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))

      const newPos = before.length + token.length + 1
      setTimeout(() => {
        textarea.setSelectionRange(newPos, newPos)
        textarea.focus()
      }, 0)

      setOpen(false)
      setQuery('')
    },
    [cursorPos]
  )

  const removeMention = useCallback(
    (index: number) => {
      const textarea = textareaRef.current
      if (!textarea) return
      const match = parsedMentions.find(m => m.index === index)
      if (!match) return

      const val = textarea.value
      const token = `@[${match.label}](${match.type}:${match.id})`
      const newValue = val.slice(0, index) + val.slice(index + token.length)

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set
      nativeSetter?.call(textarea, newValue)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    },
    [parsedMentions]
  )

  // Close dropdown on click outside
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Update dropdown position on scroll/resize
  useEffect(() => {
    if (!open) return
    const handleScroll = () => updateDropdownPosition()
    const handleResize = () => updateDropdownPosition()
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [open, updateDropdownPosition])

  const dropdownRef = useRef<HTMLDivElement>(null)

  const typeColors: Record<string, string> = {
    lesson: 'bg-blue-100 text-blue-700 border-blue-200',
    task: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    assessment: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    extension: 'bg-orange-100 text-orange-700 border-orange-200',
    dmi: 'bg-violet-100 text-violet-700 border-violet-200',
  }

  const dropdown = (
    <div
      ref={dropdownRef}
      className="rounded-lg border bg-white p-1 shadow-lg"
      style={{
        position: 'fixed',
        bottom: dropdownPos?.bottom ?? 0,
        left: dropdownPos?.left ?? 0,
        width: dropdownPos?.width ?? 'auto',
        maxHeight: 220,
        overflowY: 'auto',
        zIndex: 9999,
      }}
    >
      {filteredItems.map((item, idx) => (
        <button
          key={`${item.type}-${item.id}`}
          type="button"
          onClick={() => insertMention(item)}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
            idx === highlightedIndex ? 'bg-slate-100' : 'hover:bg-slate-50'
          )}
        >
          <span
            className={cn(
              'shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase',
              typeColors[item.type] || 'bg-gray-100 text-gray-600'
            )}
          >
            {item.type}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900">{item.label}</p>
            {item.subtitle && <p className="truncate text-[10px] text-gray-500">{item.subtitle}</p>}
          </div>
        </button>
      ))}
    </div>
  )

  return (
    <div ref={containerRef} className="relative flex w-full flex-1 flex-col gap-2">
      {/* Mention pills */}
      {parsedMentions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {parsedMentions.map((m, i) => (
            <span
              key={`${m.id}-${i}`}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                typeColors[m.type] || 'border-gray-200 bg-gray-100 text-gray-700'
              )}
            >
              <AtSign className="h-2.5 w-2.5" />
              {m.label}
              <button
                type="button"
                onClick={() => removeMention(m.index)}
                className="ml-0.5 rounded-full hover:bg-black/10"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Textarea */}
      <AutoTextarea
        ref={textareaRef}
        className={className}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disableAutoResize={disableAutoResize}
        maxRows={maxRows}
        {...props}
      />

      {/* Mention dropdown - portal to body to avoid clipping */}
      {mounted && open && filteredItems.length > 0 && createPortal(dropdown, document.body)}
    </div>
  )
}
