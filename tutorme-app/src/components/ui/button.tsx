import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

// ============================================
// BUTTON VARIANTS - Design System
// ============================================

const buttonVariants = cva(
  // Base styles - Premium feel with smooth transitions
  [
    'inline-flex items-center justify-center gap-2',
    'whitespace-nowrap text-sm font-medium',
    'rounded-lg', // Soft rounded corners
    'ease-premium transition-all duration-200',
    'focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:scale-[0.98]', // Subtle press effect
  ],
  {
    variants: {
      variant: {
        // Primary - Teal accent, main CTA
        default: [
          'bg-primary text-primary-foreground',
          'shadow-elevation-2',
          'hover:shadow-hover-lift hover:-translate-y-0.5',
          'hover:bg-primary/95',
          'active:shadow-active-press active:translate-y-0',
        ],

        // Primary with gradient - Premium feel
        gradient: [
          'from-primary to-primary-300 bg-gradient-to-r',
          'text-primary-foreground',
          'shadow-elevation-2',
          'hover:shadow-hover-lift hover:-translate-y-0.5',
          'hover:from-primary-400 hover:to-primary-200',
          'active:shadow-active-press active:translate-y-0',
        ],

        // Secondary - Blue accent
        secondary: [
          'bg-secondary text-secondary-foreground',
          'shadow-elevation-1',
          'hover:shadow-elevation-2 hover:-translate-y-0.5',
          'hover:bg-secondary/95',
          'active:shadow-active-press active:translate-y-0',
        ],

        // Secondary with gradient
        'secondary-gradient': [
          'from-secondary to-secondary-300 bg-gradient-to-r',
          'text-secondary-foreground',
          'shadow-elevation-1',
          'hover:shadow-elevation-2 hover:-translate-y-0.5',
          'hover:from-secondary-400 hover:to-secondary-200',
          'active:shadow-active-press active:translate-y-0',
        ],

        // Outline - Bordered, transparent background
        outline: [
          'border-input border-2 bg-transparent',
          'text-foreground',
          'hover:bg-accent hover:text-accent-foreground',
          'hover:border-accent',
          'hover:shadow-elevation-1',
          'active:shadow-inner-soft',
        ],

        // Ghost - Minimal, no background until hover
        ghost: [
          'text-foreground',
          'hover:bg-accent/50 hover:text-accent-foreground',
          'active:bg-accent/70',
        ],

        // Muted - For less important actions
        muted: [
          'bg-muted text-muted-foreground',
          'hover:bg-muted/80 hover:text-foreground',
          'active:shadow-inner-soft',
        ],

        // Accent - Warm accent color
        accent: [
          'bg-accent text-accent-foreground',
          'shadow-elevation-1',
          'hover:shadow-elevation-2 hover:-translate-y-0.5',
          'hover:bg-accent/90',
          'active:shadow-active-press active:translate-y-0',
        ],

        // Destructive - Error/danger actions
        destructive: [
          'bg-destructive text-destructive-foreground',
          'shadow-elevation-1',
          'hover:shadow-elevation-2 hover:-translate-y-0.5',
          'hover:bg-destructive/90',
          'active:shadow-active-press active:translate-y-0',
        ],

        // Link - Text-only button
        link: ['text-primary underline-offset-4', 'hover:underline', 'active:text-primary/80'],

        // Soft - Subtle background
        soft: ['bg-primary/10 text-primary', 'hover:bg-primary/20', 'active:bg-primary/30'],

        // Dialog Primary - Metallic popup primary action
        'dialog-primary': [
          'bg-[linear-gradient(145deg,#3A7CFF,#1D4ED8)]',
          'text-white',
          'rounded-[10px]',
          'px-4 py-2.5',
          'shadow-elevation-2',
          'hover:shadow-hover-lift hover:-translate-y-0.5',
          'active:shadow-active-press active:translate-y-0',
        ],

        // Dialog Secondary - Metallic popup secondary action
        'dialog-secondary': [
          'bg-transparent',
          'text-gray-400',
          'rounded-[10px]',
          'px-4 py-2.5',
          'border border-white/[0.08]',
          'hover:bg-white/5 hover:text-gray-300',
          'active:bg-white/10',
        ],

        // Modal Primary - Universal popup primary action (works on white panels)
        'modal-primary': [
          'bg-blue-700 text-white',
          'rounded-md',
          'h-10 px-6',
          'shadow-sm',
          'hover:bg-blue-800',
          'active:bg-blue-900',
          'disabled:opacity-50',
        ],

        // Modal Secondary - Universal popup secondary action (works on white panels)
        'modal-secondary': [
          'bg-transparent text-gray-700',
          'border border-gray-300',
          'rounded-md',
          'h-10 px-6',
          'hover:bg-gray-50',
          'active:bg-gray-100',
          'disabled:opacity-50',
        ],

        // Glass - Translucent effect
        glass: [
          'bg-background/80 backdrop-blur-md',
          'border-border/50 border',
          'text-foreground',
          'shadow-elevation-1',
          'hover:bg-background/90 hover:shadow-elevation-2',
          'active:shadow-inner-soft',
        ],

        // Floating - Elevated card-like button
        floating: [
          'bg-card text-card-foreground',
          'border-border/30 border',
          'shadow-elevation-2',
          'hover:shadow-hover-lift hover:-translate-y-0.5',
          'active:shadow-active-press active:translate-y-0',
        ],

        'solocorn-book': [
          'bg-white text-[#0B3A9B]',
          'shadow-elevation-1',
          'hover:bg-slate-600/80 hover:text-white',
          'hover:shadow-elevation-2',
        ],

        'solocorn-follow': [
          'border-2 border-white/50 bg-transparent text-white',
          'hover:border-transparent hover:bg-white hover:text-[#0B3A9B]',
          'hover:shadow-elevation-1',
        ],
      },

      size: {
        default: ['h-10', 'px-4', 'py-2', 'min-h-[44px]', 'sm:min-h-0'],
        xs: ['h-7', 'px-2.5', 'py-1', 'text-xs', 'rounded-md'],
        sm: ['h-8', 'px-3', 'py-1.5', 'text-sm', 'rounded-md', 'min-h-[36px]'],
        lg: ['h-12', 'px-6', 'py-3', 'text-base', 'min-h-[48px]', 'sm:min-h-0'],
        xl: ['h-14', 'px-8', 'py-4', 'text-lg', 'rounded-xl', 'min-h-[56px]', 'sm:min-h-0'],
        icon: ['h-10 w-10', 'p-2', 'min-h-[44px]', 'min-w-[44px]', 'sm:min-h-0', 'sm:min-w-0'],
        'icon-sm': ['h-8 w-8', 'p-1.5', 'rounded-md'],
        'icon-lg': ['h-12 w-12', 'p-2.5', 'rounded-xl'],
        'icon-touch': ['h-11 w-11', 'p-2', 'min-h-[44px]', 'min-w-[44px]'],
      },
    },

    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

// ============================================
// BUTTON INTERFACE
// ============================================

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  isLoading?: boolean
  loadingText?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

// ============================================
// BUTTON COMPONENT
// ============================================

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button'

    // Handle loading state
    const isDisabled = disabled || isLoading

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isDisabled}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {loadingText || children}
          </>
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </Comp>
    )
  }
)

