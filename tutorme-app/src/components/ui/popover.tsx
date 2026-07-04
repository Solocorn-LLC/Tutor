'use client'

import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'

import { cn } from '@/lib/utils'

const Popover = (props: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Root>) => (
  <PopoverPrimitive.Root modal={false} {...props} />
)

const PopoverTrigger = PopoverPrimitive.Trigger

interface PopoverContentProps extends React.ComponentPropsWithoutRef<
  typeof PopoverPrimitive.Content
> {
  variant?: 'metallic' | 'panel'
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, align = 'center', sideOffset = 4, variant = 'metallic', ...props }, ref) => {
  const metallicClasses =
    'bg-[linear-gradient(135deg,rgba(32,28,24,0.50),rgba(82,82,82,0.50))] backdrop-blur-[18px] saturate-[140%] text-white border-white/[0.12] rounded-xl shadow-[0_18px_40px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.16)]'

  const panelClasses = 'bg-popover text-popover-foreground border rounded-md shadow-md'

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-popover w-72 outline-none',
          variant === 'metallic' && metallicClasses,
          variant === 'panel' && panelClasses,
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
