'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAutoScrollOnExpand } from '@/hooks/use-auto-scroll-on-expand'

export interface CollapsibleCardProps {
  title: string
  description?: string
  icon?: React.ReactNode
  defaultOpen?: boolean
  collapsible?: boolean
  className?: string
  contentClassName?: string
  flush?: boolean
  fillHeight?: boolean
  children: React.ReactNode
}

export function CollapsibleCard({
  title,
  description,
  icon,
  defaultOpen = false,
  collapsible = true,
  className,
  contentClassName,
  flush = false,
  fillHeight = false,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const cardRef = useAutoScrollOnExpand(open, { delay: 400, margin: 16, block: 'start' })

  const HeaderTag = collapsible ? 'button' : 'div'
  const headerBaseClass = flush ? 'panel-header-metallic-flush' : 'panel-header-metallic'

  return (
    <div ref={cardRef} className={cn('flex flex-col', fillHeight && 'h-full')}>
      {/* Outer wrapper with shadow - overflow visible so shadow shows */}
      <div
        className={cn(
          'flex flex-col',
          fillHeight && 'h-full',
          flush
            ? 'rounded-b-[16px] bg-white shadow-[0_14px_45px_rgba(0,0,0,0.14)]'
            : 'rounded-[16px] bg-white shadow-[0_14px_45px_rgba(0,0,0,0.14)]',
          className
        )}
      >
        {/* Inner wrapper with overflow hidden for animation */}
        <div
          className={cn(
            'flex flex-col overflow-hidden p-0',
            fillHeight && 'h-full',
            flush ? 'rounded-b-[16px]' : 'rounded-[16px]'
          )}
        >
          <HeaderTag
            type={collapsible ? 'button' : undefined}
            onClick={collapsible ? () => setOpen(o => !o) : undefined}
            className={cn(
              'panel-header w-full text-left',
              headerBaseClass,
              !collapsible && 'panel-header-no-hover'
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
              {collapsible && (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
                  <ChevronDown
                    className={cn(
                      'h-5 w-5 transition-transform duration-300 ease-in-out',
                      open && '-rotate-180'
                    )}
                  />
                </div>
              )}
            </div>
          </HeaderTag>
          <div
            className={cn(
              'grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-in-out',
              collapsible
                ? open
                  ? 'grid-rows-[1fr] opacity-100'
                  : 'grid-rows-[0fr] opacity-0'
                : 'grid-rows-[1fr] opacity-100',
              fillHeight && 'min-h-0 flex-1'
            )}
          >
            <div className={cn('min-h-0 overflow-hidden', contentClassName)}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