Button.displayName = 'Button'

// ============================================
// ICON BUTTON COMPONENT
// ============================================

interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'loadingText'> {
  icon: React.ReactNode
  label: string
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, className, size = 'icon', ...props }, ref) => {
    return (
      <Button
        ref={ref}
        size={size}
        className={cn('relative', className)}
        aria-label={label}
        {...props}
      >
        {icon}
      </Button>
    )
  }
)

IconButton.displayName = 'IconButton'

// ============================================
// BUTTON GROUP COMPONENT
// ============================================

interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  attached?: boolean
  vertical?: boolean
}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, children, attached = false, vertical = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex',
          vertical ? 'flex-col' : 'flex-row',
          attached
            ? vertical
              ? '[&>*:first-child]:rounded-b-none [&>*:last-child]:rounded-t-none [&>*:not(:first-child):not(:last-child)]:rounded-none [&>*:not(:first-child)]:-mt-px'
              : '[&>*:first-child]:rounded-r-none [&>*:last-child]:rounded-l-none [&>*:not(:first-child):not(:last-child)]:rounded-none [&>*:not(:first-child)]:-ml-px'
            : vertical
              ? 'gap-2'
              : 'gap-2',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

ButtonGroup.displayName = 'ButtonGroup'

export { Button, buttonVariants, IconButton, ButtonGroup }
export type { IconButtonProps, ButtonGroupProps }
