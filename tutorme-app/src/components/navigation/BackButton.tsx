'use client'

import { useRouter } from 'next/navigation'
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
      router.push(href)
      return
    }
    // Try to go back, otherwise go to fallback
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      className={cn(className)}
      aria-label="Go back"
    >
      <Icon className="h-5 w-5" />
    </Button>
  )
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
