import { useLayoutEffect, useState, useEffect, type RefObject } from 'react'

export function useSlidingPillMetrics(
  triggerRefs: RefObject<(HTMLElement | null)[]>,
  activeIndex: number
) {
  const [metrics, setMetrics] = useState({ left: 0, width: 0 })

  // Calculate metrics based on current DOM state
  const calculateMetrics = () => {
    if (!triggerRefs.current) return
    const trigger = triggerRefs.current[activeIndex]
    if (!trigger) return
    setMetrics({
      left: trigger.offsetLeft,
      width: trigger.offsetWidth,
    })
  }

  // Initial calculation + when activeIndex changes
  useLayoutEffect(() => {
    calculateMetrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex])

  // Recalculate after a short delay to ensure DOM is ready (fonts, etc.)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      calculateMetrics()
    }, 100)
    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex])

  // Recalculate on window resize
  useEffect(() => {
    const handleResize = () => calculateMetrics()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex])

  // Use ResizeObserver to watch the active trigger element for size changes
  useEffect(() => {
    const trigger = triggerRefs.current?.[activeIndex]
    if (!trigger) return

    const ro = new ResizeObserver(() => {
      calculateMetrics()
    })
    ro.observe(trigger)

    // Also observe the parent to catch layout shifts
    const parent = trigger.parentElement
    if (parent) {
      ro.observe(parent)
    }

    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex])

  return metrics
}
