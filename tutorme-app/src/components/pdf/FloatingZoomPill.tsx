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
}

export function FloatingZoomPill({
  scale,
  onScaleChange,
  minScale = 0.5,
  maxScale = 1.5,
  onHidePreview,
  className,
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
      setIsDragging(true)
      dragStartRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      }
    },
    [position]
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return
      const pillWidth = pillRef.current?.offsetWidth ?? 56
      const pillHeight = pillRef.current?.offsetHeight ?? 200
      const margin = 8
      const maxX = window.innerWidth - pillWidth - margin
      const maxY = window.innerHeight - pillHeight - margin
      const newX = Math.max(margin, Math.min(maxX, e.clientX - dragStartRef.current.x))
      const newY = Math.max(margin, Math.min(maxY, e.clientY - dragStartRef.current.y))
      setPosition({ x: newX, y: newY })
    },
    [isDragging]
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
        'fixed z-50 flex flex-col items-center gap-2 rounded-xl border border-white/20 bg-white/10 p-2.5 shadow-lg backdrop-blur-md transition-shadow',
        isDragging ? 'cursor-grabbing shadow-xl' : 'cursor-default',
        className
      )}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        right: '16px',
        top: '50%',
        marginTop: '-100px',
      }}
    >
      {/* Grab handle — four dots */}
      <div
        className="flex cursor-grab flex-col items-center gap-1 py-1 active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        title="Drag to move"
      >
        <div className="grid grid-cols-2 gap-0.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-1 w-1 rounded-full bg-white/60" />
          ))}
        </div>
      </div>

      {/* Vertical zoom slider */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] font-medium text-white/80">{Math.round(scale * 100)}%</span>
        <div className="relative h-24 w-6">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={sliderPercent}
            onChange={handleSliderChange}
            className="absolute inset-0 h-24 w-6 cursor-pointer appearance-none rounded-full bg-white/20 outline-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.3)]"
            style={{
              writingMode: 'vertical-lr',
              direction: 'rtl',
            }}
          />
        </div>
      </div>

      {/* Hide Preview arrow */}
      {onHidePreview && (
        <button
          onClick={onHidePreview}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/20 hover:text-white"
          title="Hide Preview"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      )}
    </div>
  )
}
