'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAutoScrollOnExpand } from '@/hooks/use-auto-scroll-on-expand'

export interface CollapsibleCardProps {
  title: string
  description?: string
  icon?: React.ReactNode
  defaultOpen?: boolean
  className?: string
  contentClassName?: string
  flush?: boolean
  /** When true, the card and its open content fill the parent's height (for use
   *  inside a bounded flex column) instead of sizing to content. Opt-in so the
   *  default content-sized behavior used across the app stays unchanged. */
  fill?: boolean
  children: React.ReactNode
}

export function CollapsibleCard({
  title,
  description,
  icon,
  defaultOpen = false,
  className,
  contentClassName,
  flush = false,
  fill = false,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const cardRef = useAutoScrollOnExpand(open, { delay: 400, margin: 16, block: 'start' })

  return (
    <div ref={cardRef} className={cn(fill && 'flex min-h-0 flex-1 flex-col')}>
      {/* Outer wrapper with shadow - overflow visible so shadow shows */}
      <div
        className={cn(
          flush
            ? 'rounded-b-[16px] bg-white shadow-[0_14px_45px_rgba(0,0,0,0.14)]'
            : 'rounded-[16px] bg-white shadow-[0_14px_45px_rgba(0,0,0,0.14)]',
          fill && 'flex min-h-0 flex-1 flex-col',
          className
        )}
      >
        {/* Inner wrapper with overflow hidden for animation */}
        <div className={cn('flex flex-col overflow-hidden p-0', fill && 'h-full min-h-0 flex-1')}>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className={cn(
              'panel-header w-full text-left',
              flush ? 'panel-header-metallic-flush' : 'panel-header-metallic'
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {icon && <div className="panel-header-icon">{icon}</div>}
                <div>
                  <div className="panel-header-title">{title}</div>
                  {description && <span className="panel-header-subtext">{description}</span>}
                </div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
                {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </div>
          </button>
          <div
            className={cn(
              'overflow-hidden transition-all duration-300 ease-in-out',
              open
                ? fill
                  ? 'flex min-h-0 flex-1 flex-col opacity-100'
                  : 'flex-1 opacity-100'
                : 'flex-0 h-0 opacity-0'
            )}
          >
            <div className={cn('h-full overflow-hidden', contentClassName)}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
