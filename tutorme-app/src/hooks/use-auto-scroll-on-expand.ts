'use client'

import { useEffect, useRef } from 'react'
import { scrollElementIntoView } from '@/lib/scroll-into-view'

export interface UseAutoScrollOnExpandOptions {
  disabled?: boolean
  delay?: number
  margin?: number
  block?: 'start' | 'end' | 'nearest'
}

export function useAutoScrollOnExpand(
  open: boolean,
  options: UseAutoScrollOnExpandOptions = {}
) {
  const { disabled = false, delay = 150, margin, block = 'end' } = options
  const ref = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(open)

  useEffect(() => {
    if (disabled) {
      wasOpenRef.current = open
      return
    }

    let timer: ReturnType<typeof setTimeout> | null = null

    if (open && !wasOpenRef.current && ref.current) {
      timer = setTimeout(() => {
        if (ref.current) {
          scrollElementIntoView(ref.current, { margin, block })
        }
      }, delay)
    }

    wasOpenRef.current = open

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [open, disabled, delay, margin, block])

  return ref
}
