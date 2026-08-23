'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export const actionButtonBase =
  'flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white disabled:hover:bg-white/10'

interface AnimatedControlButtonProps {
  icon: React.ReactNode
  label: string
  className?: string
  onClick?: () => void
  disabled?: boolean
}

export function AnimatedControlButton({
  icon,
  label,
  className,
  onClick,
  disabled: buttonDisabled,
}: AnimatedControlButtonProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <motion.button
      type="button"
      disabled={buttonDisabled}
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className={cn(actionButtonBase, 'relative overflow-hidden', className)}
    >
      <span className="flex items-center justify-center gap-2">
        {icon}
        <motion.span
          className="overflow-hidden whitespace-nowrap leading-none"
          initial={{ opacity: 0, width: 0 }}
          animate={{
            opacity: hovered && !buttonDisabled ? 1 : 0,
            width: hovered && !buttonDisabled ? 'auto' : 0,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          {label}
        </motion.span>
      </span>
    </motion.button>
  )
}
