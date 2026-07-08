'use client'

import * as React from 'react'
import { useRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useSlidingPillMetrics } from '@/hooks/use-sliding-pill'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface SlidingPillTab {
  value: string
  label: string
  disabled?: boolean
}

interface SlidingPillTabsListProps {
  value: string
  tabs: SlidingPillTab[]
  variant?: 'charcoal' | 'gray' | 'white'
  className?: string
  listClassName?: string
  triggerClassName?: string
  pillClassName?: string
}

const VARIANT_STYLES = {
  charcoal: {
    list: 'bg-[#1F2933]',
    trigger:
      'text-white/80 hover:text-white data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:!text-[#1F2933]',
    pill: 'bg-white shadow-sm',
  },
  gray: {
    list: 'bg-gray-100',
    trigger:
      'text-gray-700 hover:bg-white hover:text-gray-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:!text-white',
    pill: 'bg-gray-800',
  },
  white: {
    list: 'bg-white',
    trigger:
      'text-gray-700 hover:bg-gray-100 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:!text-white',
    pill: 'bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] shadow-sm',
  },
}

export function SlidingPillTabsList({
  value,
  tabs,
  variant = 'charcoal',
  className,
  listClassName,
  triggerClassName,
  pillClassName,
}: SlidingPillTabsListProps) {
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([])
  const activeIndex = tabs.findIndex(tab => tab.value === value)
  const { left, width, initialLeft, initialWidth } = useSlidingPillMetrics(triggerRefs, activeIndex)
  const styles = VARIANT_STYLES[variant]

  return (
    <TabsList
      className={cn('relative flex w-full gap-1.5 rounded-xl p-1.5', styles.list, listClassName)}
    >
      {tabs.map((tab, i) => (
        <TabsTrigger
          key={tab.value}
          ref={el => {
            triggerRefs.current[i] = el
          }}
          value={tab.value}
          disabled={tab.disabled}
          className={cn(
            'relative z-10 flex-1 rounded-lg text-xs font-medium transition-colors',
            styles.trigger,
            triggerClassName
          )}
        >
          {tab.label}
        </TabsTrigger>
      ))}
      <motion.div
        className={cn('absolute bottom-1.5 top-1.5 rounded-lg', styles.pill, pillClassName)}
        initial={{ left: initialLeft, width: initialWidth }}
        animate={{ left, width }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
    </TabsList>
  )
}
