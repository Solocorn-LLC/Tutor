'use client'

import type { ChangeEvent, KeyboardEventHandler } from 'react'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { cn } from '@/lib/utils'

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  onKeyDown?: KeyboardEventHandler
  variant?: 'default' | 'dark'
}

/**
 * Message compose input.
 *
 * Previously wrapped `react-mentions`, which threw a client-side exception on
 * interaction in this React 18 / Next 16 setup — crashing the 1-on-1 chat and the
 * student/tutor message pages the moment a user typed a message. These are
 * two-person threads where @-mentions add nothing, so this now renders the app's
 * plain auto-sizing textarea with the same props. Any existing `@[name](id)`
 * markup still renders on the read side via `renderMentions()`.
 */
export function MentionInput({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  onKeyDown,
  variant = 'default',
}: MentionInputProps) {
  return (
    <AutoTextarea
      value={value}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      maxRows={6}
      className={cn(
        'border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full resize-none rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'dark' && 'border-gray-600 bg-gray-700 text-gray-50 placeholder:text-gray-400',
        className
      )}
    />
  )
}
