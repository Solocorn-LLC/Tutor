'use client'

import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export function ClampedTitle({
  text,
  children,
  className,
}: {
  text: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn('line-clamp-2 min-h-[2.4em] overflow-hidden leading-[1.2]', className)}
          >
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px]">
          <p className="text-xs">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
