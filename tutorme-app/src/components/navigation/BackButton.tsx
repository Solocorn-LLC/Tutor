'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BackButtonProps {
  href?: string
  fallbackHref?: string
  className?: string
  variant?: 'ghost' | 'outline' | 'default'
  size?: 'sm' | 'default' | 'icon'
  iconDirection?: 'left' | 'right'
}

export function BackButton({
  href,
  fallbackHref = '/',
  className,
  variant = 'ghost',
  size = 'icon',
  iconDirection = 'left',
}: BackButtonProps) {
  const router = useRouter()

  const Icon = iconDirection === 'right' ? ArrowRight : ArrowLeft

  const handleClick = () => {
    if (href) {
      return // Let Link handle navigation
    }
    // Try to go back, otherwise go to fallback
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }

  const buttonContent = (
    <Button
      variant={variant}
      size={size}
      onClick={!href ? handleClick : undefined}
      className={cn('h-9 w-9 rounded-lg p-0 transition-colors hover:bg-slate-200', className)}
      aria-label="Go back"
    >
      <Icon className="h-5 w-5" />
    </Button>
  )

  if (href) {
    return (
      <Button
        variant={variant}
        size={size}
        asChild
        className={cn('h-9 w-9 rounded-lg p-0 transition-colors hover:bg-slate-200', className)}
        aria-label="Go back"
      >
        <Link href={href} className="inline-flex">
          <Icon className="h-5 w-5" />
        </Link>
      </Button>
    )
  }

  return buttonContent
}

// Convenience component for role-based fallbacks
export function StudentBackButton(props: Omit<BackButtonProps, 'fallbackHref'>) {
  return <BackButton {...props} fallbackHref="/student/dashboard" />
}

export function TutorBackButton(props: Omit<BackButtonProps, 'fallbackHref'>) {
  return <BackButton {...props} fallbackHref="/tutor/dashboard" />
}

export function ParentBackButton(props: Omit<BackButtonProps, 'fallbackHref'>) {
  return <BackButton {...props} fallbackHref="/parent/dashboard" />
}

export function AdminBackButton(props: Omit<BackButtonProps, 'fallbackHref'>) {
  return <BackButton {...props} fallbackHref="/admin" />
}
