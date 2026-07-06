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
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const cardRef = useAutoScrollOnExpand(open, { delay: 400, margin: 16, block: 'start' })

  return (
    <div ref={cardRef}>
      {/* Outer wrapper with shadow - overflow visible so shadow shows */}
      <div
        className={cn(
          flush
            ? 'rounded-b-[16px] bg-white shadow-[0_14px_45px_rgba(0,0,0,0.14)]'
            : 'rounded-[16px] bg-white shadow-[0_14px_45px_rgba(0,0,0,0.14)]',
          className
        )}
      >
        {/* Inner wrapper with overflow hidden for animation */}
        <div className="flex flex-col overflow-hidden p-0">
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
              open ? 'flex-1 opacity-100' : 'flex-0 h-0 opacity-0'
            )}
          >
            <div className={cn('h-full overflow-hidden', contentClassName)}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
