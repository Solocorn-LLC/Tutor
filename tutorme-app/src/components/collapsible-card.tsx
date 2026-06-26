'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useAutoScrollOnExpand } from '@/hooks/use-auto-scroll-on-expand'

export interface CollapsibleCardProps {
  title: string
  description?: string
  defaultOpen?: boolean
  className?: string
  contentClassName?: string
  flush?: boolean
  children: React.ReactNode
}

export function CollapsibleCard({
  title,
  description,
  defaultOpen = false,
  className,
  contentClassName,
  flush = false,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const cardRef = useAutoScrollOnExpand(open, { delay: 400, margin: 16 })

  return (
    <div ref={cardRef}>
      <Card
        className={cn(
          'overflow-hidden p-0',
          flush
            ? 'rounded-b-[16px] border-x border-b border-slate-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]'
            : 'rounded-[16px] border border-slate-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]',
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
            <div className="flex items-center">
              <span className="panel-header-title">{title}</span>
              {description && <span className="panel-header-subtext">{description}</span>}
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
      </Card>
    </div>
  )
}
