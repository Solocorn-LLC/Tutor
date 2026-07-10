import { useLayoutEffect, useState, useEffect, useRef, type RefObject } from 'react'

export function useSlidingPillMetrics(
  triggerRefs: RefObject<(HTMLElement | null)[]>,
  activeIndex: number
) {
  const [metrics, setMetrics] = useState({ left: 0, width: 0 })
  const metricsRef = useRef({ left: 0, width: 0 })
  const prevMetricsRef = useRef({ left: 0, width: 0 })
  const isFirstRenderRef = useRef(true)

  // Keep metricsRef in sync with state so calculateMetrics always reads current values
  useEffect(() => {
    metricsRef.current = metrics
  }, [metrics])

  // Calculate metrics based on current DOM state
  const calculateMetrics = () => {
    if (!triggerRefs.current) return
    const trigger = triggerRefs.current[activeIndex]
    if (!trigger) return
    const newMetrics = {
      left: trigger.offsetLeft,
      width: trigger.offsetWidth,
    }
    // Store previous metrics before updating (read from ref to avoid stale closure)
    prevMetricsRef.current = { ...metricsRef.current }
    setMetrics(newMetrics)
  }

  // Initial calculation + when activeIndex changes
  useLayoutEffect(() => {
    if (!triggerRefs.current) return
    const trigger = triggerRefs.current[activeIndex]
    if (!trigger) return

    const newMetrics = {
      left: trigger.offsetLeft,
      width: trigger.offsetWidth,
    }

    if (isFirstRenderRef.current) {
      // On first render, set without animation
      isFirstRenderRef.current = false
      prevMetricsRef.current = newMetrics
      setMetrics(newMetrics)
    } else {
      // Store current metrics as previous before updating
      prevMetricsRef.current = { ...metrics }
      setMetrics(newMetrics)
    }
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

  return {
    ...metrics,
    initialLeft: prevMetricsRef.current.left,
    initialWidth: prevMetricsRef.current.width,
  }
}
