'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X, Loader2 } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { Button } from './button'

// ============================================
// DIALOG THEME SYSTEM
// ============================================

type DialogTheme = 'default' | 'metallic'

const DialogThemeContext = React.createContext<DialogTheme>('default')

const useDialogTheme = () => React.useContext(DialogThemeContext)

// ============================================
// DIALOG CONTENT VARIANTS
// ============================================

const dialogContentVariants = cva(
  [
    'z-modal fixed',
    'w-full',
    'ease-premium',
    'data-[state=open]:animate-in data-[state=closed]:animate-out',
    'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
  ],
  {
    variants: {
      size: {
        sm: 'max-w-sm',
        default: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
        '2xl': 'max-w-6xl',
        full: 'max-w-[95vw]',
      },
      position: {
        center: [
          'left-[50%] top-[50%]',
          'translate-x-[-50%] translate-y-[-50%]',
          'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
          'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
        ],
        top: [
          'left-[50%] top-[10%]',
          'translate-x-[-50%]',
          'data-[state=closed]:slide-out-to-top-[48%]',
          'data-[state=open]:slide-in-from-top-[48%]',
        ],
        bottom: [
          'bottom-[5%] left-[50%]',
          'translate-x-[-50%]',
          'data-[state=closed]:slide-out-to-bottom-[48%]',
          'data-[state=open]:slide-in-from-bottom-[48%]',
        ],
      },
      rounded: {
        default: 'rounded-[22px]',
        lg: 'rounded-3xl',
        none: 'rounded-none',
      },
      theme: {
        default: [
          'bg-background',
          'border-border/50 border',
          'shadow-elevation-5',
          'duration-300',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        ],
        metallic: [
          'bg-[rgba(39,43,50,0.72)]',
          'backdrop-blur-[18px]',
          'border-0',
          'p-6',
          'text-white',
          'shadow-[0_24px_64px_rgba(15,23,42,0.32)]',
          'duration-200',
          'data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98]',
        ],
      },
    },
    defaultVariants: {
      size: 'default',
      position: 'center',
      rounded: 'default',
      theme: 'metallic',
    },
  }
)

// ============================================
// DIALOG COMPONENTS
// ============================================

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

// ============================================
// DIALOG OVERLAY
// ============================================

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & {
    blur?: boolean
  }
>(({ className, blur = true, ...props }, ref) => {
  const theme = useDialogTheme()
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'z-modal-backdrop fixed inset-0',
        theme === 'metallic' ? 'bg-black/[0.45]' : 'bg-background/80',
        blur && (theme === 'metallic' ? 'backdrop-blur-[6px]' : 'backdrop-blur-sm'),
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className
      )}
      {...props}
    />
  )
})
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

// ============================================
// DIALOG CONTENT
// ============================================

interface DialogContentProps
  extends
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogContentVariants> {
  showCloseButton?: boolean
  blurOverlay?: boolean
  theme?: DialogTheme
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      className,
      children,
      size,
      position,
      rounded,
      showCloseButton = true,
      blurOverlay = true,
      theme = 'metallic',
      ...props
    },
    ref
  ) => (
    <DialogThemeContext.Provider value={theme}>
      <DialogPortal>
        <DialogOverlay blur={blurOverlay} />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(dialogContentVariants({ size, position, rounded, theme }), className)}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              className={cn(
                'absolute right-4 top-4',
                'flex items-center justify-center',
                'h-8 w-8 rounded-lg',
                'transition-all duration-150',
                'focus:ring-ring focus:outline-none focus:ring-2 focus:ring-offset-2',
                'disabled:pointer-events-none',
                theme === 'metallic'
                  ? 'text-gray-400 hover:bg-white/10 hover:text-white'
                  : 'text-muted-foreground hover:bg-accent opacity-70 hover:opacity-100'
              )}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogThemeContext.Provider>
  )
)
DialogContent.displayName = DialogPrimitive.Content.displayName

// ============================================
// DIALOG HEADER
// ============================================

const DialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    bordered?: boolean
    spacing?: 'sm' | 'default' | 'lg'
  }
>(({ className, bordered = false, spacing = 'default', ...props }, ref) => {
  const theme = useDialogTheme()
  const spacingClasses = {
    sm: theme === 'metallic' ? 'px-6 py-4' : 'p-4 pb-2',
    default: theme === 'metallic' ? 'px-6 py-[18px]' : 'p-6 pb-4',
    lg: theme === 'metallic' ? 'px-8 py-6' : 'p-8 pb-6',
  }

  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col space-y-2',
        'text-center sm:text-left',
        spacingClasses[spacing],
        theme === 'metallic' && 'border-b border-white/[0.06]',
        bordered && theme !== 'metallic' && 'border-border/50 border-b',
        className
      )}
      {...props}
    />
  )
})
DialogHeader.displayName = 'DialogHeader'

// ============================================
// DIALOG FOOTER
// ============================================

const DialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    bordered?: boolean
    spacing?: 'sm' | 'default' | 'lg'
    align?: 'start' | 'center' | 'end' | 'between'
  }
>(({ className, bordered = false, spacing = 'default', align = 'end', ...props }, ref) => {
  const theme = useDialogTheme()
  const spacingClasses = {
    sm: theme === 'metallic' ? 'px-6 py-3' : 'p-4 pt-2',
    default: theme === 'metallic' ? 'px-6 py-4' : 'p-6 pt-4',
    lg: theme === 'metallic' ? 'px-8 py-6' : 'p-8 pt-6',
  }

  const alignClasses = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    between: 'justify-between',
  }

  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:gap-3',
        alignClasses[align],
        spacingClasses[spacing],
        theme === 'metallic' && 'border-t border-white/[0.06]',
        bordered && theme !== 'metallic' && 'border-border/50 border-t',
        className
      )}
      {...props}
    />
  )
})
DialogFooter.displayName = 'DialogFooter'

