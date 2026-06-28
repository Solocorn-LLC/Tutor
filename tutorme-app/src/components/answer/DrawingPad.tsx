'use client'

import { useEffect, useRef } from 'react'

interface DrawingPadProps {
  /** Existing PNG data URL to restore (when the student already drew something). */
  value?: string
  /** Called with the PNG data URL after each stroke (empty string when cleared). */
  onChange: (dataUrl: string) => void
  onInteract?: () => void
  className?: string
}

/**
 * A lightweight pen/mouse/touch drawing surface for written answers (e.g. maths
 * working). Emits a PNG data URL so the answer can be submitted and graded like
 * any other answer value.
 */
export function DrawingPad({ value, onChange, onInteract, className = '' }: DrawingPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  // Size the canvas to its rendered box (device-pixel aware) and restore any
  // existing drawing. Runs once on mount.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.2
    ctx.strokeStyle = '#1F2933'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    if (value && value.startsWith('data:image')) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
      img.src = value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pointFromEvent(e)
    onInteract?.()
  }

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !last.current) return
    const p = pointFromEvent(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }

  const handleUp = () => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    const url = canvasRef.current?.toDataURL('image/png')
    if (url) onChange(url)
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    onChange('')
  }

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        className="h-44 w-full touch-none rounded-md border border-gray-300 bg-white"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={handleUp}
      />
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">Write or draw with a pen, mouse, or finger.</span>
        <button
          type="button"
          onClick={handleClear}
          className="text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
