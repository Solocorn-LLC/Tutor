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
      <div
        className={cn(
          'overflow-hidden border border-[#E5E7EB] p-0',
          flush
            ? 'rounded-b-[16px] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]'
            : 'rounded-[16px] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]',
          className
        )}
      >
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
              <div className="flex items-center">
                <span className="panel-header-title">{title}</span>
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
            'grid transition-all duration-300 ease-in-out',
            open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden">
            <div className={contentClassName}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
