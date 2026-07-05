'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface FloatingZoomPillProps {
  scale: number
  onScaleChange: (scale: number) => void
  minScale?: number
  maxScale?: number
  onHidePreview?: () => void
  className?: string
  containerRef?: React.RefObject<HTMLElement | null>
  fixed?: boolean
}

export function FloatingZoomPill({
  scale,
  onScaleChange,
  minScale = 0.5,
  maxScale = 1.5,
  onHidePreview,
  className,
  containerRef,
  fixed = false,
}: FloatingZoomPillProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const pillRef = useRef<HTMLDivElement>(null)

  // Convert scale (0.5-1.5) to slider percentage (0-100)
  const scaleToPercent = useCallback(
    (s: number) => ((s - minScale) / (maxScale - minScale)) * 100,
    [minScale, maxScale]
  )

  // Convert slider percentage (0-100) to scale (0.5-1.5)
  const percentToScale = useCallback(
    (p: number) => minScale + (p / 100) * (maxScale - minScale),
    [minScale, maxScale]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (fixed) return
      setIsDragging(true)
      dragStartRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      }
    },
    [position, fixed]
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || fixed) return
      const pillWidth = pillRef.current?.offsetWidth ?? 50
      const pillHeight = pillRef.current?.offsetHeight ?? 180
      const margin = 8
      const container = containerRef?.current
      let maxX: number
      let maxY: number
      if (container) {
        const rect = container.getBoundingClientRect()
        maxX = rect.width - pillWidth - margin
        maxY = rect.height - pillHeight - margin
      } else {
        maxX = window.innerWidth - pillWidth - margin
        maxY = window.innerHeight - pillHeight - margin
      }
      const newX = Math.max(margin, Math.min(maxX, e.clientX - dragStartRef.current.x))
      const newY = Math.max(margin, Math.min(maxY, e.clientY - dragStartRef.current.y))
      setPosition({ x: newX, y: newY })
    },
    [isDragging, containerRef, fixed]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const percent = parseFloat(e.target.value)
    onScaleChange(percentToScale(percent))
  }

  const sliderPercent = scaleToPercent(scale)

  return (
    <div
      ref={pillRef}
      className={cn(
        'absolute z-50 flex flex-col items-center gap-2 rounded-xl border border-white/20 bg-white/10 p-2 shadow-lg backdrop-blur-md transition-shadow',
        isDragging ? 'cursor-grabbing shadow-xl' : 'cursor-default',
        className
      )}
      style={{
        transform: fixed ? undefined : `translate(${position.x}px, ${position.y}px)`,
        right: '16px',
        bottom: '16px',
      }}
    >
      {/* Zoom percentage with space above */}
      <div className="mt-1 flex flex-col items-center gap-1">
        <span className="text-[10px] font-medium text-gray-700">{Math.round(scale * 100)}%</span>
        <div className="relative h-24 w-4">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={sliderPercent}
            onChange={handleSliderChange}
            className="absolute inset-0 h-24 w-4 cursor-pointer appearance-none rounded-full bg-gray-500/30 outline-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.3)]"
            style={{
              writingMode: 'vertical-lr',
              direction: 'rtl',
            }}
          />
        </div>
      </div>

      {/* Reset zoom button */}
      <button
        onClick={() => onScaleChange(1.0)}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-700"
        title="Reset Zoom"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </button>
    </div>
  )
}
