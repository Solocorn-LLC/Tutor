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
  const contentRef = useAutoScrollOnExpand(open, { delay: 150, margin: 16 })

  return (
    <Card className={cn('overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'panel-header w-full text-left',
          flush ? 'panel-header-metallic-flush' : 'panel-header-metallic'
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="panel-header-title">{title}</div>
            {description && <div className="panel-header-subtext">{description}</div>}
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
            {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </div>
      </button>
      {open && (
        <div ref={contentRef} className={contentClassName}>
          {children}
        </div>
      )}
    </Card>
  )
}
