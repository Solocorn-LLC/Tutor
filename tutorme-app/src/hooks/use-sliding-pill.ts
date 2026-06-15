import { useLayoutEffect, useState, useEffect, type RefObject } from 'react'

export function useSlidingPillMetrics(
  triggerRefs: RefObject<(HTMLElement | null)[]>,
  activeIndex: number
) {
  const [metrics, setMetrics] = useState({ left: 0, width: 0 })

  useLayoutEffect(() => {
    if (!triggerRefs.current) return
    const trigger = triggerRefs.current[activeIndex]
    if (!trigger) return
    setMetrics({
      left: trigger.offsetLeft,
      width: trigger.offsetWidth,
    })
  }, [activeIndex, triggerRefs])

  useEffect(() => {
    const handleResize = () => {
      if (!triggerRefs.current) return
      const trigger = triggerRefs.current[activeIndex]
      if (!trigger) return
      setMetrics({
        left: trigger.offsetLeft,
        width: trigger.offsetWidth,
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeIndex, triggerRefs])

  return metrics
}
