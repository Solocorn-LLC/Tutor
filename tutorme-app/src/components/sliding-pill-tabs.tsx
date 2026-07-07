'use client'

import * as React from 'react'
import { useRef, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
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
  className: _className,
  listClassName,
  triggerClassName,
  pillClassName,
}: SlidingPillTabsListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 })
  const _activeIndex = tabs.findIndex(tab => tab.value === value)
  const styles = VARIANT_STYLES[variant]

  const updatePillPosition = useCallback(() => {
    const list = listRef.current
    if (!list) return

    const activeTrigger = list.children[_activeIndex] as HTMLElement | undefined
    if (!activeTrigger || activeTrigger.getAttribute('role') !== 'tab') {
      // Fallback: find by data-state="active"
      const triggers = Array.from(list.querySelectorAll('[role="tab"]'))
      const active = triggers.find(t => t.getAttribute('data-state') === 'active')
      if (!active) return
      const rect = active.getBoundingClientRect()
      const listRect = list.getBoundingClientRect()
      setPillStyle({
        left: rect.left - listRect.left,
        width: rect.width,
      })
      return
    }

    const rect = activeTrigger.getBoundingClientRect()
    const listRect = list.getBoundingClientRect()
    setPillStyle({
      left: rect.left - listRect.left,
      width: rect.width,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update position when active tab changes
  React.useLayoutEffect(() => {
    // Defer to next frame so Radix UI has time to update data-state attributes
    const id = requestAnimationFrame(() => {
      updatePillPosition()
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Update after a delay for fonts/layout
  React.useEffect(() => {
    const id = setTimeout(updatePillPosition, 100)
    return () => clearTimeout(id)
  }, [updatePillPosition])

  // Update on resize
  React.useEffect(() => {
    const handleResize = () => updatePillPosition()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [updatePillPosition])

  // Use ResizeObserver on the list container
  React.useEffect(() => {
    const list = listRef.current
    if (!list) return

    const ro = new ResizeObserver(() => {
      updatePillPosition()
    })
    ro.observe(list)

    return () => ro.disconnect()
  }, [updatePillPosition])

  return (
    <TabsList
      ref={listRef}
      className={cn('relative flex w-full gap-1.5 rounded-xl p-1.5', styles.list, listClassName)}
    >
      {tabs.map(tab => (
        <TabsTrigger
          key={tab.value}
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
      <div
        className={cn(
          'absolute bottom-1.5 top-1.5 rounded-lg transition-all duration-300 ease-out',
          styles.pill,
          pillClassName
        )}
        style={{
          left: pillStyle.left,
          width: pillStyle.width,
          transitionProperty: 'left, width',
        }}
      />
    </TabsList>
  )
}