// ============================================
// DIALOG TITLE
// ============================================

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & {
    size?: 'sm' | 'default' | 'lg'
  }
>(({ className, size = 'default', ...props }, ref) => {
  const theme = useDialogTheme()
  const sizeClasses = {
    sm: 'text-base',
    default: 'text-lg',
    lg: 'text-xl',
  }

  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        'font-semibold leading-tight tracking-tight',
        sizeClasses[size],
        theme === 'metallic' ? 'text-white' : 'text-foreground',
        className
      )}
      {...props}
    />
  )
})
DialogTitle.displayName = DialogPrimitive.Title.displayName

// ============================================
// DIALOG DESCRIPTION
// ============================================

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> & {
    size?: 'sm' | 'default'
  }
>(({ className, size = 'default', ...props }, ref) => {
  const theme = useDialogTheme()
  const sizeClasses = {
    sm: 'text-xs',
    default: 'text-sm',
  }

  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn(
        sizeClasses[size],
        theme === 'metallic' ? 'leading-[1.6] text-gray-300' : 'text-muted-foreground',
        className
      )}
      {...props}
    />
  )
})
DialogDescription.displayName = DialogPrimitive.Description.displayName

// ============================================
// DIALOG BODY
// ============================================

const DialogBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    scrollable?: boolean
    spacing?: 'sm' | 'default' | 'lg'
    maxHeight?: string
  }
>(({ className, scrollable = false, spacing = 'default', maxHeight, ...props }, ref) => {
  const theme = useDialogTheme()
  const spacingClasses = {
    sm: theme === 'metallic' ? 'px-6 py-3' : 'px-4 py-3',
    default: theme === 'metallic' ? 'px-6 py-5' : 'px-6 py-4',
    lg: theme === 'metallic' ? 'px-8 py-6' : 'px-8 py-6',
  }

  return (
    <div
      ref={ref}
      className={cn(
        spacingClasses[spacing],
        theme === 'metallic' && 'leading-[1.6] text-gray-300',
        scrollable && ['scrollbar-thin overflow-y-auto', maxHeight && `max-h-[${maxHeight}]`],
        className
      )}
      {...props}
    />
  )
})
DialogBody.displayName = 'DialogBody'

// ============================================
// DIALOG PANEL (White content panel for universal modal architecture)
// ============================================

const DialogPanel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-xl border border-gray-200 bg-white p-4', 'text-gray-900', className)}
      {...props}
    />
  )
)
DialogPanel.displayName = 'DialogPanel'

// ============================================
// MODAL LAYOUT (Pre-composed universal modal wrapper)
// ============================================

interface ModalAction {
  label: string
  onClick: () => void
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'destructive'
}

interface ModalLayoutProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  icon?: React.ReactNode
  children: React.ReactNode
  primaryAction?: ModalAction
  secondaryAction?: ModalAction
  theme?: DialogTheme
  size?: 'sm' | 'default' | 'lg' | 'xl' | '2xl' | 'full'
  showCloseButton?: boolean
  className?: string
}

function ModalLayout({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  primaryAction,
  secondaryAction,
  theme = 'metallic',
  size = 'default',
  showCloseButton = true,
  className,
}: ModalLayoutProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size={size}
        theme={theme}
        showCloseButton={showCloseButton}
        className={cn('overflow-hidden', className)}
      >
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            {icon && <span className="text-gray-500">{icon}</span>}
            <DialogTitle className={theme === 'metallic' ? 'text-white' : 'text-gray-900'}>
              {title}
            </DialogTitle>
          </div>
          {description && (
            <DialogDescription className={theme === 'metallic' ? 'text-gray-300' : 'text-gray-500'}>
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogBody spacing="default" className="space-y-4">
          {children}
        </DialogBody>
        {(primaryAction || secondaryAction) && (
          <DialogFooter className="gap-3">
            {secondaryAction && (
              <DialogClose asChild>
                <Button
                  variant="modal-secondary"
                  onClick={secondaryAction.onClick}
                  disabled={secondaryAction.loading}
                >
                  {secondaryAction.label}
                </Button>
              </DialogClose>
            )}
            {primaryAction && (
              <Button
                variant={primaryAction.variant === 'destructive' ? 'destructive' : 'modal-primary'}
                onClick={primaryAction.onClick}
                disabled={primaryAction.loading}
              >
                {primaryAction.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {primaryAction.label}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============================================
// ALERT DIALOG (Simplified Dialog for confirmations)
// ============================================

interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel?: () => void
  variant?: 'default' | 'destructive'
}

function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default',
}: AlertDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" position="center" className="text-center sm:text-left">
        <DialogHeader className="space-y-3">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter className="sm:justify-end">
          <DialogClose asChild>
            <Button variant="dialog-secondary" onClick={onCancel}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            variant="dialog-primary"
            onClick={onConfirm}
            className={variant === 'destructive' ? 'bg-gradient-to-br from-red-500 to-red-700' : ''}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogPanel,
  ModalLayout,
  AlertDialog,
  dialogContentVariants,
}
export type { DialogContentProps, AlertDialogProps, ModalLayoutProps, ModalAction }
