'use client'

import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'

import { cn } from '@/lib/utils'

// ============================================
// SOLOCORN POPUP SYSTEM
// Apple-style metallic charcoal popup wrapper
// for custom lightweight popups outside shadcn.
// ============================================

const SolocornPopup = PopoverPrimitive.Root

const SolocornPopupTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <PopoverPrimitive.Trigger ref={ref} className={cn('outline-none', className)} {...props} />
))
SolocornPopupTrigger.displayName = 'SolocornPopupTrigger'

const SolocornPopupContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-popover min-w-[10rem] overflow-hidden rounded-xl border border-white/[0.12] py-2.5 shadow-[0_18px_40px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.16)] outline-none',
        'bg-[linear-gradient(135deg,rgba(32,28,24,0.50),rgba(82,82,82,0.50))] text-white saturate-[140%] backdrop-blur-[18px]',
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
SolocornPopupContent.displayName = 'SolocornPopupContent'

interface SolocornPopupItemProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode
  destructive?: boolean
}

const SolocornPopupItem = React.forwardRef<HTMLDivElement, SolocornPopupItemProps>(
  ({ className, icon, destructive, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex cursor-pointer select-none items-center gap-3.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white/[0.94] outline-none transition-all hover:bg-white/10 active:scale-[0.98]',
        destructive && 'text-red-400 hover:bg-red-500/10 focus-visible:bg-red-500/10',
        className
      )}
      {...props}
    >
      {icon && (
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-white/[0.96]">
          {icon}
        </span>
      )}
      <span className="flex-1">{children}</span>
    </div>
  )
)
SolocornPopupItem.displayName = 'SolocornPopupItem'

const SolocornPopupSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('my-1.5 h-px bg-white/10', className)} {...props} />
))
SolocornPopupSeparator.displayName = 'SolocornPopupSeparator'

export {
  SolocornPopup,
  SolocornPopupTrigger,
  SolocornPopupContent,
  SolocornPopupItem,
  SolocornPopupSeparator,
}
